import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Search,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Plus,
  ArrowUpDown,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Project, hasProjectManagementAccess } from "../types";
import { PROJECT_STAGES, STAGE_LABELS } from "../constants";
import { ProjectDetails } from "./ProjectDetails";
import { NewProjectDialog } from "./NewProjectDialog";
import { useNotifications } from "../contexts/NotificationContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useUser } from "../contexts/UserContext";
import { Sheet, SheetContent } from "./ui/sheet";
import { ConfirmDialog } from "./ConfirmDialog";
import { toast } from "sonner";
import { format, parseISO, isValid } from "date-fns";
import { getInitials, cn } from "../lib/utils";
import { useTheme } from "../contexts/ThemeContext";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "N/A";
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, "MMM d, yyyy") : "N/A";
  } catch {
    return "N/A";
  }
};

interface ProjectListProps {
  employeeView?: boolean;
  onProjectClick?: (project: Project, tab?: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
  employeeView,
  onProjectClick,
}) => {
  const { user } = useUser();
  const { addNotification } = useNotifications();
  const { t, translateData } = useLanguage();
  const { getDashboardColors } = useTheme();
  const themeColors = getDashboardColors();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Delete confirmation state
  const [projectIdToDelete, setProjectIdToDelete] = useState<string | null>(
    null,
  );
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Sorting state
  const [sortField, setSortField] = useState<keyof Project>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Column filters
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [assignedFilter, setAssignedFilter] = useState<string>("All");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("projects").select("*");

      if (error) {
        throw error;
      }

      let finalProjects = data || [];

      // Fetch checklists to calculate execution plan progress
      const { data: checklistsData } = await supabase
        .from("project_checklists")
        .select("project_id, is_completed");

      if (checklistsData) {
        const progressMap: Record<
          string,
          { total: number; completed: number }
        > = {};
        checklistsData.forEach((item) => {
          if (!progressMap[item.project_id]) {
            progressMap[item.project_id] = { total: 0, completed: 0 };
          }
          progressMap[item.project_id].total++;
          if (item.is_completed) {
            progressMap[item.project_id].completed++;
          }
        });

        finalProjects = finalProjects.map((p) => {
          const stats = progressMap[p.id];
          if (stats && stats.total > 0) {
            return {
              ...p,
              progress: Math.round((stats.completed / stats.total) * 100),
            };
          }
          return { ...p, progress: 0 };
        });
      }

      setProjects(finalProjects);
    } catch (err: any) {
      console.error("Error fetching projects:", err);
      toast.error(`Failed to load projects: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectIdToDelete) return;

    try {
      const projectToDelete = projects.find((p) => p.id === projectIdToDelete);

      // Attempt to delete from related tables first to avoid foreign key constraint errors
      const childTables = [
        "audit_logs",
        "comments",
        "payment_stages",
        "project_checklists",
        "project_files",
        "tasks",
        "vendor_orders",
        "notifications",
      ];

      for (const table of childTables) {
        // We ignore errors here as some tables might not exist or be empty
        await supabase
          .from(table)
          .delete()
          .eq("project_id", projectIdToDelete)
          .then(({ error }) => {
            if (error)
              console.warn(`Could not delete related ${table}:`, error);
          });
      }

      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectIdToDelete);
      if (error) {
        throw new Error(
          error.message ||
            "Failed to delete project due to database constraint.",
        );
      }

      if (projectToDelete) {
        await addNotification(
          "Project Deleted",
          `Project "${projectToDelete.name}" has been deleted.`,
        );
      }

      toast.success("Project deleted successfully");
      fetchProjects();
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      toast.error(err.message || "Failed to delete project");
    } finally {
      setProjectIdToDelete(null);
    }
  };

  const handleSort = (field: keyof Project) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const filteredAndSortedProjects = projects
    .filter((p) => {
      const matchesSearch =
        (p.name?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
        (p.client_name?.toLowerCase() || "").includes(
          searchQuery.toLowerCase(),
        ) ||
        (p.assigned_to?.toLowerCase() || "").includes(
          searchQuery.toLowerCase(),
        );

      const matchesStatus = statusFilter === "All" || p.status === statusFilter;
      const matchesAssigned =
        assignedFilter === "All" || p.assigned_to === assignedFilter;

      return matchesSearch && matchesStatus && matchesAssigned;
    })
    .sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      return 0;
    });

  const uniqueStatuses = [
    "All",
    ...Array.from(new Set(projects.map((p) => p.status))),
  ];
  const uniqueAssignees = [
    "All",
    ...Array.from(new Set(projects.map((p) => p.assigned_to).filter(Boolean))),
  ];

  const SortIcon = ({ field }: { field: keyof Project }) => {
    if (sortField !== field)
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortOrder === "asc" ? (
      <ChevronUp className="w-3 h-3 ml-1 text-indigo-600" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-1 text-indigo-600" />
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative w-full group">
            <Search
              className={cn(
                "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-colors",
                `group-focus-within:${themeColors.text}`,
              )}
            />
            <Input
              placeholder={t("search_projects")}
              className={cn(
                "pl-10 bg-white dark:bg-[#121212] dark:border-white/10 dark:text-zinc-100 border-slate-200 rounded-2xl h-11 focus:ring-2 transition-all",
                `focus:ring-[${themeColors.solid}]/20`,
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        {hasProjectManagementAccess(user?.role) && (
          <Button
            onClick={() => setIsNewDialogOpen(true)}
            className={cn(
              "rounded-2xl shadow-sm dark:shadow-none h-11 px-6 font-bold text-sm transition-all active:scale-95 text-white",
              themeColors.solid,
              themeColors.solidHover,
            )}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("add_project")}
          </Button>
        )}
      </div>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 lg:hidden">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-[#121212] p-6 rounded-3xl border border-slate-100 dark:border-white/10 animate-pulse space-y-4"
            >
              <div className="h-6 bg-slate-100 dark:bg-white/5 rounded-lg w-3/4" />
              <div className="h-4 bg-slate-50 dark:bg-white/5 rounded-lg w-1/2" />
              <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full w-full" />
            </div>
          ))
        ) : filteredAndSortedProjects.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-[#121212] rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              {t("no_projects_found")}
            </p>
          </div>
        ) : (
          filteredAndSortedProjects.map((project) => (
            <Card
              key={project.id}
              onClick={() => {
                if (onProjectClick) {
                  onProjectClick(project);
                } else {
                  setSelectedProject(project);
                  setIsDetailsOpen(true);
                }
              }}
              className="border-none shadow-sm dark:bg-[#121212] dark:border dark:border-white/10 hover:shadow-md transition-all active:scale-[0.98] cursor-pointer overflow-hidden rounded-3xl"
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-4">
                  {project.logo_url ? (
                    <img
                      src={project.logo_url}
                      alt="Logo"
                      className="w-12 h-12 rounded-2xl object-contain shadow-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-[#121212] dark:border dark:border-white/10 flex items-center justify-center text-slate-500 font-bold text-lg shrink-0">
                      {project.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col justify-between h-12">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-zinc-100 tracking-tight truncate flex-1 leading-tight">
                        {translateData(project.name)}
                      </h3>
                      <Badge
                        variant="secondary"
                        className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter shrink-0 mb-auto"
                      >
                        {translateData(STAGE_LABELS[project.status])}
                      </Badge>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                      {translateData(project.client_name)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-4 pt-2 border-t border-slate-50 dark:border-white/5">
                  <div className="flex items-end justify-between">
                    <div className="space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-0.5 text-left">
                        Deadline & Assigned
                      </p>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-6 w-6 border-2 border-white dark:border-[#121212] shadow-sm">
                          <AvatarFallback className="bg-indigo-600 text-white font-bold text-[8px]">
                            {getInitials(
                              project.assigned_to || t("unassigned"),
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate max-w-[90px]">
                            {project.assigned_to
                              ? translateData(project.assigned_to)
                              : t("unassigned")}
                          </span>
                          <span className="text-[9px] font-medium text-slate-400 tracking-wider">
                            {STAGE_LABELS[project.status] === "Handover"
                              ? formatDate(
                                  project.completed_at || project.deadline,
                                )
                              : formatDate(project.deadline)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end gap-1.5 pb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Progress
                        </span>
                        <span className="text-[11px] font-black text-slate-900 dark:text-slate-100">
                          {project.progress}%
                        </span>
                      </div>
                      <div className="w-24 bg-slate-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="bg-indigo-600 h-full"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full pt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (onProjectClick) {
                          onProjectClick(project);
                        } else {
                          setSelectedProject(project);
                          setIsDetailsOpen(true);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-xl font-medium text-sm transition-colors"
                      title="View Project"
                    >
                      <Eye className="w-4 h-4" /> View Details
                    </button>
                    {hasProjectManagementAccess(user?.role) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setProjectIdToDelete(project.id);
                          setIsDeleteDialogOpen(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded-xl font-medium text-sm transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block bg-white dark:bg-[#121212] rounded-[32px] border border-slate-100 dark:border-white/10 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-[#181818]">
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-white/10">
                <TableHead
                  className="font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-[10px] whitespace-nowrap cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center">
                    {t("project_name")} <SortIcon field="name" />
                  </div>
                </TableHead>
                <TableHead
                  className="font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-[10px] whitespace-nowrap hidden md:table-cell cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  onClick={() => handleSort("client_name")}
                >
                  <div className="flex items-center">
                    {t("client_name")} <SortIcon field="client_name" />
                  </div>
                </TableHead>
                <TableHead className="font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-[10px] whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    {t("status")}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 rounded-md hover:bg-slate-200 dark:hover:bg-[#121212]"
                          >
                            <Filter
                              className={cn(
                                "w-3 h-3",
                                statusFilter !== "All"
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-slate-400 dark:text-zinc-500",
                              )}
                            />
                          </Button>
                        }
                      />
                      <DropdownMenuContent
                        align="start"
                        className="rounded-xl dark:bg-[#121212] dark:border-white/10"
                      >
                        {uniqueStatuses.map((status) => (
                          <DropdownMenuItem
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className="dark:text-zinc-300 dark:hover:bg-[#181818] dark:hover:text-zinc-100"
                          >
                            <span
                              className={cn(
                                statusFilter === status &&
                                  "font-bold text-indigo-600 dark:text-indigo-400",
                              )}
                            >
                              {status === "All"
                                ? t("all_projects")
                                : translateData(
                                    STAGE_LABELS[status as any] || status,
                                  )}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead className="font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-[10px] whitespace-nowrap hidden sm:table-cell">
                  <div className="flex items-center gap-2">
                    {t("assigned_to")}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 rounded-md hover:bg-slate-200 dark:hover:bg-[#121212]"
                          >
                            <Filter
                              className={cn(
                                "w-3 h-3",
                                assignedFilter !== "All"
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-slate-400 dark:text-zinc-500",
                              )}
                            />
                          </Button>
                        }
                      />
                      <DropdownMenuContent
                        align="start"
                        className="rounded-xl dark:bg-[#121212] dark:border-white/10"
                      >
                        {uniqueAssignees.map((assignee) => (
                          <DropdownMenuItem
                            key={assignee}
                            onClick={() => setAssignedFilter(assignee)}
                            className="dark:text-zinc-300 dark:hover:bg-[#181818] dark:hover:text-zinc-100"
                          >
                            <span
                              className={cn(
                                assignedFilter === assignee &&
                                  "font-bold text-indigo-600 dark:text-indigo-400",
                              )}
                            >
                              {assignee === "All"
                                ? t("all")
                                : translateData(assignee)}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableHead>
                <TableHead
                  className="font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-[10px] whitespace-nowrap hidden lg:table-cell cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  onClick={() => handleSort("deadline")}
                >
                  <div className="flex items-center">
                    {t("deadline")} <SortIcon field="deadline" />
                  </div>
                </TableHead>
                <TableHead
                  className="font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest text-[10px] whitespace-nowrap cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  onClick={() => handleSort("progress")}
                >
                  <div className="flex items-center">
                    {t("progress")} <SortIcon field="progress" />
                  </div>
                </TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
                      <p className="text-xs font-bold uppercase tracking-widest">
                        Loading projects...
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedProjects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Search className="w-8 h-8 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest">
                        {t("no_projects_found")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="hover:bg-indigo-50/30 dark:hover:bg-[#181818] border-slate-50 dark:border-white/5 group cursor-pointer transition-colors"
                    onClick={() => {
                      if (onProjectClick) {
                        onProjectClick(project);
                      } else {
                        setSelectedProject(project);
                        setIsDetailsOpen(true);
                      }
                    }}
                  >
                    <TableCell className="py-5 px-6">
                      <div className="flex items-center gap-3">
                        {project.logo_url ? (
                          <img
                            src={project.logo_url}
                            alt="Logo"
                            className="w-9 h-9 rounded-xl object-contain shadow-sm border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] group-hover:border-indigo-200 dark:group-hover:border-indigo-500/50 transition-all"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#121212] dark:border dark:border-white/10 flex items-center justify-center text-slate-500 font-bold text-xs group-hover:bg-indigo-600 dark:group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            {project.name.charAt(0)}
                          </div>
                        )}
                        <span className="font-bold text-slate-900 dark:text-zinc-100 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {translateData(project.name)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest whitespace-nowrap hidden md:table-cell">
                      {translateData(project.client_name)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20 rounded-full px-3 py-0.5 text-[9px] font-black uppercase tracking-tighter whitespace-nowrap"
                      >
                        {translateData(STAGE_LABELS[project.status])}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <Avatar className="h-7 w-7 border-2 border-white dark:border-white/10 shadow-sm">
                          <AvatarFallback className="bg-indigo-600 text-white font-bold text-[9px]">
                            {getInitials(
                              project.assigned_to || t("unassigned"),
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                          {project.assigned_to
                            ? translateData(project.assigned_to)
                            : t("unassigned")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest whitespace-nowrap hidden lg:table-cell">
                      {STAGE_LABELS[project.status] === "Handover"
                        ? formatDate(project.completed_at || project.deadline)
                        : formatDate(project.deadline)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-4 whitespace-nowrap">
                        <div className="w-24 bg-slate-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-indigo-600 h-full transition-all duration-1000"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-slate-900 dark:text-zinc-100 tracking-tighter">
                          {project.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-6">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (onProjectClick) {
                              onProjectClick(project);
                            } else {
                              setSelectedProject(project);
                              setIsDetailsOpen(true);
                            }
                          }}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {hasProjectManagementAccess(user?.role) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setProjectIdToDelete(project.id);
                              setIsDeleteDialogOpen(true);
                            }}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete Project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <NewProjectDialog
        open={isNewDialogOpen}
        onOpenChange={setIsNewDialogOpen}
        onSuccess={fetchProjects}
      />

      <Sheet
        open={isDetailsOpen}
        onOpenChange={(open) => {
          setIsDetailsOpen(open);
          if (!open) setIsMaximized(false);
        }}
      >
        <SheetContent
          className={cn(
            "w-full p-0 border-l-slate-200 shadow-2xl transition-all duration-500 ease-in-out",
            isMaximized ? "sm:max-w-[100vw]" : "sm:max-w-[85vw]",
          )}
        >
          {selectedProject && (
            <ProjectDetails
              project={selectedProject}
              onClose={() => setIsDetailsOpen(false)}
              onUpdate={fetchProjects}
              isMaximized={isMaximized}
              onToggleMaximize={() => setIsMaximized(!isMaximized)}
            />
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        description="Are you sure you want to delete this project? This action cannot be undone and all associated data will be removed."
      />
    </div>
  );
};
