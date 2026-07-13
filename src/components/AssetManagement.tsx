import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useFileSettings } from '../contexts/FileSettingsContext';
import { Button } from './ui/button';
import { Plus, Download, X, Loader2, FileText, Image as ImageIcon, Briefcase, LandmarkIcon, Building2, UploadCloud, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from './ConfirmDialog';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest } from '../lib/msalConfig';
import { Client } from '@microsoft/microsoft-graph-client';

export type AssetType = 'asset' | 'fd' | 'loan';

interface AssetRecord {
  id: string;
  type: AssetType;
  name: string;
  value: number;
  purchase_date: string | null;
  maturity_date: string | null;
  interest_rate: number | null;
  details: string | null;
  file_url: string | null;
  created_at: string;
  status: string;
}

export const AssetManagement: React.FC = () => {
  const { user } = useUser();
  const { canManageAssets } = useFileSettings();
  const canCreate = canManageAssets(user?.role, 'create');
  
  const [activeTab, setActiveTab] = useState<AssetType>('asset');
  const [items, setItems] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({ asset: 0, fd: 0, loan: 0 });
  
  // MSAL setup for File Upload
  const { instance, inProgress } = useMsal();
  const [msalReady, setMsalReady] = useState(() => instance.getAllAccounts().length > 0);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initialForm = {
    name: '',
    value: '',
    purchase_date: '',
    maturity_date: '',
    interest_rate: '',
    details: '',
    status: 'active'
  };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    fetchItems();
    fetchDashboardStats();
  }, [activeTab]);

  const fetchDashboardStats = async () => {
    try {
      const { data, error } = await supabase.from('asset_management').select('type, value, status');
      if (!error && data) {
        let asset = 0, fd = 0, loan = 0;
        data.forEach(item => {
          if (item.status === 'active' || !item.status) {
            if (item.type === 'asset') asset += Number(item.value);
            else if (item.type === 'fd') fd += Number(item.value);
            else if (item.type === 'loan') loan += Number(item.value);
          }
        });
        setDashboardStats({ asset, fd, loan });
      }
    } catch (err: any) {
      console.error("Error fetching stats:", err);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('asset_management')
        .select('*')
        .eq('type', activeTab)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01') {
          toast.error("Database table 'asset_management' not found. Please run the SQL migration.");
        } else {
          throw error;
        }
      }
      if (data) {
        setItems(data as AssetRecord[]);
      }
    } catch (err: any) {
      console.error("Error fetching items:", err);
      toast.error(err.message || "Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  const getGraphClient = useCallback(async () => {
    const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (!activeAccount) {
      throw new Error("Not logged into Microsoft. Please authenticate.");
    }
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account: activeAccount
    });
    return Client.init({
      authProvider: (done) => {
        done(null, response.accessToken);
      }
    });
  }, [instance]);

  const handleLogin = () => {
    if (inProgress !== "none") {
      toast.info("Authentication is already in progress. Please wait.");
      return;
    }
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(`${window.location.origin}?auth_action=login`, 'oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);
    
    const receiveMessage = async (event: MessageEvent) => {
      if (typeof event.data === 'string' && event.data === 'msal_login_success') {
        window.removeEventListener('message', receiveMessage);
        setMsalReady(true);
        toast.success("Successfully logged in to Microsoft");
      }
    };
    window.addEventListener('message', receiveMessage);
    
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      if (attempts > 180) { clearInterval(pollInterval); return; }
      try {
        if (instance.getAllAccounts().length > 0) {
          clearInterval(pollInterval);
          window.removeEventListener('message', receiveMessage);
          setMsalReady(true);
        }
      } catch (err) {}
    }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const uploadFile = async (): Promise<string | null> => {
    if (!selectedFile) return null;
    try {
      setIsUploading(true);
      const client = await getGraphClient();
      
      const timestamp = new Date().getTime();
      const encodedFile = encodeURIComponent(`${timestamp}_${selectedFile.name}`);
      const encodedFolder = encodeURIComponent('PurvaVedic_Assets');
      
      // We will just do a simple put for now. Real implementations can handle larger chunks.
      const response = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/content`).put(selectedFile);
      
      return response['@microsoft.graph.downloadUrl'] || response.webUrl;
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Failed to upload file to OneDrive.");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.value) {
      toast.error("Please fill Name and Value fields");
      return;
    }
    
    setIsSubmitting(true);
    let uploadedUrl = null;
    if (selectedFile && msalReady) {
      uploadedUrl = await uploadFile();
    }

      const payload = {
        type: activeTab,
        name: form.name,
        value: parseFloat(form.value) || 0,
        purchase_date: form.purchase_date || null,
        maturity_date: form.maturity_date || null,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        details: form.details || null,
        status: form.status,
      } as any;

      if (uploadedUrl) {
        payload.file_url = uploadedUrl;
      }

      if (!editingId) {
        payload.created_by = user?.id;
      }

    try {
      let result;
      if (editingId) {
        result = await supabase.from('asset_management').update(payload).eq('id', editingId).select();
      } else {
        result = await supabase.from('asset_management').insert(payload).select();
      }
      const { data, error } = result;

      if (error) throw error;
      
      toast.success(editingId ? "Updated successfully" : "Added successfully");
      setShowForm(false);
      setEditingId(null);
      setForm(initialForm);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      fetchItems();
      fetchDashboardStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to save record");
      if (err.message?.includes("table") && err.message?.includes("does not exist")) {
        toast.error("Please ensure you run the SQL migration (asset_management.sql) in your Supabase dashboard.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('asset_management').delete().eq('id', deleteId);
      if (error) throw error;
      
      toast.success("Record deleted successfully");
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      fetchItems();
      fetchDashboardStats();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete record");
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="bg-indigo-100/50 dark:bg-indigo-500/20 p-2 rounded-xl shrink-0">
              <Briefcase className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            Wealth & Assets
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2 ml-1">Monitor company physical assets, fixed deposits, and loans.</p>
        </div>
        <div className="mt-4 sm:mt-0 w-full sm:w-auto">
          {canCreate && (
            <Button onClick={() => {
              setShowForm(!showForm);
              if (showForm) {
                setEditingId(null);
                setForm(initialForm);
              }
            }} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-xl px-5">
              {showForm ? <><X className="w-4 h-4 mr-2" /> Close Form</> : <><Plus className="w-4 h-4 mr-2" /> Add New Record</>}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl p-6 shadow-md text-white relative overflow-hidden group">
          <div className="absolute -right-4 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500" />
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-indigo-100 text-sm font-semibold mb-1">Active Assets</p>
              <h3 className="text-3xl font-bold">₹{dashboardStats.asset.toLocaleString('en-IN')}</h3>
            </div>
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 shadow-md text-white relative overflow-hidden group">
          <div className="absolute -right-4 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500" />
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-emerald-100 text-sm font-semibold mb-1">Fixed Deposits</p>
              <h3 className="text-3xl font-bold">₹{dashboardStats.fd.toLocaleString('en-IN')}</h3>
            </div>
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <LandmarkIcon className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-rose-500 to-orange-600 rounded-3xl p-6 shadow-md text-white relative overflow-hidden group">
          <div className="absolute -right-4 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:scale-110 transition-transform duration-500" />
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-rose-100 text-sm font-semibold mb-1">Active Loans</p>
              <h3 className="text-3xl font-bold">₹{dashboardStats.loan.toLocaleString('en-IN')}</h3>
            </div>
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
              <Building2 className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto whitespace-nowrap scrollbar-hide py-1">
        {[
          { id: 'asset', label: 'Physical Assets', icon: ImageIcon },
          { id: 'fd', label: 'Fixed Deposits', icon: LandmarkIcon },
          { id: 'loan', label: 'Loans & Borrowings', icon: Building2 },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as AssetType); setShowForm(false); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm border shrink-0 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 dark:hover:bg-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-white/10 p-6 mb-8 transform transition-all duration-300 origin-top">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {activeTab === 'asset' ? 'Asset Name/Description' : activeTab === 'fd' ? 'Bank & FD Number' : 'Loan Provider/Purpose'} *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder={activeTab === 'asset' ? 'e.g., MacBook Pro M3' : 'e.g., HDFC Bank FD'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {activeTab === 'loan' ? 'Principal / Loan Amount' : 'Value / Invested Amount'} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={form.value}
                  onChange={e => setForm({ ...form, value: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {activeTab === 'asset' ? 'Date of Purchase' : 'Start Date'} 
                </label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={e => setForm({ ...form, purchase_date: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {(activeTab === 'fd' || activeTab === 'loan') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Maturity / End Date
                    </label>
                    <input
                      type="date"
                      value={form.maturity_date}
                      onChange={e => setForm({ ...form, maturity_date: e.target.value })}
                      className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Interest Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.interest_rate}
                      onChange={e => setForm({ ...form, interest_rate: e.target.value })}
                      className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      placeholder="e.g. 6.5"
                    />
                  </div>
                </>
              )}

              <div className={activeTab === 'asset' ? "md:col-span-2" : "md:col-span-1"}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Additional Details
                </label>
                <input
                  type="text"
                  value={form.details}
                  onChange={e => setForm({ ...form, details: e.target.value })}
                  className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder="Notes, receipts IDs, etc..."
                />
              </div>

              <div>
                 <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                   Status
                 </label>
                 <select
                   value={form.status}
                   onChange={e => setForm({ ...form, status: e.target.value })}
                   className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                 >
                   <option value="active">Active / Open</option>
                   <option value="closed">Closed / Matured / Settled</option>
                 </select>
              </div>

              <div className="md:col-span-2 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pb-2 border-b border-slate-200 dark:border-slate-700 mb-4">
                  {activeTab === 'asset' ? 'Upload Photo / Invoice' : 'Upload Document'} (Microsoft OneDrive)
                </label>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {!msalReady ? (
                    <Button type="button" variant="outline" onClick={handleLogin} className="border-[#0078D4] text-[#0078D4]">
                      Connect Microsoft Account to Upload
                    </Button>
                  ) : (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileChange}
                        accept={activeTab === 'asset' ? "image/*,.pdf" : ".pdf,.jpg,.jpeg,.png,.doc,.docx"}
                      />
                      <Button
                        type="button"
                        variant={selectedFile ? "outline" : "default"}
                        onClick={() => fileInputRef.current?.click()}
                        className={selectedFile ? "border-green-500 text-green-600" : "bg-[#0078D4] hover:bg-[#005a9e] text-white"}
                      >
                        <UploadCloud className="w-4 h-4 mr-2" />
                        {selectedFile ? 'Change File' : 'Select File'}
                      </Button>
                      
                      {selectedFile && (
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                          <FileText className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                          <button
                            type="button"
                            onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"
                          >
                            <X className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setForm(initialForm);
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isUploading} className="bg-indigo-600 hover:bg-indigo-700 text-white min-w-[120px]">
                {isUploading ? "Uploading..." : isSubmitting ? "Saving..." : "Save Record"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 shadow-sm">
          <Briefcase className="w-16 h-16 text-slate-200 dark:text-slate-700 mx-auto mb-5" />
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">No records found</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto">
            You haven't added any {activeTab === 'asset' ? 'physical assets' : activeTab === 'fd' ? 'fixed deposits' : 'loans'} yet. Get started by adding a new record.
          </p>
          {canCreate && (
            <Button onClick={() => setShowForm(true)} className="w-full sm:w-auto mt-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-6">
              <Plus className="w-4 h-4 mr-2" /> Add First Record
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* Desktop Table View */}
        <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#181818] text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4 font-bold">Details</th>
                  <th className="p-4 font-bold text-right">Value</th>
                  {activeTab !== 'asset' && <th className="p-4 font-bold text-center">Interest</th>}
                  <th className="p-4 font-bold text-center">Timeline</th>
                  <th className="p-4 font-bold text-center">Status</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((item) => (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${item.status === 'closed' ? 'bg-slate-50/20 opacity-75' : ''}`}
                  >
                    <td className="p-4 max-w-[250px]">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl mt-1 shrink-0 ${
                          item.type === 'asset' ? 'bg-indigo-50 text-indigo-500' : 
                          item.type === 'fd' ? 'bg-emerald-50 text-emerald-500' : 
                          'bg-rose-50 text-rose-500'
                        }`}>
                          {item.type === 'asset' && <ImageIcon className="w-4 h-4" />}
                          {item.type === 'fd' && <LandmarkIcon className="w-4 h-4" />}
                          {item.type === 'loan' && <Building2 className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white truncate" title={item.name}>{item.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1" title={item.details || ''}>{item.details || 'No additional details provided'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <span className="font-bold text-slate-900 dark:text-white block rounded-lg">
                        ₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    {activeTab !== 'asset' && (
                      <td className="p-4 text-center">
                        {item.interest_rate ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                            {item.interest_rate}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    )}
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1 text-xs">
                        {item.purchase_date && (
                          <span className="text-slate-600 dark:text-slate-400" title="Start/Purchase Date">
                            {new Date(item.purchase_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                        {item.maturity_date && <span className="text-slate-300 dark:text-slate-600">→</span>}
                        {item.maturity_date && (
                          <span className="text-slate-900 font-medium dark:text-slate-300" title="Maturity/End Date">
                            {new Date(item.maturity_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                        {!item.purchase_date && !item.maturity_date && <span className="text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {item.status === 'closed' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 uppercase tracking-wider">
                          Closed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        {item.file_url && (
                          <a 
                            href={item.file_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                            title="View Attached Document"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {canCreate && (
                          <button
                            onClick={() => {
                              setEditingId(item.id);
                              setForm({
                                name: item.name || '',
                                value: item.value?.toString() || '',
                                purchase_date: item.purchase_date || '',
                                maturity_date: item.maturity_date || '',
                                interest_rate: item.interest_rate?.toString() || '',
                                details: item.details || '',
                                status: item.status || 'active',
                              });
                              setShowForm(true);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="Edit Record"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {canCreate && (
                          <button
                            onClick={() => {
                              setDeleteId(item.id);
                              setIsDeleteDialogOpen(true);
                            }}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {items.map((item) => (
            <div key={item.id} className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 ${item.status === 'closed' ? 'bg-slate-50/20 opacity-75' : ''}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-3">
                  <div className={`p-2 rounded-xl mt-1 shrink-0 ${
                    item.type === 'asset' ? 'bg-indigo-50 text-indigo-500' : 
                    item.type === 'fd' ? 'bg-emerald-50 text-emerald-500' : 
                    'bg-rose-50 text-rose-500'
                  }`}>
                    {item.type === 'asset' && <ImageIcon className="w-5 h-5" />}
                    {item.type === 'fd' && <LandmarkIcon className="w-5 h-5" />}
                    {item.type === 'loan' && <Building2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white line-clamp-1">{item.name}</h4>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">₹{item.value.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4 text-sm bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4">
                {item.status === 'closed' && (
                  <div className="flex justify-between items-center text-slate-500">
                    <span className="font-medium">Status</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300 uppercase">Closed</span>
                  </div>
                )}
                {activeTab !== 'asset' && item.interest_rate && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Interest Rate</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{item.interest_rate}%</span>
                  </div>
                )}
                {item.purchase_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Start Date</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(item.purchase_date).toLocaleDateString()}</span>
                  </div>
                )}
                {item.maturity_date && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">End Date</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{new Date(item.maturity_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              
              {item.details && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-2">{item.details}</p>
              )}

              <div className="flex gap-2">
                {item.file_url && (
                  <a 
                    href={item.file_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm transition-colors"
                  >
                    <Download className="w-4 h-4" /> View File
                  </a>
                )}
                {canCreate && (
                  <button
                    onClick={() => {
                      setEditingId(item.id);
                      setForm({
                        name: item.name || '',
                        value: item.value?.toString() || '',
                        purchase_date: item.purchase_date || '',
                        maturity_date: item.maturity_date || '',
                        interest_rate: item.interest_rate?.toString() || '',
                        details: item.details || '',
                        status: item.status || 'active',
                      });
                      setShowForm(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-xl font-medium text-sm transition-colors"
                  >
                    <Edit className="w-4 h-4" /> Edit Record
                  </button>
                )}
                {canCreate && (
                  <button
                    onClick={() => {
                      setDeleteId(item.id);
                      setIsDeleteDialogOpen(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-700 dark:text-red-400 rounded-xl font-medium text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
      <ConfirmDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        title="Delete Record"
        description="Are you sure you want to delete this record? This action cannot be undone."
      />
    </div>
  );
};
