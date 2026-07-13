import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Task, Project, isLimitedUser, hasAdminAccess } from '../types';
import { CalendarView } from './CalendarView';
import { useUser } from '../contexts/UserContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';
import { Loader2, Filter } from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { parseISO, format, isValid, addDays } from 'date-fns';

export const GlobalCalendar: React.FC<{ onProjectClick: (p: Project) => void }> = ({ onProjectClick }) => {
  const { user } = useUser();
  const { t } = useLanguage();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('all');

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Projects (for deadlines and mapping - everyone needs all projects to resolve names)
      let projectsQuery = supabase.from('projects').select('id, name, deadline, status');
      const { data: projectsData, error: projectsError } = await projectsQuery;
      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Fetch Tasks
      let tasksQuery = supabase.from('tasks').select('id, title, deadline, status, project_id, projects(name)');
      const canViewAll = hasAdminAccess(user?.role) || user?.role === 'deputy_sthapathy' || user?.role === 'finance_manager';
      if (!canViewAll) {
        tasksQuery = tasksQuery.eq('assigned_to', user?.full_name);
      }
      const { data: tasksData, error: tasksError } = await tasksQuery;
      if (tasksError) throw tasksError;

      const taskEvents = (tasksData || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        date: t.deadline,
        status: t.status,
        type: 'task',
        project_id: t.project_id,
        project_name: t.projects?.name
      }));

      const projectEvents = (projectsData || []).map((p: Project) => ({
        id: p.id,
        title: `Project Deadline: ${p.name}`,
        date: p.deadline,
        status: p.status,
        type: 'project',
        project_id: p.id,
        project_name: p.name
      }));

      // Fetch Leaves
      let leavesData: any[] = [];
      try {
        const { data, error } = await supabase.from('leaves').select('*').eq('status', 'Approved');
        if (!error && data) {
          leavesData = data;
        } else {
          const local = localStorage.getItem('app-leaves-data');
          if (local) {
            leavesData = JSON.parse(local).filter((l: any) => l.status === 'Approved');
          }
        }
      } catch (err) {
        const local = localStorage.getItem('app-leaves-data');
        if (local) {
          leavesData = JSON.parse(local).filter((l: any) => l.status === 'Approved');
        }
      }

      const leaveEvents: any[] = [];
      leavesData.forEach((leave: any) => {
        const start = parseISO(leave.start_date);
        const end = parseISO(leave.end_date);
        if (!isValid(start) || !isValid(end)) return;
        
        let current = start;
        while (current <= end) {
          let labelSuffix = '';
          if (leave.duration_type === 'half') {
            labelSuffix = ` (${leave.half_day_period === 'morning' ? 'Morning' : 'Afternoon'})`;
          } else if (leave.duration_type === 'hourly') {
            labelSuffix = ` (${leave.hourly_hours} hrs)`;
          }
          leaveEvents.push({
            id: `${leave.id}-${format(current, 'yyyy-MM-dd')}`,
            title: `On Leave: ${leave.employee_name} (${leave.leave_type}${labelSuffix})`,
            date: format(current, 'yyyy-MM-dd'),
            status: leave.status,
            type: 'leave',
            project_id: 'leave',
            project_name: 'Leaves'
          });
          current = addDays(current, 1);
        }
      });

      setEvents([...taskEvents, ...projectEvents, ...leaveEvents]);
    } catch (err: any) {
      console.error('Error fetching global calendar data:', err);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = selectedProjectName === 'all' 
    ? events 
    : events.filter(e => e.project_name === selectedProjectName);

  const handleEventClick = (event: any) => {
    const project = projects.find(p => p.id === event.project_id);
    if (project) {
      onProjectClick(project);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100 tracking-tight">{t('calendar')}</h2>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-[#121212] dark:bg-slate-900 dark:border-white/10 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 shadow-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <Select value={selectedProjectName} onValueChange={setSelectedProjectName}>
              <SelectTrigger className="w-[200px] border-none shadow-none h-8 p-0 focus:ring-0 text-xs font-bold">
                <SelectValue placeholder={t('filter_by_project')} />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">{t('all_projects')}</SelectItem>
                <SelectItem value="Leaves">Staff Leaves</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 dark:border-slate-800 shadow-sm">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {t('showing')} {filteredEvents.length} {t('events')}
            </p>
          </div>
        </div>
      </div>
      <CalendarView 
        events={filteredEvents} 
        onEventClick={handleEventClick} 
        selectedProjectName={selectedProjectName}
      />
    </div>
  );
};
