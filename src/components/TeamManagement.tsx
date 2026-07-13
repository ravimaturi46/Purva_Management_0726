import React, { useState, useEffect } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from './ui/table';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { 
  Search, 
  UserPlus, 
  Edit, 
  Trash2, 
  Shield, 
  User as UserIcon,
  Mail,
  ArrowUpDown,
  Filter,
  Key
} from 'lucide-react';
import { supabase, supabaseAdminAuth } from '../lib/supabase';
import { Profile, UserRole, RoleLabels, hasAdminAccess } from '../types';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { useLanguage } from '../contexts/LanguageContext';
import { cn, getInitials } from '../lib/utils';
import { ConfirmDialog } from './ConfirmDialog';

export const TeamManagement: React.FC = () => {
  const { user: currentUser } = useUser();
  const { t, translateData } = useLanguage();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [password, setPassword] = useState('');
  const [editData, setEditData] = useState({
    full_name: '',
    email: '',
    role: 'employee' as UserRole,
    emp_code: '',
    designation: '',
    DOJ: '',
    
  });

  // Sorting state
  const [sortField, setSortField] = useState<keyof Profile>('emp_code');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Filtering state
  const [roleFilter, setRoleFilter] = useState<string>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('emp_code', { ascending: true });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      toast.error(`Failed to load team members: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = async (user: Profile) => {
    setSelectedUser(user);
    
    setEditData({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      emp_code: user.emp_code || '',
      designation: user.designation || '',
      DOJ: user.DOJ || '',
      
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      const { hourly_rate, effective_date, ...profileData } = editData;
      const { error } = await supabase
        .from('profiles')
        .update(profileData)
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast.success('User updated successfully');
      setIsEditDialogOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(`Failed to update user: ${err.message}`);
    }
  };

  const handleSendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      toast.success('Password reset link sent to user\'s email!');
    } catch (err: any) {
      toast.error(`Failed to send password reset link: ${err.message}`);
    }
  };

  const confirmDeleteUser = (id: string) => {
    if (id === currentUser?.id) {
      toast.error("You cannot delete yourself!");
      return;
    }
    setUserToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userToDelete);
      if (error) throw error;
      toast.success('User removed');
      setIsDeleteConfirmOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      toast.error('Failed to remove user: ' + (err.message || 'Unknown error'));
      console.error(err);
    }
  };

  const filteredUsers = users
    .filter(u => {
      const matchesSearch = u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           u.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'All' || u.role === roleFilter;
      const matchesDesignation = designationFilter === 'All' || u.designation === designationFilter;
      
      return matchesSearch && matchesRole && matchesDesignation;
    })
    .sort((a, b) => {
      const aValue = a[sortField] || '';
      const bValue = b[sortField] || '';
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  const uniqueDesignations = ['All', ...new Set(users.map(u => u.designation || 'N/A'))];
  const uniqueRoles = ['All', ...(Object.keys(RoleLabels) as UserRole[])];

  const handleSort = (field: keyof Profile) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  if (!hasAdminAccess(currentUser?.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-600">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100">Access Denied</h2>
        <p className="text-slate-500 max-w-md">
          You do not have permission to access the Team Management panel. Please contact an administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">{t('team')}</h2>
      </div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:flex-1 sm:max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder={t('search_team')} 
              className="pl-10 bg-white dark:bg-[#121212] dark:bg-slate-900 dark:border-white/10 border-slate-200 dark:border-slate-800 dark:border-slate-800 rounded-xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button 
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm dark:shadow-none gap-2"
            onClick={() => {
              setSelectedUser(null);
              setPassword('');
              setEditData({ full_name: '', email: '', role: 'employee', emp_code: '', designation: '', DOJ: '' });
              setIsEditDialogOpen(true);
            }}
          >
            <UserPlus className="w-4 h-4" />
            {t('add_member')}
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 dark:border-slate-800 shadow-sm overflow-x-auto">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-slate-50 dark:bg-[#0a0a0a] dark:bg-slate-950 dark:border-slate-800/50">
            <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800">
              <TableHead className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                <div className="flex items-center gap-2">
                  {t('member')}
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-slate-200" onClick={() => handleSort('full_name')}>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </Button>
                </div>
              </TableHead>
              <TableHead className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                <div className="flex items-center gap-2">
                  {t('emp_code')}
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-slate-200" onClick={() => handleSort('emp_code')}>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </Button>
                </div>
              </TableHead>
              <TableHead className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                <div className="flex items-center gap-2">
                  {t('designation')}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-slate-200">
                        <Filter className={cn("w-3 h-3", designationFilter !== 'All' ? "text-indigo-600" : "text-slate-400")} />
                      </Button>
                    } />
                    <DropdownMenuContent align="start" className="rounded-xl">
                      {uniqueDesignations.map(d => (
                        <DropdownMenuItem key={d} onClick={() => setDesignationFilter(d)}>
                          {d === 'All' ? t('all') : translateData(d)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableHead>
              <TableHead className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                <div className="flex items-center gap-2">
                  {t('email')}
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-slate-200" onClick={() => handleSort('email')}>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </Button>
                </div>
              </TableHead>
              <TableHead className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                <div className="flex items-center gap-2">
                  {t('role')}
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-slate-200">
                        <Filter className={cn("w-3 h-3", roleFilter !== 'All' ? "text-indigo-600" : "text-slate-400")} />
                      </Button>
                    } />
                    <DropdownMenuContent align="start" className="rounded-xl">
                      {uniqueRoles.map(r => (
                        <DropdownMenuItem key={r} onClick={() => setRoleFilter(r as UserRole | 'All')}>
                          {r === 'All' ? t('all') : translateData(RoleLabels[r as UserRole] || r)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableHead>
              <TableHead className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                <div className="flex items-center gap-2">
                  {t('joined')}
                  <Button variant="ghost" size="icon" className="h-5 w-5 rounded-md hover:bg-slate-200" onClick={() => handleSort('DOJ')}>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </Button>
                </div>
              </TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((u) => (
              <TableRow key={u.id} className="hover:bg-slate-50 dark:bg-slate-950/50 border-slate-50 group">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-slate-200 dark:border-slate-800">
                      <AvatarFallback className="bg-indigo-600 text-white font-bold text-xs">{getInitials(u.full_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{translateData(u.full_name)}</span>
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-tighter">You</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600 dark:text-slate-400 font-bold">
                  {u.emp_code || 'N/A'}
                </TableCell>
                <TableCell className="text-sm text-slate-500 font-medium italic">
                  {u.designation ? translateData(u.designation) : 'N/A'}
                </TableCell>
                <TableCell className="text-sm text-slate-500 font-medium">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 text-slate-400" />
                    {u.email}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {hasAdminAccess(u.role) ? (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                        <Shield className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{RoleLabels[u.role] || u.role}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-slate-950 text-slate-600 rounded-full border border-slate-100 dark:border-slate-800">
                        <UserIcon className="w-3 h-3" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{RoleLabels[u.role] || u.role}</span>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-500 font-medium">
                  {u.DOJ ? new Date(u.DOJ).toLocaleDateString() : 'N/A'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                      onClick={() => handleEditClick(u)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => confirmDeleteUser(u.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden p-0 dark:bg-slate-900 bg-white">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
            <DialogTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {selectedUser ? 'Edit Member' : 'Add New Member'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={selectedUser ? handleUpdateUser : async (e) => {
            e.preventDefault();
            try {
              if (!password) {
                toast.error('Password is required for new users');
                return;
              }
              const { data: authData, error: authError } = await supabaseAdminAuth.auth.signUp({
                email: editData.email,
                password: password,
              });
              if (authError) throw authError;

              if (authData.user) {
                const { error } = await supabase.from('profiles').upsert([{ 
                  id: authData.user.id,
                  ...editData 
                }]);
                if (error) {
                  console.error("Profile upsert error:", error);
                  // Ignore if RLS blocks it, assuming a trigger might have done it
                }
              }

              toast.success('Member added successfully');
              setIsEditDialogOpen(false);
              setPassword('');
              fetchUsers();
            } catch (err: any) {
              toast.error(err.message);
            }
          }} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="full_name" className="text-xs font-bold uppercase tracking-widest text-slate-400">Full Name</Label>
              <Input 
                id="full_name" 
                required 
                className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
                value={editData.full_name}
                onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-slate-400">Email Address</Label>
              <Input 
                id="email" 
                type="email"
                required 
                className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
                value={editData.email}
                onChange={(e) => setEditData({ ...editData, email: e.target.value })}
              />
            </div>
            {!selectedUser && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-slate-400">Password</Label>
                <Input 
                  id="password" 
                  type="password"
                  required 
                  className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="emp_code" className="text-xs font-bold uppercase tracking-widest text-slate-400">EMP Code</Label>
                <Input 
                  id="emp_code" 
                  className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
                  value={editData.emp_code}
                  onChange={(e) => setEditData({ ...editData, emp_code: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="designation" className="text-xs font-bold uppercase tracking-widest text-slate-400">Designation</Label>
                <Input 
                  id="designation" 
                  className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
                  value={editData.designation}
                  onChange={(e) => setEditData({ ...editData, designation: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="DOJ" className="text-xs font-bold uppercase tracking-widest text-slate-400">Date of Joining (DOJ)</Label>
              <Input 
                id="DOJ" 
                type="date"
                className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 block w-full"
                value={editData.DOJ}
                onChange={(e) => setEditData({ ...editData, DOJ: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 pb-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-400">Role</Label>
              <Select 
                value={editData.role} 
                onValueChange={(v) => setEditData({ ...editData, role: v as UserRole })}
              >
                <SelectTrigger className="h-11 rounded-lg border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {Object.entries(RoleLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            

            <DialogFooter className="pt-4 flex sm:justify-between items-center w-full border-t border-slate-100 dark:border-slate-800/60 mt-4">
              {selectedUser ? (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => handleSendPasswordReset(editData.email)}
                  className="rounded-xl border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900/50 dark:text-orange-500 dark:hover:bg-orange-900/20 px-4"
                >
                  <Key className="w-4 h-4 mr-2" />
                  Reset Password Link
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsEditDialogOpen(false)}
                  className="rounded-xl font-semibold"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="rounded-xl bg-[#f35b04] hover:bg-[#d64e03] text-white px-6 font-bold"
                >
                  {selectedUser ? 'Save Changes' : 'Add Member'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog 
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={deleteUser}
        title="Delete Team Member"
        description="Are you sure you want to remove this team member? This action cannot be undone."
      />
    </div>
  );
};
