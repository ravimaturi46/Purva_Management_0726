import React, { useState } from 'react';
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
import { Textarea } from './ui/textarea';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { PROJECT_STAGES, TASK_TEMPLATES, STAGE_LABELS } from '../constants';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useLanguage } from '../contexts/LanguageContext';

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

import { useNotifications } from '../contexts/NotificationContext';
import { useUser } from '../contexts/UserContext';
import { fileToBase64 } from '../lib/utils';
import { Image as ImageIcon, Upload } from 'lucide-react';

import { ImageCropperDialog } from './ImageCropperDialog';

export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ open, onOpenChange, onSuccess }) => {
  const { addNotification } = useNotifications();
  const { user, allUsers } = useUser();
  const { translateData } = useLanguage();
  const [loading, setLoading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isCropOpen, setIsCropOpen] = React.useState(false);
  const [cropImageSrc, setCropImageSrc] = React.useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    client_name: '',
    description: '',
    status: PROJECT_STAGES[0],
    assigned_to: 'Unassigned',
    deadline: '',
    logo_url: '',
  });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo file size must be less than 2MB');
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      setCropImageSrc(base64);
      setIsCropOpen(true);
    } catch (err) {
      toast.error('Failed to process image');
    }
  };

  const handleCropComplete = (croppedBase64: string) => {
    setFormData(prev => ({ ...prev, logo_url: croppedBase64 }));
    setCropImageSrc('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const finalAssignee = formData.assigned_to === 'Unassigned' ? null : formData.assigned_to;
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert({
          ...formData,
          assigned_to: finalAssignee,
          progress: 0,
          last_updated: new Date().toISOString(),
        })
        .select()
        .single();

      if (projectError) throw projectError;

      await addNotification('New Project Created', `Project "${formData.name}" has been created by ${user?.full_name || 'an employee'}.`);
      
      // Notify assignee
      if (formData.assigned_to && formData.assigned_to !== 'Unassigned' && user && formData.assigned_to !== user.full_name) {
        const assignee = allUsers.find(u => u.full_name === formData.assigned_to || u.id === formData.assigned_to);
        if (assignee && assignee.id !== user.id) {
          await addNotification(
            'New Project Assigned',
            `${user.full_name} assigned you to a new project: "${formData.name}"`,
            assignee.id
          );
        }
      }
      
      toast.success('Project created successfully');
      onSuccess();
      onOpenChange(false);
      setFormData({
        name: '',
        client_name: '',
        description: '',
        status: PROJECT_STAGES[0],
        assigned_to: 'Unassigned',
        deadline: '',
      });
    } catch (err: any) {
      console.error('Error creating project:', err);
      toast.error(`Failed to create project: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl border-none shadow-2xl dark:bg-[#121212] dark:border dark:border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight dark:text-zinc-100">Create New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="flex items-center gap-4">
            {formData.logo_url ? (
              <img src={formData.logo_url} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-slate-50 dark:bg-[#0a0a0a] dark:border-white/10 border border-slate-100 shadow-sm" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-100 dark:border-white/10 flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5 transition-colors" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon className="w-6 h-6 text-slate-400 dark:text-zinc-500" />
              </div>
            )}
            <div className="flex-1">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">Project Logo (Optional)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="dark:border-white/10 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-white/5">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </Button>
                {formData.logo_url && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFormData({ ...formData, logo_url: '' })} className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10">
                    Remove
                  </Button>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/png, image/jpeg, image/svg+xml"
                onChange={handleLogoUpload}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name" className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">Project Name</Label>
            <Input 
              id="name" 
              required 
              placeholder="e.g. Mahadev Temple Construction"
              className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-100"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client" className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">Client Name</Label>
            <Input 
              id="client" 
              required 
              placeholder="e.g. Dharma Trust"
              className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-100"
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">Assigned To</Label>
              <Select 
                value={formData.assigned_to} 
                onValueChange={(v) => setFormData({ ...formData, assigned_to: v })}
              >
                <SelectTrigger className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-100">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent className="rounded-xl dark:bg-[#181818] dark:border-white/10 z-[300]">
                  <SelectItem value="Unassigned" className="dark:text-zinc-300 dark:hover:bg-white/5">Unassigned</SelectItem>
                  {Array.from(new Set(allUsers.map(u => u.full_name || u.email || 'Unnamed User'))).map(displayName => (
                      <SelectItem key={displayName} value={displayName} className="dark:text-zinc-300 dark:hover:bg-white/5">{displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline" className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">Deadline</Label>
            <Input 
              id="deadline" 
              type="date" 
              className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-100"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-zinc-500">Description</Label>
            <Textarea 
              id="description" 
              placeholder="Project details and requirements..."
              className="rounded-xl border-slate-200 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-100 min-h-[100px]"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          <DialogFooter className="pt-4">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="rounded-xl dark:text-zinc-300 dark:hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-8 shadow-lg shadow-indigo-100 dark:shadow-none"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {isCropOpen && (
      <ImageCropperDialog
        open={isCropOpen}
        onOpenChange={setIsCropOpen}
        imageSrc={cropImageSrc}
        onCropComplete={handleCropComplete}
      />
    )}
    </>
  );
};
