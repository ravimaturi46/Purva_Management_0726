import React, { useState, useEffect } from 'react';
import { Task, Project, hasProjectManagementAccess } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationContext';
import { toast } from 'sonner';
import { 
  ChevronLeft, 
  ChevronRight, 
  User, 
  CheckCircle2, 
  Circle, 
  Clock,
  Plus,
  Loader2
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  parseISO,
  isValid
} from 'date-fns';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from './ui/dialog';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

interface CalendarEvent {
  id: string;
  title: string;
  date: string | null;
  status?: string;
  type: 'task' | 'project' | 'leave';
  project_name?: string;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  selectedProjectName?: string;
  projects?: Project[];
  onTaskCreated?: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ 
  events, 
  onEventClick, 
  selectedProjectName,
  projects,
  onTaskCreated
}) => {
  const { t } = useLanguage();
  const { user, allUsers } = useUser();
  const { addNotification } = useNotifications();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  // Dialog State
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Form State
  const [newTaskProjectId, setNewTaskProjectId] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('Unassigned');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  useEffect(() => {
    if (projects && projects.length > 0) {
      setLocalProjects(projects);
    } else {
      setLoadingProjects(true);
      supabase.from('projects')
        .select('*')
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            setLocalProjects(data);
          }
          setLoadingProjects(false);
        });
    }
  }, [projects]);

  useEffect(() => {
    if (isAddTaskOpen) {
      // Find project that matches selectedProjectName if it's set
      if (selectedProjectName && selectedProjectName !== 'all' && selectedProjectName !== 'Leaves') {
        const preSelected = localProjects.find(p => p.name === selectedProjectName);
        if (preSelected) {
          setNewTaskProjectId(preSelected.id);
          return;
        }
      }
      // Otherwise, select the first project if list is not empty
      if (localProjects.length > 0) {
        setNewTaskProjectId(localProjects[0].id);
      } else {
        setNewTaskProjectId('');
      }
    }
  }, [isAddTaskOpen, selectedProjectName, localProjects]);

  const handleRaiseTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskProjectId) {
      toast.error("Please select a project");
      return;
    }
    if (!newTaskTitle.trim()) {
      toast.error("Please enter a task title");
      return;
    }

    setIsSubmittingTask(true);
    try {
      const selectedProject = localProjects.find(p => p.id === newTaskProjectId);
      const assigneeName = newTaskAssignee === 'Unassigned' ? null : newTaskAssignee;

      const { data, error } = await supabase.from('tasks').insert({
        project_id: newTaskProjectId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null,
        assigned_to: assigneeName,
        deadline: newTaskDeadline || null,
        status: 'Todo',
        priority: newTaskPriority,
        created_at: new Date().toISOString()
      }).select().single();

      if (error) throw error;

      // Reset form fields
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskAssignee('Unassigned');
      setNewTaskDeadline('');
      setNewTaskPriority('Medium');
      setIsAddTaskOpen(false);

      // Trigger callback if defined
      if (onTaskCreated) {
        onTaskCreated();
      }

      // Add Notification if assigned to someone other than the current user
      if (assigneeName && selectedProject) {
        const assigneeUser = allUsers.find(
          u => u.full_name === assigneeName || u.email === assigneeName
        );
        if (assigneeUser && assigneeUser.id !== user?.id) {
          await addNotification(
            "Project Update",
            `${user?.full_name || 'Chief Sthapathy'} added a new task "${newTaskTitle.trim()}" in project "${selectedProject.name}"`,
            assigneeUser.id,
            { type: "project", id: selectedProject.id, project_name: selectedProject.name }
          );
        }
      }

      toast.success("Task raised successfully!");
    } catch (err: any) {
      console.error("Error raising task:", err);
      toast.error(`Failed to raise task: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const renderHeader = () => {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {hasProjectManagementAccess(user?.role) && (
            <button
              onClick={() => setIsAddTaskOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm hover:shadow transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Raise Task</span>
            </button>
          )}
          <div className="flex items-center gap-1">
            <button 
              onClick={prevMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-slate-400 hover:text-indigo-600"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              onClick={nextMonth}
              className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-slate-400 hover:text-indigo-600"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const date = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-2">
          {date[i]}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        
        const dayEvents = events.filter(event => {
          if (!event.date) return false;
          const eventDate = parseISO(event.date);
          return isValid(eventDate) && isSameDay(eventDate, cloneDay);
        });

        days.push(
          <div
            key={day.toString()}
            onClick={() => setSelectedDay(cloneDay)}
            className={cn(
              "min-h-[120px] p-2 border border-slate-100 dark:border-white/10 transition-all cursor-pointer",
              !isSameMonth(day, monthStart) ? "bg-slate-50 dark:bg-[#181818] dark:border-white/5 text-slate-300" : "bg-white dark:bg-[#121212] text-slate-900 dark:text-zinc-100",
              isSameDay(day, new Date()) && "bg-indigo-50/30 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20",
              isSameDay(day, selectedDay) && "ring-2 ring-indigo-500 ring-inset z-10"
            )}
          >
            <span className={cn(
              "text-xs font-bold",
              isSameDay(day, new Date()) ? "text-indigo-600 dark:text-indigo-400" : ""
            )}>{formattedDate}</span>
            
            <div className="mt-2 space-y-1">
              {dayEvents.map(event => (
                <div 
                  key={`${event.type}-${event.id}`} 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(event);
                  }}
                  className={cn(
                    "text-[9px] font-bold p-1 rounded-md truncate border cursor-pointer hover:brightness-95 transition-all text-left",
                    event.type === 'project'
                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                      : event.type === 'leave'
                        ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20"
                        : event.status === 'Completed' 
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20" 
                          : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20"
                  )}
                  title={`${event.type.toUpperCase()}: ${event.title}${event.project_name ? ` (${event.project_name})` : ''}`}
                >
                  <span className="opacity-50 mr-1">
                    {event.type === 'project' ? 'P:' : event.type === 'leave' ? 'L:' : 'T:'}
                  </span>
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/10 shadow-sm">{rows}</div>;
  };

  const renderRightPanel = () => {
    const today = new Date();
    
    const todayEvents = events.filter(e => e.date && isSameDay(parseISO(e.date), today));
    const upcomingEvents = events.filter(e => {
      if (!e.date) return false;
      const d = parseISO(e.date);
      return d > today && !isSameDay(d, today);
    }).sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime()).slice(0, 5);

    const projectEvents = selectedProjectName && selectedProjectName !== 'all'
      ? events.filter(e => e.project_name === selectedProjectName)
      : [];

    const selectedDayEvents = events.filter(event => {
      if (!event.date) return false;
      const eventDate = parseISO(event.date);
      return isValid(eventDate) && isSameDay(eventDate, selectedDay);
    });

    const Section = ({ title, items, emptyMsg }: { title: string, items: CalendarEvent[], emptyMsg: string }) => (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
          <Badge variant="secondary" className="bg-white dark:bg-[#181818] text-indigo-600 dark:text-indigo-400 font-bold text-[10px] border dark:border-white/10">
            {items.length}
          </Badge>
        </div>
        {items.length === 0 ? (
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 italic py-3 text-center bg-white dark:bg-[#181818] rounded-xl border border-dashed border-slate-200 dark:border-white/10">
            {emptyMsg}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map(event => (
              <div 
                key={`${event.type}-${event.id}`}
                onClick={() => onEventClick?.(event)}
                className={cn(
                  "p-3 rounded-xl border bg-white dark:bg-[#181818] shadow-sm hover:shadow-md transition-all cursor-pointer group",
                  event.type === 'project' ? "border-amber-100 dark:border-amber-500/20" : event.type === 'leave' ? "border-rose-100 dark:border-rose-500/20" : "border-indigo-100 dark:border-indigo-500/20"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge className={cn(
                    "text-[7px] font-black uppercase tracking-tighter px-1 py-0",
                    event.type === 'project' ? "bg-amber-500 text-white" : event.type === 'leave' ? "bg-rose-500 text-white" : "bg-indigo-500 text-white"
                  )}>
                    {event.type}
                  </Badge>
                  <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-500">
                    {event.date ? format(parseISO(event.date), 'MMM d') : ''}
                  </span>
                </div>
                <h5 className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">{event.title}</h5>
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="bg-slate-50 dark:bg-[#121212] rounded-3xl p-6 border border-slate-100 dark:border-white/10 h-full flex flex-col gap-8 overflow-y-auto max-h-[800px] no-scrollbar">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest">
            {format(selectedDay, 'MMMM d, yyyy')}
          </h3>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Selected Date Overview</p>
        </div>

        <Section 
          title="Selected Day" 
          items={selectedDayEvents} 
          emptyMsg="No events for this day" 
        />

        <Separator className="bg-slate-200/50" />

        <Section 
          title="Today's Tasks" 
          items={todayEvents} 
          emptyMsg="No tasks for today" 
        />

        <Section 
          title="Upcoming" 
          items={upcomingEvents} 
          emptyMsg="No upcoming tasks" 
        />

        {selectedProjectName && selectedProjectName !== 'all' && (
          <Section 
            title={`Tasks in ${selectedProjectName}`} 
            items={projectEvents} 
            emptyMsg="No tasks in this project" 
          />
        )}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 bg-white dark:bg-[#121212] rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100 dark:border-white/10">
          {renderHeader()}
          {renderDays()}
          {renderCells()}
        </div>
        <div className="w-full lg:w-96 shrink-0">
          {renderRightPanel()}
        </div>
      </div>

      {/* Raise Task Modal */}
      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[95vh] overflow-y-auto bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-slate-950 dark:text-zinc-100 flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              <span>Raise New Task</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-zinc-400">
              Create and assign a task to manage temple site site carving schedules.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRaiseTaskSubmit} className="space-y-4">
            {/* Project Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                Select Project <span className="text-rose-500">*</span>
              </label>
              {loadingProjects ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading projects...</span>
                </div>
              ) : (
                <select
                  value={newTaskProjectId}
                  onChange={(e) => setNewTaskProjectId(e.target.value)}
                  className="w-full h-10 px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-900 dark:text-zinc-100 font-medium"
                  required
                >
                  <option value="" disabled>Choose a project...</option>
                  {localProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Task Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                Task Title <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="What needs to be done?"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="w-full h-10 border border-slate-200 dark:border-white/10 rounded-xl px-3 text-sm focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 transition-all"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                Description (Optional)
              </label>
              <Textarea
                placeholder="Add more details about the task..."
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                className="w-full min-h-[80px] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 transition-all"
              />
            </div>

            {/* Assign To */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                Assignee
              </label>
              <select
                value={newTaskAssignee}
                onChange={(e) => setNewTaskAssignee(e.target.value)}
                className="w-full h-10 px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-900 dark:text-zinc-100 font-medium"
              >
                <option value="Unassigned">Unassigned</option>
                {Array.from(new Set(allUsers.map(u => u.full_name || u.email || 'Unnamed User'))).map(displayName => (
                  <option key={displayName} value={displayName}>
                    {displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Deadline */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Deadline
                </label>
                <Input
                  type="date"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                  className="w-full h-10 border border-slate-200 dark:border-white/10 rounded-xl px-3 text-sm focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 transition-all text-slate-900 dark:text-zinc-100 dark:bg-zinc-900"
                />
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Priority
                </label>
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as any)}
                  className="w-full h-10 px-3 py-1.5 text-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all text-slate-900 dark:text-zinc-100 font-medium"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setIsAddTaskOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-850 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingTask}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 rounded-xl shadow-sm transition-all"
              >
                {isSubmittingTask ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Raising Task...</span>
                  </>
                ) : (
                  <span>Raise Task</span>
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
