import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Project, hasAdminAccess } from '../types';
import { useUser } from '../contexts/UserContext';
import { Loader2, Plus, Calendar as CalendarIcon, User as UserIcon, IndianRupee, ExternalLink, Clock } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Button } from './ui/button';

interface ProjectExpensesProps {
  project: Project;
}

interface PettyCashEntry {
  id: string;
  date: string;
  project_name: string;
  category: string;
  bill_name: string;
  reason: string;
  advance_amount: number;
  expenditure_amount: number;
  raised_by_id: string;
  raised_by_name: string;
  entered_by_id?: string;
  entered_by_name?: string;
  created_at: string;
  receipt_url?: string;
}

interface TimeLog {
  id: string;
  date: string;
  hours_logged: number;
  total_cost: number;
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return 'N/A';
  try {
    const date = parseISO(dateStr);
    return isValid(date) ? format(date, 'MMM d, yyyy') : 'N/A';
  } catch {
    return 'N/A';
  }
};

export const ProjectExpenses: React.FC<ProjectExpensesProps> = ({ project }) => {
  const { user } = useUser();
  const [expenses, setExpenses] = useState<PettyCashEntry[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [project.name]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [expensesRes, timeLogsRes] = await Promise.all([
        supabase
          .from('petty_cash')
          .select('*')
          .eq('project_name', project.name)
          .order('date', { ascending: false }),
        supabase
          .from('time_logs')
          .select('id, date, hours_logged, total_cost')
          .eq('project_name', project.name)
      ]);

      if (expensesRes.error) {
        if (expensesRes.error.code !== '42P01') {
          throw expensesRes.error;
        }
      } else {
        setExpenses(expensesRes.data || []);
      }

      if (timeLogsRes.error) {
         if (timeLogsRes.error.code !== '42P01') {
           console.error("Time logs error:", timeLogsRes.error);
         }
      } else {
         setTimeLogs(timeLogsRes.data || []);
      }
      
    } catch (err: any) {
      console.error('Error fetching project financials:', err);
      setError('Failed to load project financials.');
    } finally {
      setIsLoading(false);
    }
  };

  const totalExpenditure = expenses.reduce((sum, exp) => sum + (exp.expenditure_amount || 0), 0);
  const totalAdvance = expenses.reduce((sum, exp) => sum + (exp.advance_amount || 0), 0);
  const totalManHours = timeLogs.reduce((sum, log) => sum + Number(log.hours_logged || 0), 0);
  const totalManPowerCost = timeLogs.reduce((sum, log) => sum + Number(log.total_cost || 0), 0);
  const totalProjectCost = totalExpenditure + totalManPowerCost;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Project Financials</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Financial summary and expenses for {project.name}.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#181818] p-4 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm flex flex-col gap-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Total Man-Hours</span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{totalManHours} <span className="text-sm font-medium text-slate-500">hrs</span></span>
        </div>
        
        {hasAdminAccess(user?.role) && (
          <div className="bg-white dark:bg-[#181818] p-4 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-sm flex flex-col gap-1 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-indigo-500/10 rounded-full blur-xl"></div>
            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Man Power Cost</span>
            <span className="text-2xl font-black text-indigo-700 dark:text-indigo-300">₹ {totalManPowerCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        )}

        <div className="bg-white dark:bg-[#181818] p-4 rounded-2xl border border-emerald-100 dark:border-emerald-500/20 shadow-sm flex flex-col gap-1 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl"></div>
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Expenses (Petty Cash)</span>
          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300">₹ {totalExpenditure.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
        </div>

        {hasAdminAccess(user?.role) && (
          <div className="bg-white dark:bg-[#181818] p-4 rounded-2xl border border-amber-100 dark:border-amber-500/20 shadow-sm flex flex-col gap-1 relative overflow-hidden">
            <div className="absolute -right-4 -top-4 w-16 h-16 bg-amber-500/10 rounded-full blur-xl"></div>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Total Project Cost</span>
            <span className="text-2xl font-black text-amber-700 dark:text-amber-300">₹ {totalProjectCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 mb-4">Petty Cash Log</h3>
        {expenses.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#181818] rounded-2xl border border-slate-100 dark:border-white/10">
            <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <IndianRupee className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">No expenses recorded</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              There are currently no petty cash entries logged against this project.
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#181818] rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-white/5 border-b border-slate-100 dark:border-white/10">
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Date</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Category</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Description</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Raised By</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Advance</th>
                    <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Expenditure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-white">
                          <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                          {formatDate(exp.date)}
                        </div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                          {exp.category}
                        </span>
                      </td>
                      <td className="p-4 min-w-[200px]">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {exp.bill_name || 'N/A'}
                          </span>
                          {exp.reason && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-xs" title={exp.reason}>
                              {exp.reason}
                            </span>
                          )}
                          {exp.receipt_url && (
                            <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline mt-1 w-fit">
                              <ExternalLink className="w-3 h-3" /> View Receipt
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                            <UserIcon className="w-3 h-3 text-slate-500" />
                          </div>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {exp.raised_by_name}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 whitespace-nowrap text-right">
                        {exp.advance_amount > 0 ? (
                          <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                            ₹ {exp.advance_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4 whitespace-nowrap text-right">
                        {exp.expenditure_amount > 0 ? (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            ₹ {exp.expenditure_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
