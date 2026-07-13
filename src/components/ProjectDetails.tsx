import React, { useState, useEffect } from "react";
import {
  X,
  MessageSquare,
  History,
  CreditCard,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  Image as ImageIcon,
  FileText,
  Edit,
  TrendingUp,
  Plus,
  CheckCircle2 as CheckIcon,
  Circle,
  Trash2 as TrashIcon,
  ListTodo,
  Maximize2,
  Minimize2,
  RefreshCw,
  Briefcase,
  User as UserIcon,
  Calendar as CalendarIcon,
  Paperclip,
  CheckIcon as CheckSmallIcon,
  Upload,
} from "lucide-react";
import {
  Project,
  Comment,
  AuditLog,
  PaymentStage,
  Task,
  hasProjectManagementAccess,
  hasAdminAccess,
  hasFinanceAccess,
  hasAuditLogAccess,
  isLimitedUser,
} from "../types";
import { supabase } from "../lib/supabase";
import { useUser } from "../contexts/UserContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "./ui/button";
import { cn, getInitials } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProjectVendorOrders } from "./ProjectVendorOrders";
import { toast } from "sonner";
import { format, parseISO, isValid } from "date-fns";
import { PROJECT_STAGES, TASK_TEMPLATES, STAGE_LABELS } from "../constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { KanbanBoard } from "./KanbanBoard";
import { CalendarView } from "./CalendarView";
import { Lightbulb } from "lucide-react";
import { ProjectChecklist } from "./ProjectChecklist";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "./ui/dialog";
import { DrawingsTracker } from "./DrawingsTracker";
import { ImageCropperDialog } from "./ImageCropperDialog";
import { ProjectExpenses } from "./ProjectExpenses";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "N/A";
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, "MMM d, yyyy") : "N/A";
  } catch {
    return "N/A";
  }
};

import { PaymentStageHistory } from "./PaymentStageHistory";
import { useTheme } from "../contexts/ThemeContext";

interface ProjectDetailsProps {
  project: Project;
  onClose: () => void;
  onUpdate: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  initialTab?: string;
}

export const ProjectDetails: React.FC<ProjectDetailsProps> = ({
  project,
  onClose,
  onUpdate,
  isMaximized = false,
  onToggleMaximize,
  initialTab = "activity",
}) => {
  const { user, allUsers } = useUser();
  const { addNotification } = useNotifications();
  const { t, translateData: rawTranslateData } = useLanguage();

  const translateData = (data: any) => {
    if (!data) return "";
    return rawTranslateData(data);
  };
  const [comments, setComments] = useState<Comment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [paymentStages, setPaymentStages] = useState<PaymentStage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [newStageAmount, setNewStageAmount] = useState("");
  const [newStageDueDate, setNewStageDueDate] = useState("");
  const [newComment, setNewComment] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [commentType, setCommentType] = useState<"internal" | "client">(
    "internal",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isCropOpen, setIsCropOpen] = React.useState(false);
  const [cropImageSrc, setCropImageSrc] = React.useState("");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo file size must be less than 2MB");
      return;
    }

    try {
      const { fileToBase64 } = await import("../lib/utils");
      const base64 = await fileToBase64(file);
      setCropImageSrc(base64);
      setIsCropOpen(true);
    } catch (err) {
      toast.error("Failed to process image");
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    setEditData((prev) => ({ ...prev, logo_url: croppedBase64 }));
    setCropImageSrc("");
  };

  // File upload state
  const [newFileName, setNewFileName] = useState("");
  const [newFileDescription, setNewFileDescription] = useState("");
  const [newFileUrl, setNewFileUrl] = useState("");
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [checklistProgress, setChecklistProgress] = useState(0);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Scroll to top when project changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [project.id]);

  // Delete confirmation state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTaskDeleteDialogOpen, setIsTaskDeleteDialogOpen] = useState(false);
  const [taskIdToDelete, setTaskIdToDelete] = useState<string | null>(null);

  // Task Audit state
  const [isTaskAuditDialogOpen, setIsTaskAuditDialogOpen] = useState(false);
  const [taskToAudit, setTaskToAudit] = useState<Task | null>(null);
  const [taskAuditComment, setTaskAuditComment] = useState("");
  const [taskAuditFileUrl, setTaskAuditFileUrl] = useState("");
  const [taskAuditAssignee, setTaskAuditAssignee] = useState("");
  const [isSubmittingTaskAudit, setIsSubmittingTaskAudit] = useState(false);

  const [takeOverTask, setTakeOverTask] = useState<Task | null>(null);
  const [takeOverReason, setTakeOverReason] = useState("");
  const [isTakingOver, setIsTakingOver] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    name: project.name,
    client_name: project.client_name,
    description: project.description || "",
    progress: project.progress,
    status: project.status,
    deadline: project.deadline || "",
    assigned_to: project.assigned_to || "",
  });

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val)) {
      setEditData({ ...editData, progress: Math.min(100, Math.max(0, val)) });
    }
  };

  const notifyAssignee = async (action: string) => {
    if (!user) return;

    const assigneeNameOrId = project.assigned_to;
    if (!assigneeNameOrId) return;

    const assignee = allUsers.find(
      (u) => u.full_name === assigneeNameOrId || u.id === assigneeNameOrId,
    );

    // Don't notify if the person making the change is the assignee
    if (assignee && assignee.id !== user.id) {
      await addNotification(
        "Project Update",
        `${user.full_name} ${action} on project "${project.name}"`,
        assignee.id,
      );
    }
  };

  useEffect(() => {
    fetchDetails();
    setEditData({
      name: project.name,
      client_name: project.client_name,
      description: project.description || "",
      progress: project.progress,
      status: project.status,
      deadline: project.deadline || "",
      assigned_to: project.assigned_to || "",
    });
  }, [project.id]);

  const handleUpdateProject = async () => {
    try {
      const finalAssignee =
        editData.assigned_to === "Unassigned" ? null : editData.assigned_to;
      const { error } = await supabase
        .from("projects")
        .update({
          ...editData,
          assigned_to: finalAssignee,
          last_updated: new Date().toISOString(),
        })
        .eq("id", project.id);

      if (error) {
        console.error("Supabase update project error:", error);
        throw error;
      }

      await addNotification(
        "Project Updated",
        `Project "${editData.name}" has been updated by ${user?.full_name}.`,
      );
      await notifyAssignee("updated project details");

      toast.success("Project updated");

      // Log change
      await supabase.from("audit_logs").insert({
        project_id: project.id,
        user_id: user?.id,
        user_name: user?.full_name,
        action: "Project Update",
        details: `Updated project details: ${Object.keys(editData).join(", ")}`,
        created_at: new Date().toISOString(),
      });

      setIsEditing(false);
      onUpdate();
    } catch (err: any) {
      console.error("Failed to update project:", err);
      toast.error(
        `Failed to update project: ${err.message || "Unknown error"}`,
      );
    }
  };

  const fetchDetails = async () => {
    try {
      const [
        commentsRes,
        logsRes,
        paymentsRes,
        tasksRes,
        filesRes,
        checklistsRes,
      ] = await Promise.all([
        supabase
          .from("comments")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("audit_logs")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("payment_stages")
          .select("*")
          .eq("project_id", project.id)
          .order("due_date", { ascending: true }),
        supabase
          .from("tasks")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("project_files")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_checklists")
          .select("is_completed")
          .eq("project_id", project.id),
      ]);

      setComments(commentsRes.data || []);
      setAuditLogs(logsRes.data || []);
      setPaymentStages(paymentsRes.data || []);
      setTasks(tasksRes.data || []);
      setFiles(filesRes.data || []);

      const checklists = checklistsRes.data || [];
      if (checklists.length > 0) {
        const completed = checklists.filter((c) => c.is_completed).length;
        setChecklistProgress(Math.round((completed / checklists.length) * 100));
      } else {
        setChecklistProgress(0);
      }
    } catch (err) {
      console.error("Error fetching details:", err);
    }
  };

  const handleAddFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim() || !newFileUrl.trim() || !user) return;

    setIsAddingFile(true);
    try {
      const { error } = await supabase.from("project_files").insert({
        project_id: project.id,
        name: newFileName,
        description: newFileDescription,
        url: newFileUrl,
        uploaded_by: user.id,
      });

      if (error) throw error;

      toast.success("File added successfully");
      setNewFileName("");
      setNewFileDescription("");
      setNewFileUrl("");
      fetchDetails();

      // Log change
      await supabase.from("audit_logs").insert({
        project_id: project.id,
        user_id: user.id,
        user_name: user.full_name,
        action: "File Added",
        details: `Added file: ${newFileName}`,
        created_at: new Date().toISOString(),
      });

      notifyAssignee("added a new file to");
    } catch (err: any) {
      console.error("Error adding file:", err);
      toast.error(`Failed to add file: ${err.message}`);
    } finally {
      setIsAddingFile(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const { error } = await supabase.from("tasks").insert({
        project_id: project.id,
        title: newTaskTitle,
        description: newTaskDescription || null,
        assigned_to: newTaskAssignee || null,
        deadline: newTaskDeadline || null,
        status: "Todo",
        priority: "Medium",
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.error("Supabase error adding task:", error);
        throw error;
      }
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskAssignee("");
      setNewTaskDeadline("");
      fetchDetails();
      await notifyAssignee("added a new task");
      toast.success("Task added");
    } catch (err: any) {
      console.error("Failed to add task:", err);
      toast.error(`Failed to add task: ${err.message || "Unknown error"}`);
    }
  };

  const handleAddTemplateTask = (title: string) => {
    setNewTaskTitle(title);
    toast.info(`Title set to: ${title}. You can now add more details.`);
  };

  const toggleTaskStatus = async (
    task: Task,
    forcedStatus?: Task["status"],
  ) => {
    const isCompleting = forcedStatus
      ? forcedStatus === "Completed"
      : task.status !== "Completed";
    const newStatus = forcedStatus || (isCompleting ? "Completed" : "Todo");
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: newStatus,
          completed_at: isCompleting ? new Date().toISOString() : null,
        })
        .eq("id", task.id);

      if (error) throw error;
      fetchDetails();
      await notifyAssignee("updated a task status");
    } catch (err) {
      toast.error("Failed to update task");
    }
  };

  const deleteTask = async () => {
    if (!taskIdToDelete) return;
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskIdToDelete);
      if (error) throw error;
      fetchDetails();
      await notifyAssignee("deleted a task");
      toast.success("Task deleted");
    } catch (err) {
      toast.error("Failed to delete task");
    } finally {
      setTaskIdToDelete(null);
      setIsTaskDeleteDialogOpen(false);
    }
  };

  const handleRequestAssignment = async (task: Task) => {
    try {
      const requestMsg = `[Assignment Request] User ${user?.full_name} has requested to work on this task (Pending Lead/Admin Approval).`;
      const currentComment = task.comment
        ? `${task.comment}\n\n${requestMsg}`
        : requestMsg;

      const { error } = await supabase
        .from("tasks")
        .update({
          comment: currentComment,
        })
        .eq("id", task.id);

      if (error) throw error;

      // Notify the project assignee
      const assigneeNameOrId = project.assigned_to;
      if (assigneeNameOrId) {
        const assignee = allUsers.find(
          (u) => u.full_name === assigneeNameOrId || u.id === assigneeNameOrId,
        );
        if (assignee && assignee.id !== user?.id) {
          await addNotification(
            "Task Assignment Request",
            `${user?.full_name} has requested to work on task "${task.title}" in project "${project.name}".`,
            assignee.id,
          );
        }
      }

      toast.success("Assignment request sent for lead approval");
      fetchDetails();
    } catch (err) {
      toast.error("Failed to request assignment");
    }
  };

  const handleSelfAssignSubmit = async () => {
    if (!takeOverTask || !user?.full_name) return;
    setIsTakingOver(true);
    try {
      const timestamp = new Date().toLocaleString();
      const takeOverMsg = `[${timestamp}] Task taken over by ${user.full_name}${takeOverReason ? ` - Reason: ${takeOverReason}` : ""}.`;
      const currentComment = takeOverTask.comment
        ? `${takeOverTask.comment}\n\n${takeOverMsg}`
        : takeOverMsg;

      const { error } = await supabase
        .from("tasks")
        .update({
          assigned_to: user.full_name,
          comment: currentComment,
        })
        .eq("id", takeOverTask.id);

      if (error) throw error;
      toast.success(`Task reassigned to you`);
      setTakeOverTask(null);
      setTakeOverReason("");
      fetchDetails();
    } catch (err) {
      toast.error("Failed to reassign task");
    } finally {
      setIsTakingOver(false);
    }
  };

  const handleSelfAssign = (task: Task) => {
    setTakeOverReason("");
    setTakeOverTask(task);
  };

  const handleSaveTaskAudit = async () => {
    if (!taskToAudit) return;
    setIsSubmittingTaskAudit(true);
    try {
      const finalAttachmentUrl =
        taskAuditFileUrl === "none" ? null : taskAuditFileUrl || null;
      const finalAssignee =
        taskAuditAssignee === "Unassigned" ? null : taskAuditAssignee;

      let newComment = taskToAudit.comment || "";
      const parts = [];
      const timestamp = new Date().toLocaleString();

      if (taskAuditComment.trim()) {
        parts.push(
          `[${timestamp}] ${user?.full_name}: ${taskAuditComment.trim()}`,
        );
      }

      if (taskToAudit.assigned_to !== finalAssignee) {
        parts.push(
          `[${timestamp}] Assigned to ${finalAssignee || "Unassigned"} by ${user?.full_name}`,
        );
      }

      if (parts.length > 0) {
        newComment = newComment
          ? `${newComment}\n\n${parts.join("\n")}`
          : parts.join("\n");
      }

      const { error } = await supabase
        .from("tasks")
        .update({
          comment: newComment || null,
          attachment_url: finalAttachmentUrl,
          assigned_to: finalAssignee,
        })
        .eq("id", taskToAudit.id);

      if (error) {
        if (error.code === "PGRST204") {
          toast.error(
            "Database missing 'comment' column on tasks. Admin needs to run migration SQL.",
          );
        } else {
          throw error;
        }
      } else {
        toast.success("Task updated with audit info");
        setIsTaskAuditDialogOpen(false);
        fetchDetails();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update task audit");
    } finally {
      setIsSubmittingTaskAudit(false);
    }
  };

  const handleCommentChange = (text: string) => {
    setNewComment(text);
    const lastWord = text.split(/\s/).pop() || "";
    if (lastWord.startsWith("@")) {
      setShowMentions(true);
      setMentionSearch(lastWord.slice(1).toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (userName: string) => {
    const words = newComment.split(/\s/);
    words.pop();
    const newText = [...words, `@[${userName}] `].join(" ");
    setNewComment(newText);
    setShowMentions(false);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("comments").insert({
        project_id: project.id,
        author: user.full_name,
        text: newComment,
        type: commentType,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Handle mentions
      const mentionedUserIds = new Set<string>();

      // 1. Explicit mentions using @[Name]
      const explicitMentions = newComment.match(/@\[([^\]]+)\]/g) || [];
      for (const mention of explicitMentions) {
        const name = mention.slice(2, -1).trim().toLowerCase();
        const mentionedUser = allUsers.find(
          (u) => u.full_name.trim().toLowerCase() === name,
        );
        if (mentionedUser) {
          mentionedUserIds.add(mentionedUser.id);
        }
      }

      // 2. Implicit mentions using @Name
      for (const u of allUsers) {
        const name = u.full_name.trim();
        // Escape special characters in name
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`@${escapedName}(?:\\b|\\s|$)`, "i");
        if (regex.test(newComment)) {
          mentionedUserIds.add(u.id);
        }
      }

      for (const userId of mentionedUserIds) {
        await addNotification(
          "You were tagged",
          `${user.full_name} tagged you in a comment on project "${project.name}"`,
          userId,
        );
      }

      setNewComment("");
      setCommentType("internal");
      fetchDetails();
      await notifyAssignee("added a comment");
      toast.success("Comment added");
    } catch (err) {
      console.error("Error adding comment:", err);
      toast.error("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updatePaymentReceived = async (
    stageId: string,
    amount: number,
    date?: string,
  ) => {
    try {
      const stage = paymentStages.find((s) => s.id === stageId);
      if (!stage) return;

      const newStatus = amount >= stage.amount ? "Paid" : "Pending";
      const receivedDate = date !== undefined ? date : null;

      // Direct update attempt
      const { error } = await supabase
        .from("payment_stages")
        .update({
          status: newStatus,
          amount_received: amount,
          received_date: receivedDate,
        })
        .eq("id", stageId);

      if (error) {
        console.error("Supabase update error:", error);
        // If it's a column missing error, we still want to update status at least
        if (
          error.message.includes("amount_received") ||
          error.message.includes("received_date")
        ) {
          await supabase
            .from("payment_stages")
            .update({ status: newStatus })
            .eq("id", stageId);
          toast.warning(
            "Payment status updated, but partial amount or date tracking is unavailable in database.",
          );
        } else {
          throw error;
        }
      } else {
        toast.success("Payment updated successfully");
      }

      fetchDetails();
      await notifyAssignee("updated payment details");
    } catch (err) {
      console.error("Error updating payment:", err);
      toast.error("Failed to update payment");
    }
  };

  const [isTogglingHold, setIsTogglingHold] = useState(false);

  const toggleHoldStatus = async () => {
    if (!project) return;
    setIsTogglingHold(true);
    try {
      const newStatus =
        project.status === "Work is on hold" ? "Discussion" : "Work is on hold"; // Default back to Discussion, the checklist will update it later if needed or they can manually update

      const { error } = await supabase
        .from("projects")
        .update({ status: newStatus })
        .eq("id", project.id);

      if (error) throw error;

      toast.success(
        `Project ${newStatus === "Work is on hold" ? "put on hold" : "resumed"}`,
      );

      await supabase.from("audit_logs").insert({
        project_id: project.id,
        user_id: user?.id,
        user_name: user?.full_name,
        action: "Status Change",
        details: `Project status changed to ${newStatus}`,
        created_at: new Date().toISOString(),
      });

      // Update local state quickly
      setEditData((prev) => ({ ...prev, status: newStatus as any }));
      onUpdate();
      fetchDetails();
    } catch (error) {
      console.error("Error toggling hold:", error);
      toast.error("Failed to change project status by hold status");
    } finally {
      setIsTogglingHold(false);
    }
  };

  const updatePaymentComments = async (
    stageId: string,
    newComments: string,
  ) => {
    try {
      const { error } = await supabase
        .from("payment_stages")
        .update({ comments: newComments })
        .eq("id", stageId);
      if (error) throw error;
      fetchDetails();
    } catch (err) {
      console.error("Error updating comments:", err);
      toast.error("Failed to update comments");
    }
  };

  const updatePaymentStatus = async (stageId: string, newStatus: string) => {
    try {
      const stage = paymentStages.find((s) => s.id === stageId);
      if (!stage) return;

      const { error } = await supabase
        .from("payment_stages")
        .update({
          status: newStatus,
          amount_received: newStatus === "Paid" ? stage.amount : 0,
        })
        .eq("id", stageId);

      if (error) throw error;
      fetchDetails();
      await notifyAssignee("updated payment status");
      toast.success("Payment status updated");
    } catch (err) {
      console.error("Error updating payment:", err);
      toast.error("Failed to update payment");
    }
  };

  const handleAddPaymentStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStageName.trim() || !newStageAmount) return;

    try {
      const insertData: any = {
        project_id: project.id,
        stage_name: newStageName,
        amount: parseFloat(newStageAmount),
        status: "Pending",
        due_date: newStageDueDate || null,
      };

      // Try to include amount_received
      insertData.amount_received = 0;

      const { error } = await supabase
        .from("payment_stages")
        .insert(insertData);

      if (error) {
        if (error.message.includes("amount_received")) {
          console.warn(
            "Column amount_received missing in payment_stages table. Falling back to simple insert.",
          );
          delete insertData.amount_received;
          const { error: fallbackError } = await supabase
            .from("payment_stages")
            .insert(insertData);
          if (fallbackError) throw fallbackError;
          toast.warning(
            "Payment stage added, but partial payment tracking is unavailable.",
          );
        } else {
          throw error;
        }
      }
      setNewStageName("");
      setNewStageAmount("");
      setNewStageDueDate("");
      fetchDetails();
      await notifyAssignee("added a payment stage");
      toast.success("Payment stage added");
    } catch (err: any) {
      console.error("Failed to add payment stage:", err);
      toast.error(
        `Failed to add payment stage: ${err.message || "Unknown error"}`,
      );
    }
  };

  const deletePaymentStage = async (id: string) => {
    try {
      const { error } = await supabase
        .from("payment_stages")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchDetails();
      await notifyAssignee("deleted a payment stage");
      toast.success("Payment stage deleted");
    } catch (err) {
      toast.error("Failed to delete payment stage");
    }
  };

  const handleDeleteProject = async () => {
    try {
      toast.info("Generating project backup...");
      // Generate backup data
      const backupData: any = {
        project: {
          ...project,
          id: crypto.randomUUID() /* assign new ID just to avoid conflicts if they restore manually but wait, if it's a backup we might want the same ID or a new ID, let's keep original ID */,
        },
      };
      backupData.project = project;
      const childTables = [
        // "audit_logs", // audit logs might fail on insert if they have triggers, but we can dump them anyway
        "comments",
        "payment_stages",
        "project_checklists",
        "project_files",
        "tasks",
        "vendor_orders",
        "notifications",
      ];

      for (const table of childTables) {
        const { data: rows } = await supabase
          .from(table)
          .select("*")
          .eq("project_id", project.id);
        backupData[table] = rows || [];
      }

      const backupMetadata = {
        deleted_by: {
          id: user?.id,
          name: user?.full_name,
          email: user?.email,
          role: user?.role,
        },
        deleted_at: new Date().toISOString(),
      };

      const fullBackupPayload = {
        metadata: backupMetadata,
        ...backupData,
      };

      const fileName = `Project_Backup_${project.name.replace(/\s+/g, "_")}_${new Date().toISOString().replace(/:/g, "-")}.json`;

      // Try to upload to Supabase storage bucket named "project-backups"
      try {
        const backupBlob = new Blob(
          [JSON.stringify(fullBackupPayload, null, 2)],
          { type: "application/json" },
        );
        const { error: uploadError } = await supabase.storage
          .from("project-backups")
          .upload(fileName, backupBlob);

        if (uploadError) {
          throw uploadError;
        }

        toast.success(
          `Backup pushed to Supabase "project-backups" bucket as ${fileName}`,
        );

        // Log the successful upload in audit_logs
        await supabase.from("audit_logs").insert([
          {
            project_id: project.id,
            user_id: user?.id,
            user_name: user?.full_name,
            action: "Backup Uploaded",
            details: `Backup saved to project-backups/${fileName}`,
          },
        ]);
      } catch (uploadError: any) {
        toast.error(
          `Failed to push to Supabase (Bucket "project-backups" missing?). Falling back to local download...`,
        );
        // Fallback to local download
        const dataStr =
          "data:text/json;charset=utf-8," +
          encodeURIComponent(JSON.stringify(fullBackupPayload, null, 2));
        const downloadAnchorNode = document.createElement("a");
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", fileName);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
      }

      toast.success("Backup process completed. Proceeding with deletion...");

      // Attempt to delete from related tables first to avoid foreign key constraint errors
      for (const table of ["audit_logs", ...childTables]) {
        await supabase
          .from(table)
          .delete()
          .eq("project_id", project.id)
          .then(({ error }) => {
            if (error)
              console.warn(`Could not delete related ${table}:`, error);
          });
      }

      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);
      if (error) {
        throw new Error(
          error.message ||
            "Failed to delete project due to database constraint.",
        );
      }

      await addNotification(
        "Project Deleted",
        `Project "${project.name}" has been deleted.`,
      );
      toast.success("Project deleted successfully");
      onUpdate();
      onClose();
    } catch (err: any) {
      console.error("Failed to delete project:", err);
      toast.error(err.message || "Failed to delete project");
    }
  };

  const totalValue = paymentStages.reduce(
    (sum, stage) => sum + stage.amount,
    0,
  );
  const totalReceived = paymentStages.reduce(
    (sum, stage) => sum + (stage.amount_received || 0),
    0,
  );
  const totalPending = totalValue - totalReceived;

  const { getDashboardColors } = useTheme();
  const themeColors = getDashboardColors();

  // Combine tasks and comments for Activity tab
  const activityItems = [
    ...tasks.map((t) => ({ ...t, activityType: "task" as const })),
    ...comments.map((c) => ({ ...c, activityType: "comment" as const })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="px-4 sm:px-8 py-3 sm:py-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-white dark:bg-[#121212] sticky top-0 z-10">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="relative group">
            {project.logo_url || editData.logo_url ? (
              <img
                src={isEditing ? editData.logo_url : project.logo_url}
                alt="Project Logo"
                className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl object-contain bg-white dark:bg-[#181818] shadow-sm border border-slate-200 dark:border-white/10 shrink-0"
              />
            ) : (
              <div
                className={cn(
                  "w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0",
                  themeColors.solid,
                )}
              >
                <Briefcase className="w-4 h-4 sm:w-6 sm:h-6" />
              </div>
            )}

            {isEditing && (
              <div
                className="absolute inset-0 bg-black/50 rounded-xl sm:rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex-col gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploadingLogo ? (
                  <RefreshCw className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-white" />
                    <span className="text-[8px] text-white font-bold uppercase tracking-wider">
                      Change
                    </span>
                  </>
                )}
              </div>
            )}
            {isEditing && (
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/svg+xml"
                onChange={handleLogoUpload}
              />
            )}
          </div>
          <div className="space-y-0.5 min-w-0">
            {isEditing ? (
              <div className="flex flex-col gap-1 sm:gap-2">
                <Input
                  value={editData.name}
                  onChange={(e) =>
                    setEditData({ ...editData, name: e.target.value })
                  }
                  className="text-sm sm:text-xl font-bold h-8 sm:h-10 rounded-xl border-slate-200 dark:border-slate-800"
                />
                <Input
                  value={editData.client_name}
                  onChange={(e) =>
                    setEditData({ ...editData, client_name: e.target.value })
                  }
                  className="text-[10px] sm:text-xs h-6 sm:h-8 rounded-xl border-slate-200 dark:border-slate-800"
                  placeholder="Client Name"
                />
                <div className="flex items-center gap-2 mt-1">
                  <Select
                    value={editData.assigned_to || "Unassigned"}
                    onValueChange={(v) =>
                      setEditData({ ...editData, assigned_to: v })
                    }
                  >
                    <SelectTrigger className="h-8 rounded-lg border-slate-200 dark:border-white/10 text-xs font-medium w-[140px] shadow-sm">
                      <SelectValue placeholder="Team Member" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl z-[150]">
                      <SelectItem value="Unassigned">Unassigned</SelectItem>
                      {Array.from(new Set(allUsers.map(u => u.full_name || u.email || 'Unnamed User'))).map(displayName => (
                        <SelectItem key={displayName} value={displayName}>
                          {displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight truncate">
                    {translateData(project.name)}
                  </h2>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-black uppercase text-[7px] sm:text-[9px] px-1.5 sm:px-2 py-0 shrink-0 tracking-tighter",
                      themeColors.bg,
                      themeColors.text,
                      themeColors.border,
                    )}
                  >
                    {translateData(
                      STAGE_LABELS[project.status] || project.status,
                    )}
                  </Badge>
                </div>
                <p className="text-[9px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest truncate">
                  Client:{" "}
                  <span className="text-slate-900 dark:text-zinc-300">
                    {translateData(project.client_name)}
                  </span>
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-[#0a0a0a] p-0.5 sm:p-1 rounded-xl border border-slate-100 dark:border-white/10">
            {onToggleMaximize && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleMaximize}
                className="h-7 w-7 sm:w-auto sm:h-9 rounded-lg hover:bg-white dark:hover:bg-[#181818] hover:shadow-sm text-slate-500 gap-2 p-0 sm:px-3"
                title={isMaximized ? "Minimize" : "Maximize"}
              >
                {isMaximized ? (
                  <Minimize2 className="w-3.5 h-3.5 sm:w-4 h-4" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 h-4" />
                )}
                <span className="hidden lg:inline text-xs font-bold">
                  {isMaximized ? "Minimize" : "Maximize"}
                </span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDetails}
              className="h-7 w-7 sm:w-auto sm:h-9 rounded-lg hover:bg-white dark:hover:bg-[#181818] hover:shadow-sm text-slate-500 gap-2 p-0 sm:px-3"
            >
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 h-4" />
              <span className="hidden lg:inline text-xs font-bold">
                {t("refresh")}
              </span>
            </Button>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(false)}
                  className="h-7 rounded-lg text-[9px] font-bold px-1.5 sm:px-2"
                >
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  className="h-7 bg-indigo-600 rounded-lg text-[9px] font-bold px-2 sm:px-3"
                  onClick={handleUpdateProject}
                >
                  {t("save")}
                </Button>
              </div>
            ) : (
              hasProjectManagementAccess(user?.role) && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleHoldStatus}
                    disabled={isTogglingHold}
                    className={`h-7 w-7 sm:w-auto sm:h-9 rounded-lg gap-2 p-0 sm:px-3 ${project.status === "Work is on hold" ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10 dark:hover:text-amber-400" : "text-slate-500 hover:bg-white dark:hover:bg-[#181818] hover:shadow-sm"}`}
                  >
                    <AlertCircle className="w-3.5 h-3.5 sm:w-4 h-4" />
                    <span className="hidden lg:inline text-xs font-bold">
                      {project.status === "Work is on hold" ? "Resume" : "Hold"}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-7 w-7 sm:w-auto sm:h-9 rounded-lg hover:bg-white dark:hover:bg-[#181818] hover:shadow-sm text-slate-500 gap-2 p-0 sm:px-3"
                  >
                    <Edit className="w-3.5 h-3.5 sm:w-4 h-4" />
                    <span className="hidden lg:inline text-xs font-bold">
                      {t("edit")}
                    </span>
                  </Button>
                </>
              )
            )}
          </div>
          <Separator
            orientation="vertical"
            className="h-5 sm:h-6 hidden md:block dark:bg-white/10"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400"
          >
            <X className="w-4 h-4 sm:w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Main Content Area (Left) */}
        <div className="flex-1 min-w-0 flex flex-col border-r border-slate-100 dark:border-white/10 bg-white dark:bg-[#121212] lg:overflow-hidden shrink-0 lg:shrink">
          <Tabs
            defaultValue={initialTab}
            className="flex-1 flex flex-col lg:overflow-hidden"
          >
            <div className="px-4 sm:px-8 border-b border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-[#0a0a0a] shrink-0">
              <TabsList className="bg-transparent h-12 sm:h-14 p-0 gap-4 sm:gap-8 overflow-x-auto no-scrollbar flex-nowrap justify-start">
                <TabsTrigger
                  value="activity"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                >
                  {t("activity")}
                </TabsTrigger>
                <TabsTrigger
                  value="tasks"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                >
                  {t("tasks")}
                </TabsTrigger>
                <TabsTrigger
                  value="files"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                >
                  Files
                </TabsTrigger>
                <TabsTrigger
                  value="execution-plan"
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                >
                  Execution Plan
                </TabsTrigger>
                {hasFinanceAccess(user?.role) && (
                  <TabsTrigger
                    value="payments"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                  >
                    {t("payments")}
                  </TabsTrigger>
                )}
                {(hasFinanceAccess(user?.role) ||
                  hasProjectManagementAccess(user?.role)) && (
                  <TabsTrigger
                    value="vendors"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                  >
                    Vendor Orders
                  </TabsTrigger>
                )}
                {(hasFinanceAccess(user?.role) ||
                  hasProjectManagementAccess(user?.role)) && (
                  <TabsTrigger
                    value="expenses"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                  >
                    Expenses
                  </TabsTrigger>
                )}
                {hasAuditLogAccess(user?.role) && (
                  <TabsTrigger
                    value="audit"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-indigo-600 rounded-none px-0 font-bold text-slate-400 data-[state=active]:text-indigo-600 text-[10px] sm:text-xs uppercase tracking-widest whitespace-nowrap"
                  >
                    {t("audit_log")}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            <div className="flex-1 lg:overflow-y-auto" ref={scrollRef}>
              <div className="min-h-full flex flex-col">
                <TabsContent
                  value="activity"
                  className="mt-0 space-y-8 outline-none p-4 sm:p-8 flex-1"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                      {t("recent_activity")}
                    </h3>
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-4">
                      {t("add_comment")}
                    </h4>
                    <form onSubmit={handleAddComment} className="space-y-4">
                      <div className="relative">
                        <Textarea
                          placeholder="Share an update or ask a question..."
                          value={newComment}
                          onChange={(e) => handleCommentChange(e.target.value)}
                          className="min-h-[100px] rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 focus:bg-white dark:bg-slate-900 transition-all"
                        />
                        {showMentions && (
                          <div className="absolute bottom-full left-0 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 mb-2 overflow-hidden">
                            <div className="p-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              Tag Team Member
                            </div>
                            <ScrollArea className="max-h-48">
                              {allUsers
                                .filter((u) =>
                                  u.full_name
                                    .toLowerCase()
                                    .includes(mentionSearch),
                                )
                                .map((u) => (
                                  <div
                                    key={u.id}
                                    onClick={() => insertMention(u.full_name)}
                                    className="p-3 hover:bg-indigo-50 cursor-pointer flex items-center gap-3 transition-colors"
                                  >
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="bg-indigo-100 text-indigo-600 text-[10px] font-bold">
                                        {getInitials(u.full_name)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                                      {u.full_name}
                                    </span>
                                  </div>
                                ))}
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar">
                          <Button
                            type="button"
                            variant={
                              commentType === "internal" ? "secondary" : "ghost"
                            }
                            size="sm"
                            onClick={() => setCommentType("internal")}
                            className={cn(
                              "h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                              commentType === "internal" &&
                                "bg-white dark:bg-slate-900 shadow-sm",
                            )}
                          >
                            {t("internal_comment")}
                          </Button>
                          <Button
                            type="button"
                            variant={
                              commentType === "client" ? "secondary" : "ghost"
                            }
                            size="sm"
                            onClick={() => setCommentType("client")}
                            className={cn(
                              "h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                              commentType === "client" &&
                                "bg-white dark:bg-slate-900 shadow-sm",
                            )}
                          >
                            {t("client_comment")}
                          </Button>
                        </div>
                        <Button
                          type="submit"
                          disabled={isSubmitting}
                          className="bg-indigo-600 rounded-xl px-6 font-bold shadow-lg shadow-indigo-100"
                        >
                          {t("add_comment")}
                        </Button>
                      </div>
                    </form>
                  </div>

                  <div className="space-y-6">
                    {activityItems.map((item: any) => (
                      <div
                        key={`${item.activityType}-${item.id}`}
                        className="relative pl-10"
                      >
                        <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center shadow-sm z-10">
                          {item.activityType === "task" ? (
                            <ListTodo className="w-4 h-4 text-indigo-600" />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-amber-600" />
                          )}
                        </div>
                        <div
                          className={cn(
                            "p-4 rounded-2xl border transition-all",
                            item.activityType === "comment" &&
                              item.type === "client"
                              ? "bg-amber-50 border-amber-100 shadow-sm"
                              : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm",
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {item.author || item.assigned_to || "System"}
                              </span>
                              {item.activityType === "comment" &&
                                item.type === "client" && (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[8px] font-black uppercase tracking-tighter">
                                    {t("client_comment")}
                                  </Badge>
                                )}
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {format(
                                  new Date(item.created_at),
                                  "MMM d, h:mm a",
                                )}
                              </span>
                            </div>
                            {item.activityType === "task" && (
                              <Badge
                                variant={
                                  item.status === "Completed"
                                    ? "default"
                                    : "secondary"
                                }
                                className={cn(
                                  "text-[8px] font-black uppercase tracking-tighter",
                                  item.status === "Completed"
                                    ? "bg-emerald-500"
                                    : "bg-slate-100",
                                )}
                              >
                                {translateData(item.status)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            {item.activityType === "task"
                              ? `${t("tasks")}: ${translateData(item.title)}`
                              : item.text}
                          </p>
                          {item.activityType === "task" && item.description && (
                            <p className="text-xs text-slate-400 mt-1 italic">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent
                  value="tasks"
                  className="mt-0 space-y-6 p-4 sm:p-8 flex-1"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                      Project Tasks
                    </h3>
                    <Badge
                      variant="secondary"
                      className="bg-indigo-50 text-indigo-600 rounded-full font-bold"
                    >
                      {tasks.filter((t) => t.status === "Completed").length}/
                      {tasks.length} Done
                    </Badge>
                  </div>

                  <form
                    onSubmit={handleAddTask}
                    className="space-y-3 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800"
                  >
                    <div className="flex flex-col gap-2">
                      <Input
                        placeholder="What needs to be done?"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        className="rounded-xl border-slate-200 dark:border-slate-800 h-11 bg-white dark:bg-slate-900 focus:bg-white dark:bg-slate-900 transition-all w-full"
                      />
                      <Textarea
                        placeholder="Add more details (optional)..."
                        value={newTaskDescription}
                        onChange={(e) => setNewTaskDescription(e.target.value)}
                        className="rounded-xl border-slate-200 dark:border-slate-800 min-h-[80px] bg-white dark:bg-slate-900 focus:bg-white dark:bg-slate-900 transition-all w-full"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Select
                        value={newTaskAssignee}
                        onValueChange={setNewTaskAssignee}
                      >
                        <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 h-11 bg-white dark:bg-slate-900 flex-1">
                          <SelectValue placeholder="Assign to..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="Unassigned">Unassigned</SelectItem>
                          {hasProjectManagementAccess(user?.role) ||
                          project.assigned_to === user?.full_name ? (
                            Array.from(new Set(allUsers.map(u => u.full_name || u.email || 'Unnamed User'))).map(displayName => (
                              <SelectItem key={displayName} value={displayName}>
                                {displayName}
                              </SelectItem>
                            ))
                          ) : project.assigned_to ? (
                            <SelectItem value={project.assigned_to}>
                              {project.assigned_to}
                            </SelectItem>
                          ) : null}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        value={newTaskDeadline}
                        onChange={(e) => setNewTaskDeadline(e.target.value)}
                        className="rounded-xl border-slate-200 dark:border-slate-800 h-11 bg-white dark:bg-slate-900 flex-1"
                      />
                      <Button
                        type="submit"
                        className="bg-indigo-600 rounded-xl h-11 px-6 font-bold shadow-lg shadow-indigo-100 w-full sm:w-auto shrink-0"
                      >
                        Add Task
                      </Button>
                    </div>
                  </form>

                  {/* Suggested Tasks */}
                  {TASK_TEMPLATES[project.status] && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-amber-600">
                        <Lightbulb className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">
                          {t("suggestions")} for{" "}
                          {translateData(STAGE_LABELS[project.status])}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {TASK_TEMPLATES[project.status]
                          .filter(
                            (title) => !tasks.some((t) => t.title === title),
                          )
                          .map((title) => (
                            <button
                              key={title}
                              onClick={() => handleAddTemplateTask(title)}
                              className="text-[10px] font-bold px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full hover:bg-amber-100 transition-all"
                              title="Click to fill the task name above"
                            >
                              + {translateData(title)}
                            </button>
                          ))}
                        {TASK_TEMPLATES[project.status].filter(
                          (title) => !tasks.some((t) => t.title === title),
                        ).length === 0 && (
                          <span className="text-[10px] font-medium text-slate-400 italic">
                            All suggested tasks for this stage have been added.
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        Tip: Click a suggestion to fill the name, then add
                        details and click "Add Task".
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    {tasks.length === 0 ? (
                      <div className="text-center py-16 bg-slate-50 dark:bg-slate-950/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                        <ListTodo className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-medium text-slate-400">
                          No tasks created yet.
                        </p>
                      </div>
                    ) : (
                      tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md transition-all group"
                        >
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => toggleTaskStatus(task)}
                              className={cn(
                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                task.status === "Completed"
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : "border-slate-200 dark:border-slate-800 text-transparent hover:border-indigo-400",
                              )}
                            >
                              <CheckSmallIcon className="w-4 h-4" />
                            </button>
                            <div className="flex flex-col">
                              <span
                                className={cn(
                                  "text-sm font-bold transition-all break-words line-clamp-2",
                                  task.status === "Completed"
                                    ? "text-slate-400 line-through"
                                    : "text-slate-700",
                                )}
                              >
                                {translateData(task.title)}
                              </span>
                              {task.description && (
                                <p
                                  className={cn(
                                    "text-xs mt-0.5",
                                    task.status === "Completed"
                                      ? "text-slate-300"
                                      : "text-slate-500",
                                  )}
                                >
                                  {translateData(task.description)}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1">
                                {task.assigned_to && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-4 h-4 rounded-full bg-indigo-100 flex items-center justify-center">
                                      <UserIcon className="w-2.5 h-2.5 text-indigo-600" />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                      {task.assigned_to}
                                    </span>
                                  </div>
                                )}
                                {task.deadline && (
                                  <div className="flex items-center gap-1.5">
                                    <CalendarIcon className="w-3 h-3 text-slate-400" />
                                    <span
                                      className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider",
                                        new Date(task.deadline) < new Date() &&
                                          task.status !== "Completed"
                                          ? "text-red-500"
                                          : "text-slate-400",
                                      )}
                                    >
                                      {formatDate(task.deadline)}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {task.status === "Completed" &&
                                task.completed_at && (
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    Done {formatDate(task.completed_at)}
                                  </span>
                                )}
                              {task.comment && (
                                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                  <p className="text-xs text-slate-600 dark:text-slate-300 italic">
                                    {translateData(task.comment)}
                                  </p>
                                  {task.attachment_url && (
                                    <a
                                      href={task.attachment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-wider"
                                    >
                                      <Paperclip className="w-3 h-3" />
                                      View Attached File
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {task.assigned_to !== user?.full_name &&
                              task.status !== "done" &&
                              !hasProjectManagementAccess(user?.role) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRequestAssignment(task)}
                                  className="h-8 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2"
                                >
                                  Request
                                </Button>
                              )}
                            {task.assigned_to !== user?.full_name &&
                              task.status !== "done" &&
                              hasProjectManagementAccess(user?.role) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSelfAssign(task)}
                                  className="h-8 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50 px-2"
                                >
                                  Take Over
                                </Button>
                              )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setTaskToAudit(task);
                                setTaskAuditComment("");
                                setTaskAuditFileUrl(task.attachment_url || "");
                                setTaskAuditAssignee(
                                  task.assigned_to || "Unassigned",
                                );
                                setIsTaskAuditDialogOpen(true);
                              }}
                              className="h-8 text-xs text-slate-500 hover:text-indigo-600 px-2"
                            >
                              <MessageSquare className="w-3 h-3 mr-1.5" />{" "}
                              {t("audit")}
                            </Button>
                            {hasProjectManagementAccess(user?.role) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setTaskIdToDelete(task.id);
                                  setIsTaskDeleteDialogOpen(true);
                                }}
                                className="h-8 w-8 text-slate-300 hover:text-red-500 transition-all"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent
                  value="files"
                  className="mt-0 space-y-8 outline-none p-4 sm:p-8 flex-1"
                >
                  <DrawingsTracker
                    projectId={project.id}
                    projectName={project.name}
                    projectFiles={files}
                    onFileUploaded={fetchDetails}
                  />
                </TabsContent>

                <TabsContent value="kanban" className="mt-0 p-4 sm:p-8 flex-1">
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-4">
                      Task Kanban Board
                    </h3>
                    <KanbanBoard
                      tasks={tasks}
                      onStatusChange={toggleTaskStatus}
                      onTaskClick={(task) => {
                        setTaskToAudit(task);
                        setTaskAuditComment("");
                        setTaskAuditFileUrl(task.attachment_url || "");
                        setTaskAuditAssignee(task.assigned_to || "Unassigned");
                        setIsTaskAuditDialogOpen(true);
                      }}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="calendar"
                  className="mt-0 p-4 sm:p-8 flex-1"
                >
                  <div className="mb-6">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest mb-4">
                      Task Calendar
                    </h3>
                    <CalendarView
                      events={tasks.map((t) => ({
                        id: t.id,
                        title: t.title,
                        date: t.deadline,
                        status: t.status,
                        type: "task",
                        project_name: project.name,
                      }))}
                      selectedProjectName={project.name}
                    />
                  </div>
                </TabsContent>

                <TabsContent
                  value="comments"
                  className="mt-0 space-y-8 p-4 sm:p-8 flex-1"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                      Discussion & Updates
                    </h3>
                    <Badge
                      variant="secondary"
                      className="bg-slate-100 text-slate-600 rounded-full font-bold"
                    >
                      {comments.length} Comments
                    </Badge>
                  </div>

                  <form onSubmit={handleAddComment} className="relative">
                    <Textarea
                      placeholder="Share an update or ask a question..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="min-h-[120px] rounded-2xl border-slate-200 dark:border-white/10 shadow-sm p-4 pb-14 bg-slate-50 dark:bg-[#0a0a0a] focus:bg-white dark:focus:bg-[#181818] transition-all"
                    />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-indigo-600 font-bold text-xs"
                      >
                        <Paperclip className="w-3.5 h-3.5 mr-2" />
                        Attach File
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSubmitting}
                        className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-6 font-bold shadow-lg shadow-indigo-100 dark:shadow-none"
                      >
                        Post Comment
                      </Button>
                    </div>
                  </form>

                  <div className="space-y-8 pt-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-4 group">
                        <Avatar className="h-10 w-10 border-2 border-white dark:border-[#121212] shadow-md">
                          <AvatarFallback className="bg-indigo-600 text-white font-bold text-xs">
                            {getInitials(comment.author)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                              {comment.author}
                            </h4>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {format(
                                new Date(comment.created_at),
                                "MMM d, h:mm a",
                              )}
                            </span>
                          </div>
                          <div className="bg-white dark:bg-[#181818] p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-white/10 text-sm text-slate-600 dark:text-zinc-400 leading-relaxed shadow-sm hover:shadow-md transition-all">
                            {comment.text
                              .split(/(@\[[^\]]+\])/g)
                              .map((part, i) => {
                                if (
                                  part.startsWith("@[") &&
                                  part.endsWith("]")
                                ) {
                                  const name = part.slice(2, -1);
                                  return (
                                    <span
                                      key={i}
                                      className="text-indigo-600 font-bold"
                                    >
                                      {name}
                                    </span>
                                  );
                                }
                                return part;
                              })}
                            {comment.attachment_url && (
                              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl flex items-center justify-between group/file cursor-pointer hover:bg-indigo-50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center text-indigo-600 shadow-sm">
                                    <ImageIcon className="w-4 h-4" />
                                  </div>
                                  <span className="text-xs font-bold text-slate-700 group-hover/file:text-indigo-600">
                                    Attachment.png
                                  </span>
                                </div>
                                <FileText className="w-4 h-4 text-slate-300" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {hasFinanceAccess(user?.role) && (
                  <TabsContent
                    value="payments"
                    className="mt-0 space-y-8 p-4 sm:p-8 flex-1"
                  >
                    <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                      <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-wider flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        {t("how_it_works")}
                      </p>
                      <p className="text-xs text-indigo-600 mt-1 leading-relaxed">
                        Add payment stages below. You can track partial payments
                        by updating the <strong>"Amount Received"</strong> field
                        for each stage.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-indigo-600 p-5 rounded-3xl text-white shadow-lg shadow-indigo-100 dark:shadow-none relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-white dark:bg-white/10 rounded-full blur-xl" />
                        <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">
                          {t("total_value")}
                        </p>
                        <h3 className="text-2xl font-black">
                          ₹ {totalValue.toLocaleString()}
                        </h3>
                      </div>
                      <div className="bg-emerald-500 p-5 rounded-3xl text-white shadow-lg shadow-emerald-100 dark:shadow-none relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-white dark:bg-white/10 rounded-full blur-xl" />
                        <p className="text-emerald-100 text-[10px] font-bold uppercase tracking-widest mb-1">
                          {t("amount_received")}
                        </p>
                        <h3 className="text-2xl font-black">
                          ₹ {totalReceived.toLocaleString()}
                        </h3>
                      </div>
                      <div className="bg-amber-500 p-5 rounded-3xl text-white shadow-lg shadow-amber-100 dark:shadow-none relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-white dark:bg-white/10 rounded-full blur-xl" />
                        <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest mb-1">
                          {t("pending_payments")}
                        </p>
                        <h3 className="text-2xl font-black">
                          ₹ {totalPending.toLocaleString()}
                        </h3>
                      </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-[#181818] p-6 rounded-3xl border border-slate-100 dark:border-white/10">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest mb-4">
                        {t("add_payment")}
                      </h4>
                      <form
                        onSubmit={handleAddPaymentStage}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                      >
                        <div className="sm:col-span-3">
                          <Input
                            placeholder="Stage Name (e.g. Advance, 50% Completion)"
                            value={newStageName}
                            onChange={(e) => setNewStageName(e.target.value)}
                            className="rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] dark:text-zinc-100"
                          />
                        </div>
                        <Input
                          type="number"
                          placeholder={t("amount")}
                          value={newStageAmount}
                          onChange={(e) => setNewStageAmount(e.target.value)}
                          className="rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] dark:text-zinc-100"
                        />
                        <Input
                          type="date"
                          value={newStageDueDate}
                          onChange={(e) => setNewStageDueDate(e.target.value)}
                          className="rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] dark:text-zinc-100"
                        />
                        <Button
                          type="submit"
                          className="bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold shadow-lg shadow-indigo-100 dark:shadow-none"
                        >
                          {t("add_payment")}
                        </Button>
                      </form>
                    </div>

                    <div className="space-y-4">
                      {paymentStages.map((stage) => (
                        <div
                          key={stage.id}
                          className="flex flex-col p-4 sm:p-5 bg-white dark:bg-[#121212] border border-slate-100 dark:border-white/10 rounded-2xl shadow-sm hover:shadow-md transition-all group gap-4"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3 sm:gap-5">
                              <div
                                className={cn(
                                  "w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                                  stage.status === "Paid"
                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                                )}
                              >
                                <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                                  {translateData(stage.stage_name)}
                                </h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                                  {t("due_date")} {formatDate(stage.due_date)}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                              <div className="flex flex-col items-start sm:items-end gap-1">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                  {t("amount")}
                                </p>
                                <p className="text-sm font-black text-slate-900 dark:text-slate-100">
                                  ₹ {stage.amount.toLocaleString()}
                                </p>
                              </div>

                              <div className="flex flex-col items-start sm:items-end gap-1 min-w-[100px] pl-4 sm:border-l border-slate-100 dark:border-white/10">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                  {t("amount_received")}
                                </p>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-500">
                                    ₹ {stage.amount_received.toLocaleString()}
                                  </p>
                                  {stage.amount_received >= stage.amount ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                  ) : (
                                    <Clock className="w-4 h-4 text-amber-500" />
                                  )}
                                </div>
                              </div>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deletePaymentStage(stage.id)}
                                className="h-9 w-9 text-slate-300 hover:text-red-500 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="w-full pt-4 mt-2 border-t border-slate-50 dark:border-white/5">
                            <PaymentStageHistory
                              commentsJson={stage.comments}
                              onUpdate={(newCommentsJson, totalReceiptsAmount) => {
                                updatePaymentComments(stage.id, newCommentsJson);
                                if (totalReceiptsAmount !== undefined) {
                                  updatePaymentReceived(stage.id, totalReceiptsAmount, undefined);
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}

                {(hasFinanceAccess(user?.role) ||
                  hasProjectManagementAccess(user?.role)) && (
                  <TabsContent
                    value="vendors"
                    className="mt-0 p-4 sm:p-8 flex-1"
                  >
                    <ProjectVendorOrders project={project} />
                  </TabsContent>
                )}

                {(hasFinanceAccess(user?.role) ||
                  hasProjectManagementAccess(user?.role)) && (
                  <TabsContent
                    value="expenses"
                    className="mt-0 p-4 sm:p-8 flex-1"
                  >
                    <ProjectExpenses project={project} />
                  </TabsContent>
                )}

                <TabsContent value="execution-plan" className="mt-0">
                  <ProjectChecklist
                    projectId={project.id}
                    onUpdate={() => {
                      fetchDetails();
                      onUpdate();
                    }}
                  />
                </TabsContent>

                <TabsContent value="drawings-tracker" className="mt-0">
                  <DrawingsTracker
                    projectId={project.id}
                    projectName={project.name}
                    projectFiles={files}
                    onFileUploaded={fetchDetails}
                  />
                </TabsContent>

                {hasAuditLogAccess(user?.role) && (
                  <TabsContent value="audit" className="mt-0">
                    <div className="space-y-8 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100 dark:before:bg-white/10">
                      {auditLogs.map((log) => (
                        <div key={log.id} className="relative pl-12">
                          <div className="absolute left-0 top-0 w-10 h-10 rounded-2xl bg-white dark:bg-[#121212] border border-slate-100 dark:border-white/10 flex items-center justify-center shadow-sm z-10">
                            <History className="w-4 h-4 text-slate-400" />
                          </div>
                          <div className="bg-slate-50 dark:bg-[#181818] p-4 rounded-2xl border border-slate-100 dark:border-white/10 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                                {log.action}
                              </h4>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                {format(
                                  new Date(log.created_at),
                                  "MMM d, h:mm a",
                                )}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                              {log.details}
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                              <div className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                                <UserIcon className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                                {log.user_name || "System"}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                )}
              </div>
            </div>
          </Tabs>
        </div>

        {/* Sidebar Info (Right) */}
        <aside className="w-full lg:w-80 bg-slate-50 dark:bg-[#0a0a0a] flex flex-col border-l border-slate-100 dark:border-white/10 shrink-0 lg:overflow-hidden">
          <div className="flex-1 lg:overflow-y-auto">
            <div className="p-4 sm:p-8 space-y-10">
              {/* Progress Section */}
              <div className="space-y-4">
                {/* Execution Plan Progress */}
                <div className="pt-0">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                      Execution Plan
                    </h3>
                    <span className="text-sm font-black text-amber-500">
                      {checklistProgress}%
                    </span>
                  </div>
                  <div className="relative h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="absolute inset-y-0 left-0 bg-amber-500 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(245,158,11,0.4)]"
                      style={{ width: `${checklistProgress}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="bg-white dark:bg-[#121212] p-3 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Tasks Done
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {tasks.filter((t) => t.status === "Completed").length}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-[#121212] p-3 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Payments
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      {paymentStages.filter((s) => s.status === "Paid").length}/
                      {paymentStages.length}
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-200/50 dark:bg-white/5" />

              {/* Details Section */}
              <div className="space-y-6">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                  {t("about_project")}
                </h3>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#121212] border border-slate-100 dark:border-white/10 flex items-center justify-center text-indigo-600 shadow-sm">
                      <CalendarIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {STAGE_LABELS[project.status] === "Handover"
                          ? t("completed_on")
                          : t("target_date")}
                      </p>
                      {isEditing ? (
                        <Input
                          type="date"
                          value={editData.deadline}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              deadline: e.target.value,
                            })
                          }
                          className="text-sm font-bold text-slate-900 dark:text-zinc-100 h-8 mt-1 rounded-lg border-slate-200 dark:border-white/10"
                        />
                      ) : (
                        <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                          {STAGE_LABELS[project.status] === "Handover"
                            ? formatDate(
                                project.completed_at || project.deadline,
                              )
                            : formatDate(project.deadline)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#121212] border border-slate-100 dark:border-white/10 flex items-center justify-center text-indigo-600 shadow-sm">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {t("project_lead")}
                      </p>
                      {isEditing ? (
                        <Select
                          value={editData.assigned_to || "Unassigned"}
                          onValueChange={(v) =>
                            setEditData({ ...editData, assigned_to: v })
                          }
                        >
                          <SelectTrigger className="h-8 mt-1 rounded-lg border-slate-200 dark:border-white/10 text-sm font-bold">
                            <SelectValue placeholder="Select Lead" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl z-[150]">
                            <SelectItem value="Unassigned">
                              Unassigned
                            </SelectItem>
                            {Array.from(new Set(allUsers.map(u => u.full_name || u.email || 'Unnamed User'))).map(displayName => (
                                <SelectItem key={displayName} value={displayName}>
                                  {displayName}
                                </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                          {project.assigned_to || "Unassigned"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-[#121212] border border-slate-100 dark:border-white/10 flex items-center justify-center text-indigo-600 shadow-sm">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {t("current_status")}
                      </p>
                      {isEditing ? (
                        <Select
                          value={editData.status}
                          onValueChange={(v) =>
                            setEditData({ ...editData, status: v as any })
                          }
                        >
                          <SelectTrigger className="h-8 mt-1 rounded-lg border-slate-200 dark:border-white/10 text-sm font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {PROJECT_STAGES.map((stage) => (
                              <SelectItem key={stage} value={stage}>
                                {translateData(STAGE_LABELS[stage])}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                          {translateData(STAGE_LABELS[project.status])}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator className="bg-slate-200/50 dark:bg-white/5" />

              {/* Description Section */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                  {t("about_project")}
                </h3>
                {isEditing ? (
                  <Textarea
                    value={editData.description}
                    onChange={(e) =>
                      setEditData({ ...editData, description: e.target.value })
                    }
                    className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed font-medium min-h-[100px] rounded-xl border-slate-200 dark:border-white/10"
                  />
                ) : (
                  <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed font-medium">
                    {translateData(
                      project.description ||
                        "No detailed description available for this project.",
                    )}
                  </p>
                )}
              </div>

              {isEditing && (
                <div className="pt-4">
                  <Button
                    variant="ghost"
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl font-bold h-10 gap-2"
                    onClick={() =>
                      setTimeout(() => setIsDeleteDialogOpen(true), 0)
                    }
                  >
                    <TrashIcon className="w-4 h-4" />
                    Delete Project
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Footer */}
          {hasProjectManagementAccess(user?.role) && (
            <div className="p-6 border-t border-slate-100 dark:border-white/10 bg-white dark:bg-[#121212]">
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-bold h-12 shadow-lg shadow-indigo-100 dark:shadow-none transition-all active:scale-95"
                onClick={() => {
                  if (isEditing) {
                    handleUpdateProject();
                  } else {
                    setEditData({
                      name: project.name,
                      client_name: project.client_name,
                      description: project.description || "",
                      progress: project.progress,
                      status: project.status,
                      deadline: project.deadline || "",
                      assigned_to: project.assigned_to || "",
                    });
                    setIsEditing(true);
                  }
                }}
              >
                {isEditing ? "Save Changes" : "Edit Details"}
              </Button>
            </div>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={isTaskDeleteDialogOpen}
        onOpenChange={setIsTaskDeleteDialogOpen}
        onConfirm={deleteTask}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
      />
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        description="Are you sure you want to delete this project? This action cannot be undone and all associated data will be removed."
      />
      {isCropOpen && (
        <ImageCropperDialog
          open={isCropOpen}
          onOpenChange={setIsCropOpen}
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
        />
      )}
      <Dialog
        open={!!takeOverTask}
        onOpenChange={(open) => !open && setTakeOverTask(null)}
      >
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#121212] border-slate-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest">
              Take Over Task
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Reason for Taking Over
              </label>
              <Textarea
                className="bg-slate-50 dark:bg-slate-900 border-none dark:border-white/10 dark:text-zinc-100 resize-none h-24"
                placeholder="Enter a reason for taking over this task..."
                value={takeOverReason}
                onChange={(e) => setTakeOverReason(e.target.value)}
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={() => setTakeOverTask(null)}
                disabled={isTakingOver}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSelfAssignSubmit}
                disabled={isTakingOver}
                className="bg-teal-600 hover:bg-teal-700 text-white shadow-md"
              >
                {isTakingOver ? "Processing..." : "Confirm Take Over"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isTaskAuditDialogOpen}
        onOpenChange={setIsTaskAuditDialogOpen}
      >
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#121212] border-slate-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest">
              {t("audit_task")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {taskToAudit?.comment && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Audit History
                </label>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {taskToAudit.comment}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Add {t("audit_comment")}
              </label>
              <Textarea
                className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-white/10 dark:text-zinc-100 resize-none h-24"
                placeholder={t("enter_audit_comment")}
                value={taskAuditComment}
                onChange={(e) => setTaskAuditComment(e.target.value)}
              />
            </div>
            {(hasProjectManagementAccess(user?.role) ||
              user?.role === "finance_manager") && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Assign To
                </label>
                <Select
                  value={taskAuditAssignee}
                  onValueChange={setTaskAuditAssignee}
                >
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-none dark:border-white/10 dark:text-zinc-100 h-11">
                    <SelectValue placeholder="Assign To" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-[#121212] dark:border-white/10">
                    <SelectItem
                      value="Unassigned"
                      className="dark:text-zinc-300 dark:hover:bg-[#181818]"
                    >
                      Unassigned
                    </SelectItem>
                    {Array.from(new Set(allUsers.map(u => u.full_name || u.email || 'Unnamed User'))).map(displayName => (
                      <SelectItem
                        key={displayName}
                        value={displayName}
                        className="dark:text-zinc-300 dark:hover:bg-[#181818]"
                      >
                        {displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {t("attach_file_optional")}
              </label>
              <Select
                value={taskAuditFileUrl}
                onValueChange={setTaskAuditFileUrl}
              >
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-none dark:border-white/10 dark:text-zinc-100 h-11">
                  <SelectValue placeholder={t("select_file")} />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#121212] dark:border-white/10 max-h-72 w-[280px] sm:w-[380px]">
                  <SelectItem
                    value="none"
                    className="dark:text-zinc-300 dark:hover:bg-[#181818] py-3"
                  >
                    {t("no_file_attached")}
                  </SelectItem>
                  {files.map((f) => (
                    <SelectItem
                      key={f.id}
                      value={f.url}
                      className="dark:text-zinc-300 dark:hover:bg-[#181818] py-3 pr-8"
                    >
                      <div className="flex flex-col w-full overflow-hidden">
                        <span
                          className="font-medium truncate block"
                          title={f.name}
                        >
                          {f.name}
                        </span>
                        {f.description && (
                          <span
                            className="text-xs text-slate-500 truncate block w-full mt-0.5"
                            title={f.description}
                          >
                            {f.description}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-6">
              <Button
                onClick={handleSaveTaskAudit}
                disabled={isSubmittingTaskAudit}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              >
                {isSubmittingTaskAudit ? "Saving..." : t("save_audit")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
