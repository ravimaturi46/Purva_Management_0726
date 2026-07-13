import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from './ui/dialog';
import { Button } from './ui/button';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  variant?: 'default' | 'destructive';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  variant = 'destructive'
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${variant === 'destructive' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-slate-500 font-medium leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-4 gap-2 sm:gap-0">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold"
          >
            Cancel
          </Button>
          <Button 
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className={`rounded-xl font-bold px-6 ${variant === 'default' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100' : ''}`}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
