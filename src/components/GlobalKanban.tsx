import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Task, Project, hasAdminAccess, hasProjectManagementAccess, isLimitedUser } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { useUser } from '../contexts/UserContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { Loader2, Filter } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';

export const GlobalKanban: React.FC<{ onProjectClick: (p: Project) => void }> = ({ onProjectClick }) => {
  const { user, allUsers } = useUser();
  const { t } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  const [isTaskAuditDialogOpen, setIsTaskAuditDialogOpen] = useState(false);
  const [taskToAudit, setTaskToAudit] = useState<Task | null>(null);
  const [taskAuditComment, setTaskAuditComment] = useState('');
  const [taskAuditFileUrl, setTaskAuditFileUrl] = useState('');
  const [taskAuditAssignee, setTaskAuditAssignee] = useState<string>('');
  const [isSubmittingTaskAudit, setIsSubmittingTaskAudit] = useState(false);
  const [projectFiles, setProjectFiles] = useState<{id: string, title: string, file_url: string}[]>([]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const handleTaskClick = async (task: Task) => {
    setTaskToAudit(task);
    setTaskAuditComment('');
    setTaskAuditFileUrl(task.attachment_url || '');
    setTaskAuditAssignee(task.assigned_to || 'Unassigned');
    setIsTaskAuditDialogOpen(true);

    try {
      const { data } = await supabase.from('project_files').select('id, title, file_url').eq('project_id', task.project_id);
      setProjectFiles(data || []);
    } catch (err) { }
  };

  const handleSaveTaskAudit = async () => {
    if (!taskToAudit) return;
    setIsSubmittingTaskAudit(true);
    try {
      const finalAttachmentUrl = taskAuditFileUrl === 'none' ? null : (taskAuditFileUrl || null);
      const finalAssignee = taskAuditAssignee === 'Unassigned' ? null : taskAuditAssignee;
      
      let newComment = taskToAudit.comment || '';
      const parts = [];
      const timestamp = new Date().toLocaleString();
      
      if (taskAuditComment.trim()) {
         parts.push(`[${timestamp}] ${user?.full_name}: ${taskAuditComment.trim()}`);
      }
      
      if (taskToAudit.assigned_to !== finalAssignee) {
         parts.push(`[${timestamp}] Assigned to ${finalAssignee || 'Unassigned'} by ${user?.full_name}`);
      }
      
      if (parts.length > 0) {
         newComment = newComment ? `${newComment}\n\n${parts.join('\n')}` : parts.join('\n');
      }

      const { error } = await supabase.from('tasks').update({
        comment: newComment || null,
        attachment_url: finalAttachmentUrl,
        assigned_to: finalAssignee
      }).eq('id', taskToAudit.id);
      
      if (error) {
        throw error;
      } else {
        toast.success("Task updated with audit info");
        setIsTaskAuditDialogOpen(false);
        fetchData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update task audit');
    } finally {
      setIsSubmittingTaskAudit(false);
    }
  };
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Projects
      let projectsQuery = supabase.from('projects').select('id, name');
      const { data: projectsData, error: projectsError } = await projectsQuery;
      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Fetch Tasks
      let query = supabase.from('tasks').select('*, projects(name)');
      if (!hasAdminAccess(user?.role)) {
        query = query.eq('assigned_to', user?.full_name);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTasks(data || []);
    } catch (err: any) {
      console.error('Error fetching global tasks:', err);
      toast.error('Failed to load Kanban board');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (task: Task, newStatus: Task['status']) => {
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          completed_at: newStatus === 'Completed' ? new Date().toISOString() : null
        })
        .eq('id', task.id);

      if (error) throw error;
      
      // Update local state
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
      toast.success(`Task moved to ${newStatus}`);
    } catch (err) {
      toast.error('Failed to update task status');
    }
  };

  const filteredTasks = selectedProjectId === 'all' 
    ? tasks 
    : tasks.filter(t => t.project_id === selectedProjectId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(!hasAdminAccess(user?.role) && user?.role !== 'finance_manager') ? (
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-3">
            {t('kanban')}
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-2 text-lg">
            Welcome back, <span className="text-indigo-600 font-bold">{user?.full_name}</span>! Here's your task board.
          </p>
        </div>
      ) : null}

      <div className={cn("flex flex-col sm:flex-row sm:items-center gap-4", (!hasAdminAccess(user?.role) && user?.role !== 'finance_manager') ? "justify-end" : "justify-between")}>
        {(hasAdminAccess(user?.role) || user?.role === 'finance_manager') && (
          <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">{t('kanban')}</h2>
        )}
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-[#121212] dark:bg-slate-900 dark:border-white/10 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 shadow-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-[200px] border-none shadow-none h-8 p-0 focus:ring-0 text-xs font-bold">
                <SelectValue placeholder={t('filter_by_project')} />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">{t('all_projects')}</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 dark:border-slate-800 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {t('showing')} {filteredTasks.length} {t('tasks')} {user?.role !== 'admin' ? t('assigned_to_you') : t('across_all_projects')}
            </p>
          </div>
        </div>
      </div>
      <KanbanBoard tasks={filteredTasks} onStatusChange={handleStatusChange} onTaskClick={handleTaskClick} />
      <Dialog open={isTaskAuditDialogOpen} onOpenChange={setIsTaskAuditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#121212] border-slate-200 dark:border-white/10">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest">{t('audit_task')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {taskToAudit?.comment && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Audit History</label>
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-3 text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {taskToAudit.comment}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Add {t('audit_comment')}</label>
              <Textarea 
                className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-white/10 dark:text-zinc-100 resize-none h-24"
                placeholder={t('enter_audit_comment')}
                value={taskAuditComment}
                onChange={e => setTaskAuditComment(e.target.value)}
              />
            </div>
            {(hasProjectManagementAccess(user?.role) || user?.role === 'finance_manager') && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Assign To</label>
                <Select value={taskAuditAssignee} onValueChange={setTaskAuditAssignee}>
                  <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-none dark:border-white/10 dark:text-zinc-100 h-11">
                    <SelectValue placeholder="Assign To" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-[#121212] dark:border-white/10">
                    <SelectItem value="Unassigned" className="dark:text-zinc-300 dark:hover:bg-[#181818]">Unassigned</SelectItem>
                    {allUsers.map(u => (
                      <SelectItem key={u.id} value={u.full_name} className="dark:text-zinc-300 dark:hover:bg-[#181818]">{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('attach_file_optional')}</label>
              <Select value={taskAuditFileUrl} onValueChange={setTaskAuditFileUrl}>
                <SelectTrigger className="bg-slate-50 dark:bg-slate-900 border-none dark:border-white/10 dark:text-zinc-100 h-11">
                  <SelectValue placeholder={t('select_file')} />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#121212] dark:border-white/10">
                  <SelectItem value="none" className="dark:text-zinc-300 dark:hover:bg-[#181818]">{t('no_file_attached')}</SelectItem>
                  {projectFiles.map(f => (
                    <SelectItem key={f.id} value={f.file_url} className="dark:text-zinc-300 dark:hover:bg-[#181818]">{f.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="mt-6">
              <Button onClick={handleSaveTaskAudit} disabled={isSubmittingTaskAudit} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                 {isSubmittingTaskAudit ? 'Saving...' : t('save_audit')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
