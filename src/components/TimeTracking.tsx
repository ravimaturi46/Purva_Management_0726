import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, Project,  } from '../types';
import { useUser } from '../contexts/UserContext';
import { useFileSettings } from '../contexts/FileSettingsContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { SalaryManagement } from './SalaryManagement';

import { Loader2, Calendar, UserIcon, Clock, FileText, Briefcase, Plus, Trash2 } from 'lucide-react';

export const TimeTracking: React.FC = () => {
  const { user } = useUser();
  const { canManageSalaries, canManageTimeTracking } = useFileSettings();
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [customActivities, setCustomActivities] = useLocalStorage<string[]>('custom_activity_types', []);
  const [customActivityInput, setCustomActivityInput] = useState('');
  
  const DEFAULT_ACTIVITIES = [
    "Drawings",
    "Site Inspections",
    "Meetings",
    "Administrative",
    "Concept Design"
  ];
  
  const allActivities = [...DEFAULT_ACTIVITIES, ...customActivities];
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    project_name: '',
    user_id: user?.id || '',
    activity_type: '',
    hours_logged: '',
    remarks: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projectsRes, profilesRes, logsRes] = await Promise.all([
        supabase.from('projects').select('name').order('name'),
        supabase.from('profiles').select('id, full_name, role').order('full_name'),
        supabase.from('time_logs').select(`*, profiles:user_id(full_name)`).order('date', { ascending: false }).limit(50)
      ]);
      
      if (projectsRes.data) setProjects(projectsRes.data);
      if (profilesRes.data) setTeamMembers(profilesRes.data);
      if (logsRes.data) setTimeLogs(logsRes.data);
      
      // If no project_name is set, select first
      if (projectsRes.data && projectsRes.data.length > 0 && !formData.project_name) {
        setFormData(prev => ({ ...prev, project_name: projectsRes.data[0].name }));
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_name || !formData.user_id || !formData.hours_logged) {
      toast.error('Please fill in all required fields');
      return;
    }

    let finalActivityType = formData.activity_type;
    
    if (finalActivityType === 'Other (Custom)') {
      if (!customActivityInput.trim()) {
        toast.error('Please enter a custom activity type');
        return;
      }
      finalActivityType = customActivityInput.trim();
      
      if (!allActivities.includes(finalActivityType)) {
        setCustomActivities(prev => [...prev, finalActivityType]);
      }
    } else if (!finalActivityType) {
      toast.error('Please select an activity type');
      return;
    }

    try {
      // Find the effective hourly rate for this user on this date
      const { data: rates, error: rateError } = await supabase
        .from('team_rates_history')
        .select('hourly_rate')
        .eq('user_id', formData.user_id)
        .lte('effective_date', formData.date)
        .order('effective_date', { ascending: false })
        .limit(1);

      let hourlyRate = 0;
      if (!rateError && rates && rates.length > 0) {
        hourlyRate = rates[0].hourly_rate;
      } else {
        toast.warning('No hourly rate configured for this user. Logging with rate ₹0.', { duration: 5000 });
      }

      const { error } = await supabase.from('time_logs').insert([{
        date: formData.date,
        project_name: formData.project_name,
        user_id: formData.user_id,
        activity_type: finalActivityType,
        hours_logged: parseFloat(formData.hours_logged),
        hourly_rate: hourlyRate,
        remarks: formData.remarks,
        logged_by: user?.id
      }]);

      if (error) {
        if (error.code === '42P01') {
          toast.error("Database table 'time_logs' missing! Admin needs to run the SQL updates.");
        } else {
          throw error;
        }
      } else {
        toast.success('Time logged successfully');
        setFormData(prev => ({
          ...prev,
          activity_type: '',
          hours_logged: '',
          remarks: ''
        }));
        setCustomActivityInput('');
        fetchData();
      }
    } catch (err: any) {
      toast.error('Failed to log time: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('time_logs').delete().eq('id', id);
      if (error) throw error;
      toast.success('Log deleted');
      fetchData();
    } catch (err: any) {
      toast.error('Failed to delete log');
    }
  };

  if (loading && projects.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Time Tracking</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Log team hours and activities across projects.</p>
        </div>
      </div>

      <Tabs defaultValue="log" className="w-full">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 inline-flex">
          <TabsTrigger value="log" className="rounded-lg px-6">Log Hours</TabsTrigger>
          {canManageSalaries(user?.role, 'manage') && (
            <TabsTrigger value="salaries" className="rounded-lg px-6">Salary Management</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="log" className="space-y-6 m-0">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-500" />
          Log Hours
        </h3>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Date</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input 
                type="date" 
                required 
                className="pl-10 h-11 rounded-lg"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>
          </div>
          
          <div className="space-y-1.5" key={projects.length ? 'loaded' : 'loading'}>
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Project</Label>
            <Select 
              value={formData.project_name} 
              onValueChange={(v) => setFormData({...formData, project_name: v})}
            >
              <SelectTrigger className="h-11 rounded-lg">
                <SelectValue placeholder="Select Project">
                  {formData.project_name || 'Select Project'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5" key={teamMembers.length ? 'loaded' : 'loading'}>
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Team Member</Label>
            <Select 
              value={formData.user_id} 
              onValueChange={(v) => setFormData({...formData, user_id: v})}
            >
              <SelectTrigger className="h-11 rounded-lg">
                <SelectValue placeholder="Select Member">
                  {teamMembers.find(m => m.id === formData.user_id)?.full_name || 'Select Member'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:col-span-1">
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Activity Type</Label>
            {formData.activity_type === 'Other (Custom)' ? (
              <div className="flex gap-2">
                <Input 
                  required
                  placeholder="Enter custom activity"
                  className="h-11 rounded-lg flex-1"
                  value={customActivityInput}
                  onChange={(e) => setCustomActivityInput(e.target.value)}
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-11 rounded-lg"
                  onClick={() => {
                    setFormData({...formData, activity_type: ''});
                    setCustomActivityInput('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select 
                required
                value={formData.activity_type} 
                onValueChange={(v) => setFormData({...formData, activity_type: v})}
              >
                <SelectTrigger className="h-11 rounded-lg">
                  <SelectValue placeholder="Select Activity" />
                </SelectTrigger>
                <SelectContent>
                  {allActivities.map(act => (
                    <SelectItem key={act} value={act}>{act}</SelectItem>
                  ))}
                  <SelectItem value="Other (Custom)">Other (Custom)...</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5 lg:col-span-1">
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Hours</Label>
            <Input 
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              required 
              placeholder="e.g. 8"
              className="h-11 rounded-lg"
              value={formData.hours_logged}
              onChange={(e) => setFormData({...formData, hours_logged: e.target.value})}
            />
          </div>

          <div className="space-y-1.5 lg:col-span-1">
            <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Remarks</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <Input 
                placeholder="Optional notes"
                className="pl-10 h-11 rounded-lg"
                value={formData.remarks}
                onChange={(e) => setFormData({...formData, remarks: e.target.value})}
              />
            </div>
          </div>

          <div className="lg:col-span-3 flex justify-end mt-2">
            <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 px-8 rounded-xl font-bold h-11">
              <Plus className="w-4 h-4 mr-2" />
              Log Hours
            </Button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Time Logs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Date</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Member</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Project</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Activity</th>
                <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Hours</th>
                {canManageSalaries(user?.role, 'manage') && (
                  <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Cost (₹)</th>
                )}
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {timeLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-sm">
                    No time logs found.
                  </td>
                </tr>
              ) : (
                timeLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                    <td className="p-4 text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {new Date(log.date).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {log.profiles?.full_name || 'Unknown'}
                    </td>
                    <td className="p-4 text-sm font-bold text-slate-900 dark:text-slate-100">
                      {log.project_name}
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-400">
                      {log.activity_type}
                      {log.remarks && <div className="text-[10px] text-slate-400 mt-0.5">{log.remarks}</div>}
                    </td>
                    <td className="p-4 text-sm font-bold text-slate-900 dark:text-white text-right">
                      {log.hours_logged}h
                    </td>
                    {canManageSalaries(user?.role, 'manage') && (
                      <td className="p-4 text-sm text-amber-600 dark:text-amber-500 font-bold text-right">
                        ₹{log.total_cost?.toLocaleString('en-IN') || '0'}
                      </td>
                    )}
                    <td className="p-4 text-right">
                      {(canManageTimeTracking(user?.role, 'delete') || log.user_id === user?.id) && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(log.id)}
                          className="opacity-0 group-hover:opacity-100 h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </TabsContent>
        
        {canManageSalaries(user?.role, 'manage') && (
          <TabsContent value="salaries" className="m-0">
            <SalaryManagement />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
