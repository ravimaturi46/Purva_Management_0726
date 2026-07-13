import React, { useState, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { Vendor, VendorOrder, Project, hasFinanceAccess, hasProjectManagementAccess } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useFileSettings } from '../contexts/FileSettingsContext';
import { useUser } from '../contexts/UserContext';
import { Plus, Search, Building2, Phone, Briefcase, FileText, DollarSign, ExternalLink, Edit, Trash2, Mail, Landmark } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Badge } from './ui/badge';
import { supabase } from '../lib/supabase';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';

interface VendorManagementProps {
  onProjectClick?: (project: Project, tab?: string) => void;
}

export const VendorManagement: React.FC<VendorManagementProps> = ({ onProjectClick }) => {
  const { t } = useLanguage();
  const { user } = useUser();
  const { canManageVendors } = useFileSettings();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [projectsRes, vendorsRes, ordersRes] = await Promise.all([
        supabase.from('projects').select('id, name, status'),
        supabase.from('vendors').select('*').order('created_at', { ascending: false }),
        supabase.from('vendor_orders').select('*')
      ]);
      
      if (projectsRes.data) setProjects(projectsRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
    };
    fetchData();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [isEditVendorOpen, setIsEditVendorOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  
  const [newVendorName, setNewVendorName] = useState('');
  const [newContactPersonName, setNewContactPersonName] = useState('');
  const [newPhoneNo, setNewPhoneNo] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPanCardNo, setNewPanCardNo] = useState('');
  const [newGstNo, setNewGstNo] = useState('');
  const [newServicesList, setNewServicesList] = useState('');
  const [newBankAccountName, setNewBankAccountName] = useState('');
  const [newBankAccountNumber, setNewBankAccountNumber] = useState('');
  const [newBankIfsc, setNewBankIfsc] = useState('');
  const [newBankName, setNewBankName] = useState('');

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const newVendor = {
      vendor_name: newVendorName,
      contact_person_name: newContactPersonName,
      phone_no: newPhoneNo,
      email: newEmail,
      pan_card_no: newPanCardNo,
      gst_no: newGstNo,
      services_list: newServicesList,
      bank_account_name: newBankAccountName,
      bank_account_number: newBankAccountNumber,
      bank_ifsc: newBankIfsc,
      bank_name: newBankName
    };
    
    const { data, error } = await supabase.from('vendors').insert([newVendor]).select();
    
    if (error) {
      console.error('Error adding vendor:', error);
      toast.error('Failed to add vendor');
      return;
    }

    if (data && data[0]) {
      setVendors([data[0], ...vendors]);
      setIsAddVendorOpen(false);
      setNewVendorName('');
      setNewContactPersonName('');
      setNewPhoneNo('');
      setNewEmail('');
      setNewPanCardNo('');
      setNewGstNo('');
      setNewServicesList('');
      setNewBankAccountName('');
      setNewBankAccountNumber('');
      setNewBankIfsc('');
      setNewBankName('');
      toast.success('Vendor added successfully');
    }
  };

  const handleEditClick = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setNewVendorName(vendor.vendor_name);
    setNewContactPersonName(vendor.contact_person_name || '');
    setNewPhoneNo(vendor.phone_no || '');
    setNewEmail(vendor.email || '');
    setNewPanCardNo(vendor.pan_card_no || '');
    setNewGstNo(vendor.gst_no || '');
    setNewServicesList(vendor.services_list || '');
    setNewBankAccountName(vendor.bank_account_name || '');
    setNewBankAccountNumber(vendor.bank_account_number || '');
    setNewBankIfsc(vendor.bank_ifsc || '');
    setNewBankName(vendor.bank_name || '');
    setIsEditVendorOpen(true);
  };

  const handleUpdateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor) return;

    const updatedVendor = {
      vendor_name: newVendorName,
      contact_person_name: newContactPersonName,
      phone_no: newPhoneNo,
      email: newEmail,
      pan_card_no: newPanCardNo,
      gst_no: newGstNo,
      services_list: newServicesList,
      bank_account_name: newBankAccountName,
      bank_account_number: newBankAccountNumber,
      bank_ifsc: newBankIfsc,
      bank_name: newBankName
    };
    
    const { error } = await supabase
      .from('vendors')
      .update(updatedVendor)
      .eq('id', selectedVendor.id);
    
    if (error) {
      console.error('Error updating vendor:', error);
      toast.error('Failed to update vendor');
      return;
    }

    setVendors(vendors.map(v => v.id === selectedVendor.id ? { ...v, ...updatedVendor } : v));
    setIsEditVendorOpen(false);
    setSelectedVendor(null);
    toast.success('Vendor updated successfully');
  };

  const handleDeleteClick = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setIsDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedVendor) return;

    // First delete vendor orders manually just in case CASCADE isn't set up
    await supabase.from('vendor_orders').delete().eq('vendor_id', selectedVendor.id).then(({error}) => {
      if (error) console.warn("Could not delete related vendor orders:", error);
    });

    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', selectedVendor.id);

    if (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor. Ensure there are no active orders for this vendor.');
      return;
    }

    setVendors(vendors.filter(v => v.id !== selectedVendor.id));
    setIsDeleteConfirmOpen(false);
    setSelectedVendor(null);
    toast.success('Vendor deleted successfully');
  };

  const filteredVendors = vendors.filter(v => 
    v.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.services_list?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">Vendor Management</h2>
        <div className="flex items-center gap-4">
          <div className="relative w-full sm:w-64 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400 transition-colors" />
            <Input 
              placeholder="Search vendors..." 
              className="pl-10 bg-white dark:bg-[#121212] dark:border-white/10 dark:text-zinc-100 border-slate-200 rounded-2xl h-11"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          {canManageVendors(user?.role, 'create') && (
            <Button 
              onClick={() => setIsAddVendorOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-sm dark:shadow-none h-11 px-6 font-bold"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Vendor
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVendors.map(vendor => {
          const vendorOrders = orders.filter(o => o.vendor_id === vendor.id);
          const totalSpent = vendorOrders.reduce((sum, o) => sum + o.amount_paid, 0);
          const totalCommitted = vendorOrders.reduce((sum, o) => sum + o.total_amount, 0);

          return (
            <div key={vendor.id} className="bg-white dark:bg-[#121212] rounded-3xl p-6 border border-slate-100 dark:border-white/10 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-zinc-100 text-lg">{vendor.vendor_name}</h3>
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-500 uppercase tracking-wider">{vendor.services_list}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canManageVendors(user?.role, 'edit') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditClick(vendor)}
                      className="h-8 w-8 text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-full"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  )}
                  {canManageVendors(user?.role, 'delete') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(vendor)}
                      className="h-8 w-8 text-slate-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-400">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {vendor.phone_no} {vendor.contact_person_name ? `(${vendor.contact_person_name})` : ''}
                </div>
                {vendor.email && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-400">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <a href={`mailto:${vendor.email}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{vendor.email}</a>
                  </div>
                )}
                {(vendor.pan_card_no || vendor.gst_no) && (
                  <div className="flex flex-col gap-1 text-xs text-slate-500 dark:text-zinc-500">
                    {vendor.pan_card_no && <span>PAN: <span className="font-mono text-slate-700 dark:text-zinc-300">{vendor.pan_card_no}</span></span>}
                    {vendor.gst_no && <span>GST: <span className="font-mono text-slate-700 dark:text-zinc-300">{vendor.gst_no}</span></span>}
                  </div>
                )}
                {(vendor.bank_name || vendor.bank_account_number || vendor.bank_ifsc || vendor.bank_account_name) && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                      <Landmark className="w-4 h-4 text-slate-400" />
                      Bank Details
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-zinc-500">
                      {vendor.bank_name && <div className="col-span-2">Bank: <span className="text-slate-700 dark:text-zinc-300 font-medium">{vendor.bank_name}</span></div>}
                      {vendor.bank_account_name && <div className="col-span-2">Name: <span className="text-slate-700 dark:text-zinc-300 font-medium">{vendor.bank_account_name}</span></div>}
                      {vendor.bank_account_number && <div>A/C: <span className="font-mono text-slate-700 dark:text-zinc-300">{vendor.bank_account_number}</span></div>}
                      {vendor.bank_ifsc && <div>IFSC: <span className="font-mono text-slate-700 dark:text-zinc-300">{vendor.bank_ifsc}</span></div>}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-400 pt-2">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  {vendorOrders.length} Orders
                </div>
              </div>

              {vendorOrders.length > 0 && (
                <div className="mb-6 space-y-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Projects</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(vendorOrders.map(o => o.project_id))).map(projectId => {
                      const project = projects.find(p => p.id === projectId);
                      if (!project) return null;
                      return (
                        <Badge 
                          key={projectId} 
                          variant="secondary" 
                          className="bg-slate-100 dark:bg-[#181818] border dark:border-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-slate-700 dark:text-zinc-300 hover:text-indigo-700 dark:hover:text-indigo-400 cursor-pointer transition-colors flex items-center gap-1"
                          onClick={() => onProjectClick?.(project, 'vendors')}
                        >
                          {project.name}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-[#0a0a0a] dark:border-white/10 rounded-2xl">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Committed</p>
                  <p className="font-bold text-slate-900 dark:text-zinc-100">₹{totalCommitted.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Paid</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">₹{totalSpent.toLocaleString()}</p>
                </div>
              </div>
            </div>
          );
        })}
        {filteredVendors.length === 0 && (
          <div className="col-span-full text-center py-12 bg-white dark:bg-[#121212] rounded-3xl border border-dashed border-slate-200 dark:border-white/10">
            <Building2 className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-lg font-bold text-slate-900 dark:text-zinc-100">No vendors found</p>
            <p className="text-sm text-slate-500 dark:text-zinc-500 mt-1">Add your first vendor to start tracking orders.</p>
          </div>
        )}
      </div>

      <Dialog open={isAddVendorOpen} onOpenChange={setIsAddVendorOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddVendor} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Vendor Name</label>
              <Input 
                required
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                className="rounded-xl"
                placeholder="e.g. ABC Construction Supplies"
              />
            </div>
                     <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Contact Person</label>
                <Input 
                  value={newContactPersonName}
                  onChange={(e) => setNewContactPersonName(e.target.value)}
                  className="rounded-xl"
                  placeholder="Name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Phone No.</label>
                <Input 
                  required
                  value={newPhoneNo}
                  onChange={(e) => setNewPhoneNo(e.target.value)}
                  className="rounded-xl"
                  placeholder="Phone Number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email Address</label>
              <Input 
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-xl"
                placeholder="vendor@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">PAN Card No.</label>
                <Input 
                  value={newPanCardNo}
                  onChange={(e) => setNewPanCardNo(e.target.value)}
                  className="rounded-xl"
                  placeholder="PAN"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">GST No.</label>
                <Input 
                  value={newGstNo}
                  onChange={(e) => setNewGstNo(e.target.value)}
                  className="rounded-xl"
                  placeholder="GSTIN"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Services / Goods Provided</label>
              <Input 
                required
                value={newServicesList}
                onChange={(e) => setNewServicesList(e.target.value)}
                className="rounded-xl"
                placeholder="e.g. Cement, Steel, Labor"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-white/5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Bank Details</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bank Name</label>
                  <Input 
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    className="rounded-xl"
                    placeholder="e.g. HDFC Bank"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">IFSC Code</label>
                  <Input 
                    value={newBankIfsc}
                    onChange={(e) => setNewBankIfsc(e.target.value)}
                    className="rounded-xl"
                    placeholder="e.g. HDFC0001234"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Account Name</label>
                  <Input 
                    value={newBankAccountName}
                    onChange={(e) => setNewBankAccountName(e.target.value)}
                    className="rounded-xl"
                    placeholder="Name on Account"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Account Number</label>
                  <Input 
                    value={newBankAccountNumber}
                    onChange={(e) => setNewBankAccountNumber(e.target.value)}
                    className="rounded-xl"
                    placeholder="Account Number"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setIsAddVendorOpen(false)} className="rounded-xl">Cancel</Button>
              <Button type="submit" className="bg-indigo-600 rounded-xl">Add Vendor</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditVendorOpen} onOpenChange={setIsEditVendorOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateVendor} className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Vendor Name</label>
              <Input 
                required
                value={newVendorName}
                onChange={(e) => setNewVendorName(e.target.value)}
                className="rounded-xl"
                placeholder="e.g. ABC Construction Supplies"
              />
            </div>
                     <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Contact Person</label>
                <Input 
                  value={newContactPersonName}
                  onChange={(e) => setNewContactPersonName(e.target.value)}
                  className="rounded-xl"
                  placeholder="Name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Phone No.</label>
                <Input 
                  required
                  value={newPhoneNo}
                  onChange={(e) => setNewPhoneNo(e.target.value)}
                  className="rounded-xl"
                  placeholder="Phone Number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Email Address</label>
              <Input 
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-xl"
                placeholder="vendor@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">PAN Card No.</label>
                <Input 
                  value={newPanCardNo}
                  onChange={(e) => setNewPanCardNo(e.target.value)}
                  className="rounded-xl"
                  placeholder="PAN"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">GST No.</label>
                <Input 
                  value={newGstNo}
                  onChange={(e) => setNewGstNo(e.target.value)}
                  className="rounded-xl"
                  placeholder="GSTIN"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Services / Goods Provided</label>
              <Input 
                required
                value={newServicesList}
                onChange={(e) => setNewServicesList(e.target.value)}
                className="rounded-xl"
                placeholder="e.g. Cement, Steel, Labor"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-white/5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Bank Details</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Bank Name</label>
                  <Input 
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    className="rounded-xl"
                    placeholder="e.g. HDFC Bank"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">IFSC Code</label>
                  <Input 
                    value={newBankIfsc}
                    onChange={(e) => setNewBankIfsc(e.target.value)}
                    className="rounded-xl"
                    placeholder="e.g. HDFC0001234"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Account Name</label>
                  <Input 
                    value={newBankAccountName}
                    onChange={(e) => setNewBankAccountName(e.target.value)}
                    className="rounded-xl"
                    placeholder="Name on Account"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Account Number</label>
                  <Input 
                    value={newBankAccountNumber}
                    onChange={(e) => setNewBankAccountNumber(e.target.value)}
                    className="rounded-xl"
                    placeholder="Account Number"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="ghost" onClick={() => setIsEditVendorOpen(false)} className="rounded-xl">Cancel</Button>
              <Button type="submit" className="bg-indigo-600 rounded-xl">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={(open) => setIsDeleteConfirmOpen(open)}
        onConfirm={handleDeleteConfirm}
        title="Delete Vendor"
        description={`Are you sure you want to delete ${selectedVendor?.vendor_name}? This action cannot be undone.`}
        confirmText="Delete Vendor"
        variant="destructive"
      />
    </div>
  );
};
