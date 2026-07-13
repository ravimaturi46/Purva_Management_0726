import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile, EmployeeSalary } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Info, Trash2 } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

export const SalaryManagement: React.FC = () => {
  const { user } = useUser();
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [salaries, setSalaries] = useState<EmployeeSalary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    monthly_salary: '',
    effective_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchSalaries(selectedUserId);
    } else {
      setSalaries([]);
    }
  }, [selectedUserId]);

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Error fetching profiles', error);
      toast.error('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalaries = async (profileId: string) => {
    try {
      const { data, error } = await supabase
        .from('employee_salaries')
        .select('*')
        .eq('profile_id', profileId)
        .order('effective_date', { ascending: false });
      
      if (error) throw error;
      setSalaries(data || []);
    } catch (error) {
      console.error('Error fetching salaries', error);
      toast.error('Failed to load salary history. You might need to run the SQL migration first.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error('Please select an employee first');
      return;
    }

    try {
      const monthlyVal = parseFloat(formData.monthly_salary);
      const hourlyVal = monthlyVal / 160;

      // 1. Save to employee_salaries table
      const { error } = await supabase.from('employee_salaries').insert([
        {
          profile_id: selectedUserId,
          monthly_salary: monthlyVal,
          effective_date: formData.effective_date,
          created_by: user?.id
        }
      ]);

      if (error) throw error;

      // 2. Sync with team_rates_history so Time Tracking cost calculations work
      const { data: existing } = await supabase
        .from('team_rates_history')
        .select('id')
        .eq('user_id', selectedUserId)
        .eq('effective_date', formData.effective_date)
        .maybeSingle();

      if (existing) {
        await supabase.from('team_rates_history').update({ hourly_rate: hourlyVal }).eq('id', existing.id);
      } else {
        await supabase.from('team_rates_history').insert([{
          user_id: selectedUserId,
          hourly_rate: hourlyVal,
          effective_date: formData.effective_date
        }]);
      }

      
      toast.success('Salary record added successfully');
      setFormData({ ...formData, monthly_salary: '' });
      fetchSalaries(selectedUserId);
    } catch (error: any) {
      console.error('Error adding salary', error);
      toast.error(error.message || 'Failed to add salary record');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this salary record?")) return;
    try {
      const { error } = await supabase.from('employee_salaries').delete().eq('id', id);
      if (error) throw error;
      toast.success('Salary record deleted');
      fetchSalaries(selectedUserId);
    } catch (err: any) {
      toast.error('Failed to delete salary record');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 p-4 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-sm text-indigo-900 dark:text-indigo-200">
          <strong className="block mb-1">Hourly Calculation Logic</strong>
          Hourly Pay is calculated as: <strong>Monthly Salary / 160 hours</strong> 
          <br/>
          <em>(Assuming standard 40 hours per week &times; 4 weeks = 160 hours).</em> 
          This hourly rate is used for project cost calculations based on the time logged. Ensure the most recent effective date accurately reflects the employee's current pay.
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
        <div className="space-y-4 max-w-md mb-8">
          <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Select Employee</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="h-11 rounded-lg">
              <SelectValue placeholder="Choose an employee...">
                {teamMembers.find(m => m.id === selectedUserId)?.full_name || 'Choose an employee...'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {teamMembers.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedUserId && (
          <div className="space-y-8 animate-in fade-in">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Monthly Salary (₹)</Label>
                <Input 
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  className="h-11 rounded-lg"
                  value={formData.monthly_salary}
                  onChange={e => setFormData({...formData, monthly_salary: e.target.value})}
                  placeholder="e.g. 50000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-widest text-slate-500">Effective Date</Label>
                <Input 
                  type="date"
                  required
                  className="h-11 rounded-lg"
                  value={formData.effective_date}
                  onChange={e => setFormData({...formData, effective_date: e.target.value})}
                />
              </div>
              <div>
                <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 rounded-xl font-bold">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Salary Record
                </Button>
              </div>
            </form>

            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Salary History</h3>
              <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800">
                      <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Effective Date</th>
                      <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Monthly Salary</th>
                      <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Calculated Hourly Rate</th>
                      <th className="p-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {salaries.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500 text-sm">
                          No salary history found for this employee.
                        </td>
                      </tr>
                    ) : (
                      salaries.map((salary, idx) => (
                        <tr key={salary.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                          <td className="p-4 text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {new Date(salary.effective_date).toLocaleDateString()}
                            {idx === 0 && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Current</span>}
                          </td>
                          <td className="p-4 text-sm font-bold text-slate-900 dark:text-white text-right">
                            ₹{salary.monthly_salary.toLocaleString('en-IN')}
                          </td>
                          <td className="p-4 text-sm text-slate-600 dark:text-slate-400 text-right">
                            ₹{(salary.monthly_salary / 160).toFixed(2)}/hr
                          </td>
                          <td className="p-4 text-center">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDelete(salary.id)}
                              className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
