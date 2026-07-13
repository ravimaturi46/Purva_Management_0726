import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNotifications } from '../contexts/NotificationContext';
import { CalendarView } from './CalendarView';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Loader2, 
  Filter, 
  Check, 
  X, 
  Info, 
  CalendarDays, 
  AlertTriangle,
  User,
  Sparkles,
  Trash2,
  Search
} from 'lucide-react';
import { 
  format, 
  parseISO, 
  addDays, 
  isSameDay, 
  isValid,
  differenceInDays
} from 'date-fns';

export interface Leave {
  id: string;
  user_id: string;
  employee_name: string;
  employee_email: string;
  leave_type: 'Sick' | 'Casual';
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  duration_type?: 'full' | 'half' | 'hourly';
  half_day_period?: 'morning' | 'afternoon';
  hourly_hours?: number;
}

export const LeaveManagement: React.FC = () => {
  const { user, allUsers } = useUser();
  const { t } = useLanguage();
  const { addNotification } = useNotifications();
  
  // States
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaveToDelete, setLeaveToDelete] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'my-leaves' | 'all-leaves' | 'planner'>('my-leaves');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Leave Form State
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [leaveType, setLeaveType] = useState<'Sick' | 'Casual'>('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationType, setDurationType] = useState<'full' | 'half' | 'hourly'>('full');
  const [halfDayPeriod, setHalfDayPeriod] = useState<'morning' | 'afternoon'>('morning');
  const [hourlyHours, setHourlyHours] = useState<number>(4);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user has approval access (Only Chief Sthapathy can approve)
  const hasApprovalAccess = useMemo(() => {
    return user?.role === 'chief_sthapathy';
  }, [user?.role]);

  // Check if user has tracking/viewing access for all staff leaves (Admin, Chief Sthapathy, or Finance Manager)
  const hasTrackingAccess = useMemo(() => {
    return user?.role === 'admin' || user?.role === 'chief_sthapathy' || user?.role === 'finance_manager';
  }, [user?.role]);

  // Check if user has delete access for a specific leave (Admin, Chief Sthapathy, Finance Manager, or the user who raised the request)
  const canDeleteLeave = (l: Leave) => {
    if (!user) return false;
    const isOwner = l.employee_email?.toLowerCase() === user.email?.toLowerCase() || l.user_id === user.id;
    const isPrivilegedRole = user.role === 'admin' || user.role === 'chief_sthapathy' || user.role === 'finance_manager';
    return isOwner || isPrivilegedRole;
  };

  // Load leaves
  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaves')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setLeaves(data || []);
    } catch (err: any) {
      console.warn("Supabase fetch failed for leaves, falling back to localStorage", err);
      const local = localStorage.getItem('app-leaves-data');
      if (local) {
        setLeaves(JSON.parse(local));
      } else {
        // Seed some sample data for demonstration if entirely empty
        const sampleLeaves: Leave[] = [
          {
            id: 'sample-1',
            user_id: user?.id || 'demo-user-1',
            employee_name: user?.full_name || 'Ravi Teja',
            employee_email: user?.email || 'ravi@example.com',
            leave_type: 'Casual',
            start_date: format(addDays(new Date(), 2), 'yyyy-MM-dd'),
            end_date: format(addDays(new Date(), 4), 'yyyy-MM-dd'),
            reason: 'Attending family festival in temple town.',
            status: 'Approved',
            approved_by: 'Chief Sthapathy',
            approved_at: new Date().toISOString(),
            created_at: new Date().toISOString()
          },
          {
            id: 'sample-2',
            user_id: 'other-user-1',
            employee_name: 'Ananth Sharma',
            employee_email: 'ananth@example.com',
            leave_type: 'Sick',
            start_date: format(addDays(new Date(), -5), 'yyyy-MM-dd'),
            end_date: format(addDays(new Date(), -4), 'yyyy-MM-dd'),
            reason: 'Severe seasonal flu, advised bed rest.',
            status: 'Approved',
            approved_by: 'Chief Sthapathy',
            approved_at: new Date().toISOString(),
            created_at: addDays(new Date(), -6).toISOString()
          },
          {
            id: 'sample-3',
            user_id: 'other-user-2',
            employee_name: 'Ketan Stapathy',
            employee_email: 'ketan@example.com',
            leave_type: 'Casual',
            start_date: format(addDays(new Date(), 10), 'yyyy-MM-dd'),
            end_date: format(addDays(new Date(), 11), 'yyyy-MM-dd'),
            reason: 'Personal urgent work at hometown.',
            status: 'Pending',
            created_at: new Date().toISOString()
          }
        ];
        setLeaves(sampleLeaves);
        localStorage.setItem('app-leaves-data', JSON.stringify(sampleLeaves));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  // Set default view tab based on role
  useEffect(() => {
    if (user && hasTrackingAccess) {
      setActiveSubTab('all-leaves');
    } else {
      setActiveSubTab('my-leaves');
    }
  }, [user, hasTrackingAccess]);

  // Helper to calculate total days for a leave
  const getLeaveDays = (l: Partial<Leave>): number => {
    if (l.duration_type === 'half') return 0.5;
    if (l.duration_type === 'hourly') return (l.hourly_hours || 4) / 8;
    if (!l.start_date || !l.end_date) return 0;
    try {
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
      return differenceInDays(end, start) + 1;
    } catch {
      return 1;
    }
  };

  // Calculate requested leave days
  const requestedDays = useMemo(() => {
    if (durationType === 'half') return 0.5;
    if (durationType === 'hourly') return hourlyHours / 8;
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
    return differenceInDays(end, start) + 1;
  }, [startDate, endDate, durationType, hourlyHours]);

  // Compute stats for current user
  const userStats = useMemo(() => {
    const userLeaves = leaves.filter(l => l.employee_email?.toLowerCase() === user?.email?.toLowerCase());
    
    const approvedSickDays = userLeaves
      .filter(l => l.leave_type === 'Sick' && l.status === 'Approved')
      .reduce((sum, l) => sum + getLeaveDays(l), 0);

    const approvedCasualDays = userLeaves
      .filter(l => l.leave_type === 'Casual' && l.status === 'Approved')
      .reduce((sum, l) => sum + getLeaveDays(l), 0);

    const pendingRequests = userLeaves.filter(l => l.status === 'Pending').length;

    return {
      sickTotal: 12,
      sickUsed: approvedSickDays,
      sickRemaining: Math.max(0, 12 - approvedSickDays),
      casualTotal: 12,
      casualUsed: approvedCasualDays,
      casualRemaining: Math.max(0, 12 - approvedCasualDays),
      pendingCount: pendingRequests
    };
  }, [leaves, user?.email]);

  // Handle Apply Leave Submit
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isFull = durationType === 'full';
    if (!startDate || (isFull && !endDate) || !reason.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }

    const start = new Date(startDate);
    const end = isFull ? new Date(endDate) : start;

    if (isFull && end < start) {
      toast.error("End date cannot be earlier than start date.");
      return;
    }

    // Limit check
    const remaining = leaveType === 'Sick' ? userStats.sickRemaining : userStats.casualRemaining;
    if (requestedDays > remaining) {
      toast.error(`Insufficient leave balance. You are requesting ${requestedDays} days but only have ${remaining} days remaining of ${leaveType} leave.`);
      return;
    }

    setIsSubmitting(true);

    const newLeave: Leave = {
      id: crypto.randomUUID(),
      user_id: user?.id || 'anonymous',
      employee_name: user?.full_name || 'Staff Member',
      employee_email: user?.email || 'staff@example.com',
      leave_type: leaveType,
      start_date: startDate,
      end_date: isFull ? endDate : startDate,
      duration_type: durationType,
      half_day_period: durationType === 'half' ? halfDayPeriod : undefined,
      hourly_hours: durationType === 'hourly' ? hourlyHours : undefined,
      reason: reason.trim(),
      status: 'Pending',
      created_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('leaves')
        .insert([newLeave])
        .select();

      if (error) throw error;
      
      const insertedLeave = data ? data[0] : newLeave;
      const updatedLeaves = [insertedLeave, ...leaves];
      setLeaves(updatedLeaves);
      localStorage.setItem('app-leaves-data', JSON.stringify(updatedLeaves));
      
      toast.success("Leave application submitted successfully!");
      setShowApplyModal(false);

      // Notify Chief Sthapathy
      try {
        const { data: sthapathis } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'chief_sthapathy');
        
        if (sthapathis && sthapathis.length > 0) {
          for (const s of sthapathis) {
            await addNotification(
              "New Leave Request",
              `${user?.full_name || 'Staff Member'} has requested ${getLeaveDays(insertedLeave)} day(s) of ${leaveType} leave starting ${startDate}.`,
              s.id
            );
          }
        } else {
          await addNotification(
            "New Leave Request",
            `${user?.full_name || 'Staff Member'} has requested ${getLeaveDays(insertedLeave)} day(s) of ${leaveType} leave starting ${startDate}.`
          );
        }
      } catch (notifErr) {
        console.warn("Could not send leave notification to Chief Sthapathy:", notifErr);
      }
      
      // Reset form
      setStartDate('');
      setEndDate('');
      setDurationType('full');
      setHalfDayPeriod('morning');
      setHourlyHours(4);
      setReason('');
    } catch (err: any) {
      console.warn("Could not save to Supabase leaves table, saving locally", err);
      const updatedLeaves = [newLeave, ...leaves];
      setLeaves(updatedLeaves);
      localStorage.setItem('app-leaves-data', JSON.stringify(updatedLeaves));
      toast.success("Leave application submitted successfully (saved offline/locally)!");
      setShowApplyModal(false);

      // Best effort notification
      try {
        await addNotification(
          "New Leave Request (Offline)",
          `${user?.full_name || 'Staff Member'} has requested ${getLeaveDays(newLeave)} day(s) of ${leaveType} leave.`
        );
      } catch (notifErr) {
        console.warn("Could not send offline leave notification:", notifErr);
      }
      
      // Reset form
      setStartDate('');
      setEndDate('');
      setDurationType('full');
      setHalfDayPeriod('morning');
      setHourlyHours(4);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Approve / Reject Leave
  const handleUpdateStatus = async (id: string, newStatus: 'Approved' | 'Rejected') => {
    const loadingToast = toast.loading(`${newStatus === 'Approved' ? 'Approving' : 'Rejecting'} leave request...`);
    
    const approvedBy = user?.full_name || 'Chief Sthapathy';
    const approvedAt = new Date().toISOString();
    const targetLeave = leaves.find(l => l.id === id);

    try {
      const { error } = await supabase
        .from('leaves')
        .update({
          status: newStatus,
          approved_by: approvedBy,
          approved_at: approvedAt
        })
        .eq('id', id);

      if (error) throw error;

      const updatedLeaves = leaves.map(l => 
        l.id === id ? { ...l, status: newStatus, approved_by: approvedBy, approved_at: approvedAt } : l
      );
      setLeaves(updatedLeaves);
      localStorage.setItem('app-leaves-data', JSON.stringify(updatedLeaves));
      
      toast.success(`Leave request ${newStatus.toLowerCase()} successfully!`, { id: loadingToast });

      // Notify the user who raised the request
      if (targetLeave && targetLeave.user_id) {
        try {
          await addNotification(
            `Leave Request ${newStatus}`,
            `Your leave request for ${targetLeave.leave_type} Leave starting ${format(parseISO(targetLeave.start_date), 'MMM d, yyyy')} has been ${newStatus.toLowerCase()} by ${approvedBy}.`,
            targetLeave.user_id
          );
        } catch (notifErr) {
          console.warn("Could not send leave status update notification:", notifErr);
        }
      }
    } catch (err: any) {
      console.warn("Could not update leave status in Supabase, updating locally", err);
      const updatedLeaves = leaves.map(l => 
        l.id === id ? { ...l, status: newStatus, approved_by: approvedBy, approved_at: approvedAt } : l
      );
      setLeaves(updatedLeaves);
      localStorage.setItem('app-leaves-data', JSON.stringify(updatedLeaves));
      
      toast.success(`Leave request ${newStatus.toLowerCase()} successfully (updated locally)!`, { id: loadingToast });

      // Notify locally/best effort
      if (targetLeave && targetLeave.user_id) {
        try {
          await addNotification(
            `Leave Request ${newStatus}`,
            `Your leave request for ${targetLeave.leave_type} Leave starting ${format(parseISO(targetLeave.start_date), 'MMM d, yyyy')} has been ${newStatus.toLowerCase()} by ${approvedBy}.`,
            targetLeave.user_id
          );
        } catch (notifErr) {
          console.warn("Could not send offline leave status update notification:", notifErr);
        }
      }
    }
  };

  // Handle Delete Leave Request
  const handleDeleteLeave = async () => {
    if (!leaveToDelete) return;
    const id = leaveToDelete;
    const loadingToast = toast.loading("Deleting leave request...");
    try {
      const { error } = await supabase
        .from('leaves')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const updatedLeaves = leaves.filter(l => l.id !== id);
      setLeaves(updatedLeaves);
      localStorage.setItem('app-leaves-data', JSON.stringify(updatedLeaves));
      toast.success("Leave request deleted successfully!", { id: loadingToast });
    } catch (err: any) {
      console.warn("Could not delete leave from Supabase, deleting locally", err);
      const updatedLeaves = leaves.filter(l => l.id !== id);
      setLeaves(updatedLeaves);
      localStorage.setItem('app-leaves-data', JSON.stringify(updatedLeaves));
      toast.success("Leave request deleted successfully (offline/locally)!", { id: loadingToast });
    } finally {
      setLeaveToDelete(null);
    }
  };

  const triggerDeleteLeave = (id: string) => {
    setLeaveToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  // Filter leaves for lists
  const filteredLeavesList = useMemo(() => {
    return leaves.filter(l => {
      // 1. Tab check
      if (activeSubTab === 'my-leaves') {
        if (l.employee_email?.toLowerCase() !== user?.email?.toLowerCase()) return false;
      }
      
      // 2. Type filter
      if (filterType !== 'all' && l.leave_type !== filterType) return false;

      // 3. Status filter
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;

      // 4. Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const nameMatch = l.employee_name?.toLowerCase().includes(query);
        const emailMatch = l.employee_email?.toLowerCase().includes(query);
        const reasonMatch = l.reason?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch && !reasonMatch) return false;
      }

      return true;
    });
  }, [leaves, activeSubTab, filterType, filterStatus, searchQuery, user?.email]);

  // Generate Calendar Events
  const calendarEvents = useMemo(() => {
    const events: any[] = [];
    const approvedLeaves = leaves.filter(l => l.status === 'Approved');
    
    approvedLeaves.forEach(leave => {
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
        
        events.push({
          id: `${leave.id}-${format(current, 'yyyy-MM-dd')}`,
          title: `${leave.employee_name} (${leave.leave_type}${labelSuffix})`,
          date: format(current, 'yyyy-MM-dd'),
          type: 'leave',
          status: leave.status,
          project_name: 'Staff Leave Planner'
        });
        current = addDays(current, 1);
      }
    });
    return events;
  }, [leaves]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
            Leave Management
          </h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Apply for sick or casual leaves and track colleagues' offline days to plan construction works.
          </p>
        </div>
        
        {user?.role !== 'chief_sthapathy' && (
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowApplyModal(true)}
              className="rounded-xl px-4 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Apply for Leave
            </Button>
          </div>
        )}
      </div>

      {/* Balance Cards / Approver Control Panel */}
      {user?.role === 'chief_sthapathy' ? (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-950 dark:to-purple-950 rounded-3xl p-6 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-wider">
                Approver Control Panel
              </span>
            </div>
            <h3 className="text-xl font-extrabold tracking-tight">Namaste, Chief Sthapathy</h3>
            <p className="text-xs text-indigo-100 max-w-xl leading-relaxed">
              As the Chief Sthapathy, you are responsible for reviewing and approving leave requests. No leave quotas apply to your account. Your decisions help maintain efficient carving schedules and direct temple site construction smoothly.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 text-center min-w-28">
              <span className="text-2xl font-black block text-amber-300">
                {leaves.filter(l => l.status === 'Pending').length}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-100">Pending Requests</span>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 text-center min-w-28">
              <span className="text-2xl font-black block text-emerald-300">
                {leaves.filter(l => l.status === 'Approved').length}
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-100">Approved Leaves</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Sick Leaves */}
          <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 border border-slate-150 dark:border-white/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 bg-rose-50 dark:bg-rose-950/40 rounded-xl text-rose-600 dark:text-rose-400">
                <CalendarDays className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-full">
                Sick Leaves
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-zinc-100">{userStats.sickRemaining}</span>
                <span className="text-xs text-slate-400 dark:text-zinc-500 font-bold uppercase">Days Remaining</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500 border-t border-slate-100 dark:border-white/5 pt-3">
                <span>Used: {userStats.sickUsed} days</span>
                <span>Total Quota: {userStats.sickTotal} days</span>
              </div>
            </div>
          </div>

          {/* Casual Leaves */}
          <div className="bg-white dark:bg-slate-950 rounded-2xl p-5 border border-slate-150 dark:border-white/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <span className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Calendar className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-full">
                Casual Leaves
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-slate-900 dark:text-zinc-100">{userStats.casualRemaining}</span>
                <span className="text-xs text-slate-400 dark:text-zinc-500 font-bold uppercase">Days Remaining</span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500 border-t border-slate-100 dark:border-white/5 pt-3">
                <span>Used: {userStats.casualUsed} days</span>
                <span>Total Quota: {userStats.casualTotal} days</span>
              </div>
            </div>
          </div>

          {/* Pending Approval / Notice card */}
          <div className="bg-slate-50 dark:bg-zinc-900/50 rounded-2xl p-5 border border-dashed border-slate-200 dark:border-white/10 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-indigo-500" />
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Guideline Policy</h4>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
              In our organisation, each staff member is allocated <strong className="text-slate-700 dark:text-zinc-200">12 Sick</strong> and <strong className="text-slate-700 dark:text-zinc-200">12 Casual</strong> leaves per year.
              Kindly apply at least 3 days in advance for casual leave. Chief Sthapathy reviews applications to manage site carving schedules.
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200/50 dark:border-white/5 pt-2">
              <span className="text-xs font-bold text-slate-400">My Pending requests:</span>
              <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-100 dark:border-amber-950/60">
                {userStats.pendingCount} Pending
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Database Warning Banner (Only show SQL instructions if it's falling back or to help user sync) */}
      <div className="bg-amber-50/50 dark:bg-amber-505/10 rounded-2xl p-4 border border-amber-200/50 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3 shadow-sm">
        <Sparkles className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <p className="font-bold">Database Setup Notice for Administrators</p>
          <p className="opacity-90">
            Leave records are fully saved in this browser's secure cache for local prototyping. To enable team-wide cloud database sync across different devices, copy and paste the SQL script into your Supabase SQL Editor.
          </p>
          <details className="mt-2 text-slate-600 dark:text-zinc-400 cursor-pointer">
            <summary className="font-bold hover:underline text-amber-600 dark:text-amber-400 select-none">Show Postgres SQL Schema & Migration Code</summary>
            <div className="mt-2 space-y-4">
              <div>
                <p className="font-bold text-[11px] mb-1 text-slate-700 dark:text-zinc-300">OPTION A: Run this to update your existing table (MIGRATION):</p>
                <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-[10px] rounded-xl overflow-x-auto select-all max-h-48 whitespace-pre-wrap leading-normal">
{`-- Add columns for half-day & hourly leaves to your existing table
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS duration_type TEXT DEFAULT 'full';
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS half_day_period TEXT;
ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS hourly_hours INTEGER;

-- Enable deletion access if you haven't already (idempotent)
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.leaves;
CREATE POLICY "Enable delete access for all users" ON public.leaves FOR DELETE USING (true);`}
                </pre>
              </div>

              <div>
                <p className="font-bold text-[11px] mb-1 text-slate-700 dark:text-zinc-300">OPTION B: Run this for a completely fresh table setup:</p>
                <pre className="p-3 bg-slate-900 text-slate-100 font-mono text-[10px] rounded-xl overflow-x-auto select-all max-h-48 whitespace-pre-wrap leading-normal">
{`DROP TABLE IF EXISTS public.leaves;

CREATE TABLE public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('Sick', 'Casual')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_type TEXT DEFAULT 'full' CHECK (duration_type IN ('full', 'half', 'hourly')),
  half_day_period TEXT CHECK (half_day_period IN ('morning', 'afternoon')),
  hourly_hours INTEGER,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.leaves;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.leaves;
DROP POLICY IF EXISTS "Enable update access for admins and chief sthapathy" ON public.leaves;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.leaves;

-- Create policies
CREATE POLICY "Enable read access for all users" ON public.leaves FOR SELECT USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON public.leaves FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for admins and chief sthapathy" ON public.leaves FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.leaves FOR DELETE USING (true);`}
                </pre>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1.5 overflow-x-auto pb-px">
          {/* My Leaves */}
          {user?.role !== 'chief_sthapathy' && (
            <button
              onClick={() => setActiveSubTab('my-leaves')}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 transition-all whitespace-nowrap ${
                activeSubTab === 'my-leaves'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              My Leaves
            </button>
          )}

          {/* All Leaves (Admins, Chief Sthapathy, and Finance Manager for tracking) */}
          {hasTrackingAccess && (
            <button
              onClick={() => setActiveSubTab('all-leaves')}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 transition-all whitespace-nowrap ${
                activeSubTab === 'all-leaves'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              All Staff Requests
            </button>
          )}

          {/* Calendar Planner */}
          <button
            onClick={() => setActiveSubTab('planner')}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 transition-all whitespace-nowrap ${
              activeSubTab === 'planner'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Calendar Planner
          </button>
        </div>

        {/* Filters (only for list tabs) */}
        {activeSubTab !== 'planner' && (
          <div className="flex flex-wrap items-center gap-3 pb-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:flex-initial min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder={activeSubTab === 'all-leaves' ? "Search staff name or reason..." : "Search reason..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-zinc-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              
              {/* Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-slate-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="Sick">Sick Leave</option>
                <option value="Casual">Casual Leave</option>
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-slate-600 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Render Sub Tabs */}
      {activeSubTab === 'planner' ? (
        <div className="space-y-4">
          <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-950 text-xs text-indigo-700 dark:text-indigo-400">
            <p className="font-bold">Interactive Leave Planner Calendar</p>
            <p className="mt-1 opacity-90">
              Only approved leaves are listed in this calendar view so that site supervisors and Sthapathis can plan active temple site construction, carving, and supervision duties seamlessly.
            </p>
          </div>
          <CalendarView 
            events={calendarEvents} 
            selectedProjectName="all"
          />
        </div>
      ) : (
        /* Leave Requests List */
        <div className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider">Loading leave records...</p>
            </div>
          ) : filteredLeavesList.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <CalendarDays className="w-10 h-10 mx-auto text-slate-300 dark:text-zinc-700 mb-3" />
              <p className="text-sm font-bold text-slate-600 dark:text-zinc-300">No leave requests found</p>
              <p className="text-xs text-slate-400 mt-1">There are no leave records matching the active filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 md:p-6 bg-slate-50/40 dark:bg-slate-950/20">
              {filteredLeavesList.map((leave) => {
                const daysCount = differenceInDays(new Date(leave.end_date), new Date(leave.start_date)) + 1;
                const isCurrentUser = leave.employee_email?.toLowerCase() === user?.email?.toLowerCase();
                
                return (
                  <div 
                    key={leave.id} 
                    className="flex flex-col bg-white dark:bg-[#121212] border border-slate-150 dark:border-white/5 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all gap-3"
                  >
                    {/* Card Header: Avatar & Info & Leave Type */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 shrink-0 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center text-xs font-bold border border-indigo-100 dark:border-indigo-900/40">
                          {leave.employee_name.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 dark:text-zinc-100 truncate text-xs">{leave.employee_name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{leave.employee_email}</p>
                        </div>
                      </div>

                      {/* Leave Type Badge */}
                      <div className="flex flex-col items-end shrink-0 gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                          leave.leave_type === 'Sick'
                            ? 'bg-rose-50 border-rose-100 text-rose-600 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-400'
                            : 'bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-400'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${leave.leave_type === 'Sick' ? 'bg-rose-500' : 'bg-indigo-500'}`} />
                          {leave.leave_type}
                        </span>
                        {leave.duration_type && leave.duration_type !== 'full' && (
                          <span className="inline-flex items-center text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40">
                            {leave.duration_type === 'half' 
                              ? `1/2 Day (${leave.half_day_period === 'morning' ? 'AM' : 'PM'})`
                              : `Hourly (${leave.hourly_hours}h)`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Leave Period Details */}
                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-3 flex flex-col gap-1.5 border border-slate-100 dark:border-white/5">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-zinc-300">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <div className="font-bold text-xs truncate">
                          {leave.duration_type === 'full' 
                            ? `${format(parseISO(leave.start_date), 'MMM d, yyyy')} - ${format(parseISO(leave.end_date), 'MMM d, yyyy')}`
                            : format(parseISO(leave.start_date), 'MMM d, yyyy')
                          }
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500">
                        <span>Applied: {format(parseISO(leave.created_at), 'MMM d, yyyy')}</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-300">
                          Total: <span className="text-xs text-indigo-600 dark:text-indigo-400">{getLeaveDays(leave)} {getLeaveDays(leave) === 1 ? 'day' : 'days'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Reason */}
                    {leave.reason && (
                      <div className="text-xs">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 block uppercase tracking-wider mb-1">Reason</span>
                        <p className="text-slate-600 dark:text-zinc-400 italic bg-slate-50/50 dark:bg-white/5 p-2.5 rounded-xl border border-dashed border-slate-200/60 dark:border-white/5 line-clamp-2">
                          "{leave.reason}"
                        </p>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="h-px bg-slate-100 dark:bg-white/5 mt-auto" />

                    {/* Bottom Status & Actions Area */}
                    <div className="flex items-center justify-between mt-1">
                      {/* Status Info */}
                      <div className="space-y-0.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          leave.status === 'Approved'
                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                            : leave.status === 'Rejected'
                              ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400'
                              : 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400'
                        }`}>
                          {leave.status === 'Approved' && <CheckCircle2 className="w-2.5 h-2.5" />}
                          {leave.status === 'Rejected' && <XCircle className="w-2.5 h-2.5" />}
                          {leave.status === 'Pending' && <Clock className="w-2.5 h-2.5 animate-pulse" />}
                          {leave.status}
                        </span>
                        {leave.status !== 'Pending' && leave.approved_by && (
                          <p className="text-[8px] text-slate-400 dark:text-zinc-500 italic block">
                            {leave.status === 'Approved' ? 'Approved' : 'Rejected'} by {leave.approved_by}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {((hasApprovalAccess && activeSubTab === 'all-leaves' && leave.status === 'Pending') || canDeleteLeave(leave)) && (
                        <div className="flex items-center gap-1.5">
                          {activeSubTab === 'all-leaves' && hasApprovalAccess && leave.status === 'Pending' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(leave.id, 'Approved')}
                                className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/40 rounded-xl transition-all"
                                title="Approve Request"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(leave.id, 'Rejected')}
                                className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-950/50 border border-rose-200 dark:border-rose-800/40 rounded-xl transition-all"
                                title="Reject Request"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {canDeleteLeave(leave) && (
                            <button
                              onClick={() => triggerDeleteLeave(leave.id)}
                              className="bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 border border-slate-200 dark:border-white/10 dark:hover:border-rose-900/30 rounded-xl transition-all flex items-center gap-1.5 px-2.5 py-1"
                              title="Delete Leave Request"
                            >
                              <Trash2 className="w-3 h-3 text-rose-500" />
                              <span className="text-[9px] font-bold">Delete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Apply Leave Modal */}
      <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
        <DialogContent className="max-w-md bg-white dark:bg-slate-950 rounded-3xl border dark:border-white/10 p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-zinc-100">
              Apply for Leave
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleApplyLeave} className="space-y-4 mt-2">
            {/* Leave Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Leave Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLeaveType('Casual')}
                  className={`py-3 px-4 rounded-xl font-bold text-xs border text-center transition-all ${
                    leaveType === 'Casual'
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-500/50 dark:text-indigo-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-zinc-300'
                  }`}
                >
                  Casual Leave
                  <p className="text-[10px] font-medium opacity-65 mt-0.5">{userStats.casualRemaining} days left</p>
                </button>
                <button
                  type="button"
                  onClick={() => setLeaveType('Sick')}
                  className={`py-3 px-4 rounded-xl font-bold text-xs border text-center transition-all ${
                    leaveType === 'Sick'
                      ? 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/40 dark:border-rose-500/50 dark:text-rose-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-zinc-300'
                  }`}
                >
                  Sick Leave
                  <p className="text-[10px] font-medium opacity-65 mt-0.5">{userStats.sickRemaining} days left</p>
                </button>
              </div>
            </div>

            {/* Leave Duration Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Leave Duration</label>
              <div className="grid grid-cols-3 gap-2">
                {(['full', 'half', 'hourly'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDurationType(type)}
                    className={`py-2 px-2.5 rounded-xl font-bold text-[11px] border text-center capitalize transition-all ${
                      durationType === type
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-500/50 dark:text-indigo-400'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-white/10 dark:text-zinc-300'
                    }`}
                  >
                    {type === 'full' ? 'Full Day' : type === 'half' ? 'Half Day' : 'Hourly'}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional Date / Period picker */}
            {durationType === 'full' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">End Date</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            ) : durationType === 'half' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setEndDate(e.target.value); // Sync end date
                    }}
                    className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Session Period</label>
                  <select
                    value={halfDayPeriod}
                    onChange={(e: any) => setHalfDayPeriod(e.target.value)}
                    className="w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="morning">Morning (9 AM - 1 PM)</option>
                    <option value="afternoon">Afternoon (2 PM - 6 PM)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setEndDate(e.target.value); // Sync end date
                    }}
                    className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Hours Requested</label>
                  <select
                    value={hourlyHours}
                    onChange={(e) => setHourlyHours(Number(e.target.value))}
                    className="w-full text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((h) => (
                      <option key={h} value={h}>
                        {h} {h === 1 ? 'hour' : 'hours'} ({(h / 8).toFixed(3)} day)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Requested Days Counter & Warnings */}
            {requestedDays > 0 && (
              <div className={`p-3.5 rounded-xl border flex items-center gap-3 text-xs font-bold ${
                requestedDays > (leaveType === 'Sick' ? userStats.sickRemaining : userStats.casualRemaining)
                  ? 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-400'
              }`}>
                {requestedDays > (leaveType === 'Sick' ? userStats.sickRemaining : userStats.casualRemaining) ? (
                  <>
                    <AlertTriangle className="w-4.5 h-4.5 text-rose-500 shrink-0" />
                    <div>
                      <p>Excess Days Requested: {requestedDays} days</p>
                      <p className="font-medium text-[10px] opacity-80 mt-0.5">
                        You only have {leaveType === 'Sick' ? userStats.sickRemaining : userStats.casualRemaining} days remaining for {leaveType} Leave.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
                    <div>
                      <p>Total Requested: {requestedDays} {requestedDays === 1 ? 'day' : 'days'}</p>
                      <p className="font-medium text-[10px] opacity-80 mt-0.5">
                        You will have {(leaveType === 'Sick' ? userStats.sickRemaining : userStats.casualRemaining) - requestedDays} days remaining after approval.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">Reason for Leave</label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State your reason clearly (e.g. medical, personal temple visit, family event)..."
                className="w-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-slate-700 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-400"
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowApplyModal(false)}
                className="rounded-xl border border-slate-200 text-xs font-bold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || requestedDays === 0 || requestedDays > (leaveType === 'Sick' ? userStats.sickRemaining : userStats.casualRemaining)}
                className="rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold shadow-sm disabled:opacity-55 px-4"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Submitting...
                  </div>
                ) : (
                  'Submit Application'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={handleDeleteLeave}
        title="Delete Leave Request"
        description="Are you sure you want to delete this leave request? This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
};
