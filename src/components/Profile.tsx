import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Mail, Shield, User as UserIcon, Calendar, LogOut, Phone, Edit2, Save, X } from 'lucide-react';
import { getInitials } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { Input } from './ui/input';
import { Button } from './ui/button';

export const Profile: React.FC = () => {
  const { user, setUser } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: user?.full_name || '',
    phone_number: user?.phone_number || ''
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    if (!editForm.full_name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name,
          phone_number: editForm.phone_number
        })
        .eq('id', user.id);

      if (error) throw error;

      setUser({
        ...user,
        full_name: editForm.full_name,
        phone_number: editForm.phone_number
      });
      setIsEditing(false);
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto">
            <UserIcon className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">Please select a user to view profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100">My Profile</h1>
          <p className="text-slate-500">Manage your personal information and account settings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1 border-none shadow-sm">
          <CardContent className="pt-8 flex flex-col items-center text-center">
            <Avatar className="h-32 w-32 border-4 border-white shadow-lg mb-4">
              <AvatarFallback className="text-3xl bg-indigo-600 text-white font-bold">
                {getInitials(user.full_name)}
              </AvatarFallback>
            </Avatar>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{user.full_name}</h2>
            <Badge className="mt-2 bg-indigo-50 text-indigo-700 border-indigo-100 uppercase tracking-wider text-[10px] font-bold">
              {user.role}
            </Badge>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Account Details</CardTitle>
            {!isEditing ? (
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                <Edit2 className="w-4 h-4 mr-2" /> Edit Profile
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-slate-700 dark:text-zinc-300">
                  <X className="w-4 h-4 mr-2" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700">
                  <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <UserIcon className="w-3 h-3" /> Full Name
                </p>
                {isEditing ? (
                  <Input 
                    value={editForm.full_name} 
                    onChange={(e) => setEditForm({...editForm, full_name: e.target.value})}
                    className="h-9 mt-1"
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.full_name}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Phone className="w-3 h-3" /> Phone Number
                </p>
                {isEditing ? (
                  <Input 
                    value={editForm.phone_number} 
                    onChange={(e) => setEditForm({...editForm, phone_number: e.target.value})}
                    placeholder="+1 234 567 8900"
                    className="h-9 mt-1"
                  />
                ) : (
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.phone_number || 'Not provided'}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Email Address
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.email || 'Not provided'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Shield className="w-3 h-3" /> Role
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">{user.role}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <UserIcon className="w-3 h-3" /> EMP Code
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.emp_code || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Shield className="w-3 h-3" /> Designation
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.designation || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Calendar className="w-3 h-3" /> Member Since
                </p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {user.DOJ ? new Date(user.DOJ).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="pt-6 border-t border-slate-100 dark:border-white/10 dark:border-slate-800">
              <button 
                className="flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-700 transition-colors"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4" />
                Log out of account
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
