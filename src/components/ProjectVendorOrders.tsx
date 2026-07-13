import React, { useState, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Vendor, VendorOrder, Project } from '../types';
import { Plus, Building2, FileText, CheckCircle2, Clock, MessageSquare, IndianRupee, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { supabase } from '../lib/supabase';
import { PaymentStageHistory } from './PaymentStageHistory';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';

interface Props {
  project: Project;
}

export const ProjectVendorOrders: React.FC<Props> = ({ project }) => {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  
  useEffect(() => {
    const fetchData = async () => {
      const [vendorsRes, ordersRes] = await Promise.all([
        supabase.from('vendors').select('*'),
        supabase.from('vendor_orders').select('*').eq('project_id', project.id).order('created_at', { ascending: false })
      ]);
      
      if (vendorsRes.data) setVendors(vendorsRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
    };
    fetchData();
  }, [project.id]);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const [vendorId, setVendorId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [orderDetails, setOrderDetails] = useState('');
  const [terms, setTerms] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [status, setStatus] = useState<VendorOrder['status']>('Pending');
  const [comments, setComments] = useState('');
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orderToManage, setOrderToManage] = useState<VendorOrder | null>(null);
  const [isManageHistoryOpen, setIsManageHistoryOpen] = useState(false);

  const projectOrders = orders.filter(o => o.project_id === project.id);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorId) return;

    const newOrder = {
      project_id: project.id,
      vendor_id: vendorId,
      order_date: orderDate,
      order_details: orderDetails,
      terms,
      total_amount: Number(totalAmount) || 0,
      amount_paid: Number(amountPaid) || 0,
      status,
      comments,
    };
    
    const { data, error } = await supabase.from('vendor_orders').insert([newOrder]).select();
    
    if (error) {
      console.error('Error adding vendor order:', error);
      return;
    }

    if (data && data[0]) {
      setOrders([data[0], ...orders]);
      setIsAddOpen(false);
      
      // Reset form
      setVendorId('');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setOrderDetails('');
      setTerms('');
      setTotalAmount('');
      setAmountPaid('');
      setStatus('Pending');
      setComments('');
    }
  };

  const updateOrderStatus = async (id: string, newStatus: VendorOrder['status']) => {
    const { error } = await supabase.from('vendor_orders').update({ status: newStatus }).eq('id', id);
    if (!error) {
      setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
    }
  };

  const updateOrderAmountPaid = async (id: string, newAmount: number) => {
    const { error } = await supabase.from('vendor_orders').update({ amount_paid: newAmount }).eq('id', id);
    if (!error) {
      setOrders(orders.map(o => o.id === id ? { ...o, amount_paid: newAmount } : o));
    }
  };

  const updateOrderComments = async (id: string, newComments: string) => {
    const { error } = await supabase.from('vendor_orders').update({ comments: newComments }).eq('id', id);
    if (!error) {
      setOrders(orders.map(o => o.id === id ? { ...o, comments: newComments } : o));
    }
  };

  const deleteOrder = async () => {
    if (!orderToDelete) return;
    try {
      const { error } = await supabase.from('vendor_orders').delete().eq('id', orderToDelete);
      if (error) throw error;
      setOrders(orders.filter(o => o.id !== orderToDelete));
      toast.success('Order deleted successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete order');
    } finally {
      setIsDeleteDialogOpen(false);
      setOrderToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100 uppercase tracking-widest">Vendor Orders</h3>
        <Button onClick={() => setIsAddOpen(true)} size="sm" className="bg-indigo-600 rounded-xl font-bold">
          <Plus className="w-4 h-4 mr-2" />
          Add Order
        </Button>
      </div>

      <div className="space-y-4">
        {projectOrders.map(order => {
          const vendor = vendors.find(v => v.id === order.vendor_id);
          
          return (
            <div key={order.id} className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-[#0a0a0a] flex items-center justify-center text-slate-600 dark:text-zinc-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-slate-100">{vendor?.vendor_name || 'Unknown Vendor'}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter">
                        {order.status}
                      </Badge>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {new Date(order.order_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={order.status} onValueChange={(val: any) => updateOrderStatus(order.id, val)}>
                    <SelectTrigger className="w-[130px] h-8 text-xs rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 rounded-lg"
                    onClick={() => {
                      setOrderToDelete(order.id);
                      setIsDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-slate-700 dark:text-zinc-300">{order.order_details}</p>
                {order.terms && (
                  <div className="mt-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-1">Terms & Conditions</p>
                    <p className="text-xs text-amber-900">{order.terms}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Amount</p>
                  <p className="font-bold text-slate-900 dark:text-slate-100">₹{order.total_amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount Paid</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-500">₹ {order.amount_paid.toLocaleString()}</p>
                    {order.amount_paid >= order.total_amount && order.total_amount > 0 && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 mt-4 flex items-center justify-between border-t border-slate-50 dark:border-white/5">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Manage order history</span>
                </div>
                <Button 
                  onClick={() => {
                    setOrderToManage(order);
                    setIsManageHistoryOpen(true);
                  }} 
                  variant="outline" 
                  size="sm"
                  className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Receipts & Comments
                </Button>
              </div>
            </div>
          );
        })}
        {projectOrders.length === 0 && (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-950/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">No vendor orders</p>
            <p className="text-xs text-slate-500 mt-1">Track orders and payments to vendors for this project.</p>
          </div>
        )}
      </div>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Vendor Order</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0" key={vendors.length ? 'loaded' : 'loading'}>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Vendor</label>
                <Select required value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="rounded-xl w-full truncate">
                    <SelectValue placeholder="Select a vendor">
                      {vendors.find(v => v.id === vendorId)?.vendor_name || 'Select a vendor'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>
                    ))}
                    {vendors.length === 0 && (
                      <SelectItem value="none" disabled>No vendors found. Add one in Vendor Management.</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Order Date</label>
                <Input 
                  type="date" 
                  required 
                  value={orderDate} 
                  onChange={(e) => setOrderDate(e.target.value)} 
                  className="rounded-xl w-full" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Order Details</label>
              <Textarea required value={orderDetails} onChange={(e) => setOrderDetails(e.target.value)} className="rounded-xl" placeholder="What are we ordering?" />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Terms & Conditions</label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} className="rounded-xl" placeholder="Payment terms, delivery schedule, etc." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Total Amount (₹)</label>
                <Input type="number" required value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Amount Paid (₹)</label>
                <Input type="number" required value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="rounded-xl" />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setIsAddOpen(false)} className="rounded-xl">Cancel</Button>
              <Button type="submit" className="bg-indigo-600 rounded-xl" disabled={!vendorId}>Add Order</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isManageHistoryOpen} onOpenChange={setIsManageHistoryOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order History: {vendors.find(v => v.id === orderToManage?.vendor_id)?.vendor_name}</DialogTitle>
          </DialogHeader>
          {orderToManage && (
            <div className="mt-2">
              <PaymentStageHistory 
                commentsJson={orderToManage.comments} 
                onUpdate={(newCommentsJson, totalReceiptsAmount) => {
                  updateOrderComments(orderToManage.id, newCommentsJson);
                  if (totalReceiptsAmount !== undefined) {
                    updateOrderAmountPaid(orderToManage.id, totalReceiptsAmount);
                  }
                }} 
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <ConfirmDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={deleteOrder}
        title="Delete Order"
        description="Are you sure you want to delete this order? This action cannot be undone."
      />
    </div>
  );
};
