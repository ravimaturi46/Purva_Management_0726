import React, { useState } from 'react';
import { TransactionComment, PaymentReceipt, PaymentStageHistoryData } from '../types';
import { MessageSquare, Send, User as UserIcon, IndianRupee, Calendar, Receipt, PlusCircle, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useUser } from '../contexts/UserContext';
import { format } from 'date-fns';

interface PaymentStageHistoryProps {
  commentsJson: string | undefined | null;
  onUpdate: (newCommentsJson: string, totalReceiptsAmount?: number) => void;
  onReceiptAdded?: (amount: number, date: string) => void;
  readOnly?: boolean;
}

export const PaymentStageHistory: React.FC<PaymentStageHistoryProps> = ({ commentsJson, onUpdate, onReceiptAdded, readOnly = false }) => {
  const { user } = useUser();
  const [newComment, setNewComment] = useState('');
  
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'receipts' | 'comments'>('receipts');
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);

  let historyData: PaymentStageHistoryData = { comments: [], receipts: [] };
  try {
    if (commentsJson) {
      if (!commentsJson.startsWith('[')) {
        if (commentsJson.startsWith('{')) {
          historyData = JSON.parse(commentsJson);
          if (!historyData.comments) historyData.comments = [];
          if (!historyData.receipts) historyData.receipts = [];
        } else {
          historyData.comments = [{
            id: crypto.randomUUID(),
            text: commentsJson,
            author: 'System/Legacy',
            date: new Date().toISOString()
          }];
        }
      } else {
        historyData.comments = JSON.parse(commentsJson);
      }
    }
  } catch (e) {
    console.error('Failed to parse history data', e);
  }

  const handleAddComment = () => {
    if (!newComment.trim() || readOnly) return;
    const comment: TransactionComment = {
      id: crypto.randomUUID(),
      text: newComment.trim(),
      author: user?.full_name || 'Unknown User',
      date: new Date().toISOString()
    };
    const updatedData: PaymentStageHistoryData = {
      ...historyData,
      comments: [...historyData.comments, comment]
    };
    onUpdate(JSON.stringify(updatedData));
    setNewComment('');
  };

  const handleDeleteComment = (id: string) => {
    if (readOnly) return;
    const updatedData: PaymentStageHistoryData = {
      ...historyData,
      comments: historyData.comments.filter(c => c.id !== id)
    };
    onUpdate(JSON.stringify(updatedData));
  };

  const handleSaveReceipt = () => {
    const amt = parseFloat(receiptAmount);
    if (isNaN(amt) || amt <= 0 || !receiptDate || readOnly) return;
    
    if (editingReceiptId) {
      const updatedReceipts = historyData.receipts.map(r => 
        r.id === editingReceiptId ? { ...r, amount: amt, date: receiptDate } : r
      );
      const updatedData: PaymentStageHistoryData = {
        ...historyData,
        receipts: updatedReceipts
      };
      const totalAmount = updatedReceipts.reduce((sum, r) => sum + r.amount, 0);
      onUpdate(JSON.stringify(updatedData), totalAmount);
      setEditingReceiptId(null);
    } else {
      const receipt: PaymentReceipt = {
        id: crypto.randomUUID(),
        amount: amt,
        date: receiptDate,
        author: user?.full_name || 'Unknown User',
      };
      const updatedReceipts = [...historyData.receipts, receipt];
      const updatedData: PaymentStageHistoryData = {
        ...historyData,
        receipts: updatedReceipts
      };
      const totalAmount = updatedReceipts.reduce((sum, r) => sum + r.amount, 0);
      onUpdate(JSON.stringify(updatedData), totalAmount);
      if (onReceiptAdded) {
        onReceiptAdded(amt, receiptDate);
      }
    }
    setReceiptAmount('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
  };

  const handleEditReceipt = (receipt: PaymentReceipt) => {
    setEditingReceiptId(receipt.id);
    setReceiptAmount(receipt.amount.toString());
    setReceiptDate(receipt.date || new Date().toISOString().split('T')[0]);
  };

  const handleCancelEdit = () => {
    setEditingReceiptId(null);
    setReceiptAmount('');
    setReceiptDate(new Date().toISOString().split('T')[0]);
  };

  const handleDeleteReceipt = (id: string) => {
    if (readOnly) return;
    const updatedReceipts = historyData.receipts.filter(r => r.id !== id);
    const updatedData: PaymentStageHistoryData = {
      ...historyData,
      receipts: updatedReceipts
    };
    const totalAmount = updatedReceipts.reduce((sum, r) => sum + r.amount, 0);
    onUpdate(JSON.stringify(updatedData), totalAmount);
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-4 border-b border-slate-200 dark:border-white/10 pb-2">
        <button 
          onClick={() => setActiveTab('receipts')}
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${activeTab === 'receipts' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
        >
          <Receipt className="w-3.5 h-3.5" /> Receipts ({historyData.receipts.length})
        </button>
        <button 
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${activeTab === 'comments' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
        >
          <MessageSquare className="w-3.5 h-3.5" /> Comments ({historyData.comments.length})
        </button>
      </div>

      {activeTab === 'receipts' && (
        <div className="space-y-3">
          {historyData.receipts.length > 0 && (
            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
              {historyData.receipts.map(receipt => (
                <div key={receipt.id} className="bg-emerald-50 dark:bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-500/20 flex flex-col gap-1 relative group">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">₹ {receipt.amount.toLocaleString()}</span>
                    <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 pr-6">
                      <Calendar className="w-3 h-3" />
                      <span className="text-[10px] font-bold">{receipt.date ? format(new Date(receipt.date), 'MMM d, yyyy') : 'Unknown'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <UserIcon className="w-3 h-3 text-emerald-600/50 dark:text-emerald-400/50" />
                    <span className="text-[9px] font-bold text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wider">Logged by {receipt.author}</span>
                  </div>
                  {!readOnly && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEditReceipt(receipt)}
                        className="p-1 text-slate-400 hover:text-indigo-500"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteReceipt(receipt.id)}
                        className="p-1 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {!readOnly && (
            <div className={`flex items-center gap-2 rounded-xl p-2 border ${editingReceiptId ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' : 'bg-slate-50 dark:bg-[#181818] border-slate-200 dark:border-white/5'}`}>
              <div className="relative flex-1">
                <IndianRupee className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input 
                  type="number"
                  value={receiptAmount}
                  onChange={(e) => setReceiptAmount(e.target.value)}
                  className="h-8 pl-7 text-xs border-0 bg-white dark:bg-[#222] rounded-lg w-full"
                  placeholder="Amount..."
                />
              </div>
              <Input 
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="h-8 text-xs border-0 bg-white dark:bg-[#222] rounded-lg w-32 shrink-0"
              />
              <Button 
                onClick={handleSaveReceipt}
                disabled={!receiptAmount || parseFloat(receiptAmount) <= 0 || !receiptDate}
                size="sm"
                className={`h-8 w-8 rounded-lg shrink-0 p-0 ${editingReceiptId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {editingReceiptId ? <Check className="w-4 h-4 text-white" /> : <PlusCircle className="w-4 h-4 text-white" />}
              </Button>
              {editingReceiptId && (
                <Button 
                  onClick={handleCancelEdit}
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 rounded-lg shrink-0 p-0 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'comments' && (
        <div className="space-y-3">
          {historyData.comments.length > 0 && (
            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
              {historyData.comments.map(comment => (
                <div key={comment.id} className="bg-slate-50 dark:bg-[#0a0a0a] dark:bg-slate-950 dark:border-white/10 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 relative group">
                  <p className="text-xs text-slate-700 dark:text-zinc-300 pr-6">{comment.text}</p>
                  <div className="flex items-center justify-between mt-1.5 pr-6">
                    <div className="flex items-center gap-1">
                      <UserIcon className="w-3 h-3 text-slate-400" />
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{comment.author}</span>
                    </div>
                    <span className="text-[9px] text-slate-400">{comment.date ? format(new Date(comment.date), 'MMM d, h:mm a') : 'Unknown'}</span>
                  </div>
                  {!readOnly && (
                    <button 
                      onClick={() => handleDeleteComment(comment.id)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!readOnly && (
            <div className="flex items-center gap-2">
              <Input 
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
                placeholder="Add a comment..."
                className="h-9 text-xs rounded-xl border-slate-200 dark:border-slate-800 flex-1"
              />
              <Button 
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                size="icon"
                className="h-9 w-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 shrink-0 p-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

