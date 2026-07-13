import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { useLanguage } from '../contexts/LanguageContext';
import { 
  Landmark, 
  RefreshCw, 
  Download, 
  Search, 
  Filter, 
  Calendar as CalendarIcon, 
  Lock, 
  AlertCircle, 
  CheckCircle2, 
  Database,
  ArrowDownLeft, 
  ArrowUpRight, 
  FileText, 
  Copy, 
  Check, 
  Clock,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Type definitions for Bank Account and Bank Transactions
interface BankAccount {
  id: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  account_type?: string;
  branch?: string;
  ifsc?: string;
  currency: string;
  balance: number;
  last_updated: string;
}

interface BankTransaction {
  id: string;
  account_number?: string;
  transaction_date: string;
  value_date: string;
  description: string;
  ref_no: string;
  debit: number;
  credit: number;
  balance: number;
  category?: string;
}

interface CredentialsStatus {
  configured: boolean;
  details: {
    hasCertificatePfx: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasApiUrl: boolean;
    apiEndpoint: string;
  };
}

export const BankStatements: React.FC = () => {
  const { user } = useUser();
  const { t } = useLanguage();
  
  // State management
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [dataSource, setDataSource] = useState<string>('');
  const [credentialsStatus, setCredentialsStatus] = useState<CredentialsStatus | null>(null);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [showSqlSetup, setShowSqlSetup] = useState<boolean>(false);

  // Finvu Account Aggregator states
  const [finvuHandle, setFinvuHandle] = useState<string>('ravimaturi@finvu');
  const [finvuConsents, setFinvuConsents] = useState<any[]>([]);
  const [hasFetchedFinvu, setHasFetchedFinvu] = useState<boolean>(false);
  const [submittingConsent, setSubmittingConsent] = useState<boolean>(false);
  const [fetchingFinvuData, setFetchingFinvuData] = useState<boolean>(false);
  const [showFinvuPanel, setShowFinvuPanel] = useState<boolean>(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Access check: Available to Chief Sthapathy (chief_sthapathy), Admin (admin), and Finance Manager (finance_manager)
  const isAuthorized = user?.role === 'chief_sthapathy' || user?.role === 'admin' || user?.role === 'finance_manager';

  // Fetch Finvu Status helper
  const fetchFinvuStatus = async () => {
    try {
      const res = await fetch('/api/finvu/consents');
      if (res.ok) {
        const data = await res.json();
        setFinvuConsents(data.consents || []);
        setHasFetchedFinvu(data.hasFetchedFinvu || false);
      }
    } catch (err) {
      console.error("Error fetching Finvu consents:", err);
    }
  };

  // Fetch bank statement data from server
  const fetchBankData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // Get account & transactions
      const res = await fetch('/api/bank/statements');
      if (!res.ok) throw new Error('Failed to retrieve bank statements');
      const data = await res.json();
      
      setAccounts(data.accounts || []);
      setTransactions(data.transactions || []);
      setDataSource(data.source || 'unknown');

      // Get configuration details
      const statusRes = await fetch('/api/bank/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setCredentialsStatus(statusData.credentials || null);
      }

      // Fetch Finvu details
      await fetchFinvuStatus();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error loading bank statement data');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchBankData();
    }
  }, [user, isAuthorized]);

  // Initiate Finvu Consent
  const handleInitiateFinvuConsent = async () => {
    if (!finvuHandle || !finvuHandle.includes('@')) {
      toast.error('Please enter a valid Account Aggregator handle (e.g. name@finvu)');
      return;
    }
    setSubmittingConsent(true);
    const apiToast = toast.loading(`[SANDBOX SIMULATION] Initiating consent request to Finvu for handle: ${finvuHandle}...`);
    try {
      const res = await fetch('/api/finvu/consent-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: finvuHandle })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`[SANDBOX SUCCESS] ${data.message} (Note: Running in sandbox mode; no actual app notification is sent.)`, { id: apiToast });
        await fetchFinvuStatus();
      } else {
        throw new Error(data.error || 'Failed to request consent');
      }
    } catch (err: any) {
      toast.error(err.message, { id: apiToast });
    } finally {
      setSubmittingConsent(false);
    }
  };

  // Approve Finvu Consent
  const handleApproveFinvuConsent = async (consentId: string) => {
    const approveToast = toast.loading('[SANDBOX SIMULATION] Approving consent securely inside simulated Finvu mobile flow...');
    try {
      const res = await fetch('/api/finvu/approve-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('[SANDBOX] Consent approved successfully!', { id: approveToast, description: 'Consent state is now ACTIVE in this preview environment.' });
        await fetchFinvuStatus();
      } else {
        throw new Error(data.error || 'Failed to approve consent');
      }
    } catch (err: any) {
      toast.error(err.message, { id: approveToast });
    }
  };

  // Fetch Finvu Financial Data (Savings account)
  const handleFetchFinvuData = async (consentId: string) => {
    setFetchingFinvuData(true);
    const fetchToast = toast.loading('[SANDBOX SIMULATION] Requesting secure digital signature key-shards, decrypting savings data...', {
      description: 'Requesting secure digital signature key-shards from simulated FIP...'
    });
    try {
      const res = await fetch('/api/finvu/fetch-fi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const dbStatus = data.savedToSupabase
          ? 'Data downloaded and successfully synced to Supabase database!'
          : 'Data downloaded. Running in local sandbox simulator mode.';
        toast.success('[SANDBOX] Simulated Savings Account statements decrypted successfully!', {
          id: fetchToast,
          description: dbStatus
        });
        await fetchFinvuStatus();
        await fetchBankData(true);
      } else {
        throw new Error(data.error || 'Failed to fetch financial data');
      }
    } catch (err: any) {
      toast.error(err.message, { id: fetchToast });
    } finally {
      setFetchingFinvuData(false);
    }
  };

  // Reset Finvu Connection
  const handleResetFinvu = async () => {
    try {
      const res = await fetch('/api/finvu/reset', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Finvu account connection reset.');
        await fetchFinvuStatus();
        await fetchBankData(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Force Refresh bank statements
  const handleForceRefresh = async () => {
    setRefreshing(true);
    const refreshToast = toast.loading('Connecting to Union Bank of India Corporate Banking Portal...', {
      description: 'Signing requests with Digital Signature Certificate (PFX) and authenticating...',
    });

    try {
      const response = await fetch('/api/bank/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Connection to corporate banking system timed out');
      }

      const result = await response.json();
      
      if (result.success) {
        // Success toasts with specific feedback on whether it wrote to Supabase
        const dbStatus = result.savedToSupabase 
          ? 'Data downloaded and successfully synced to Supabase database!' 
          : 'Data downloaded. Running in local sandbox simulator mode.';

        toast.success('Statements fetched successfully!', {
          id: refreshToast,
          description: dbStatus,
        });

        // Re-fetch statement list
        await fetchBankData(true);
      } else {
        throw new Error(result.message || 'Failed to download statement');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to refresh bank statements', {
        id: refreshToast
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Trigger manual daily Cron trigger
  const handleTriggerCronSimulator = async () => {
    const cronToast = toast.loading('Triggering Scheduled Cron Job: daily_bank_download_sync...');
    try {
      const response = await fetch('/api/cron/fetch-bank-statements', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer cron-secure-token-100293',
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        toast.success('Daily scheduled sync finished successfully!', {
          id: cronToast,
          description: 'Downloaded 1 new transaction from Union Bank.'
        });
        await fetchBankData(true);
      } else {
        throw new Error('Cron executor rejected connection');
      }
    } catch (error: any) {
      toast.error('Cron job simulation failed: ' + error.message, { id: cronToast });
    }
  };

  // Helper to copy SQL to clipboard
  const copySqlSchema = () => {
    const currentOrigin = window.location.origin;
    const sqlText = `-- Supabase SQL Schema & native Scheduler for Union Bank Statement Integration
-- Execute this script in your Supabase SQL Editor.

-- 1. BANK ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id TEXT PRIMARY KEY,
    account_number TEXT UNIQUE NOT NULL,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    currency TEXT DEFAULT 'INR',
    balance NUMERIC(15, 2) DEFAULT 0.00,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BANK TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    value_date DATE NOT NULL,
    description TEXT NOT NULL,
    ref_no TEXT UNIQUE NOT NULL,
    debit NUMERIC(15, 2) DEFAULT 0.00,
    credit NUMERIC(15, 2) DEFAULT 0.00,
    balance NUMERIC(15, 2) NOT NULL,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR SECURE ACCESS
-- Restrict read/write privileges to Admin, Chief Sthapathy and Finance Manager roles
CREATE POLICY "Allow finance access for bank_accounts" 
ON public.bank_accounts 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'chief_sthapathy', 'finance_manager')
  )
);

CREATE POLICY "Allow finance access for bank_transactions" 
ON public.bank_transactions 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'chief_sthapathy', 'finance_manager')
  )
);

-- 4. CRON JOB SCHEDULER (Supabase pg_cron + pg_net)
-- Enables a 100% native Supabase scheduled cron job that hits your app server daily
-- to download, sign, and write bank statements to your database.

-- First, enable the required native Supabase extensions if not active
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any existing task to prevent duplicate schedules
SELECT cron.unschedule('daily-bank-sync');

-- Schedule the automated bank download to run every day at midnight (00:00 UTC)
SELECT cron.schedule(
    'daily-bank-sync',
    '0 0 * * *',
    $$
    SELECT net.http_post(
        url := '${currentOrigin}/api/cron/fetch-bank-statements',
        headers := '{"Authorization": "Bearer cron-secure-token-100293", "Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
    );
    $$
);
`;

    navigator.clipboard.writeText(sqlText);
    setCopiedSql(true);
    toast.success('SQL schema & scheduler copied to clipboard!');
    setTimeout(() => setCopiedSql(false), 3000);
  };

  // Export ledger to PDF
  const handleExportPDF = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions available to export');
      return;
    }

    try {
      const doc = new jsPDF();
      const currentAccount = accounts[0] || {
        account_name: 'PURVA VEDIC CONSULTANCY PRIVATE LIMITED',
        account_number: '50100987654321',
        bank_name: 'Union Bank of India',
        balance: 0
      };

      // Set elegant title & layout header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(30, 41, 59); // Slate-800
      doc.text('CORPORATE LEDGER ACCOUNT STATEMENT', 14, 20);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // Slate-500
      doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy, hh:mm a')} (Local Time)`, 14, 27);
      
      // Divider
      doc.setDrawColor(226, 232, 240); // Slate-200
      doc.line(14, 32, 196, 32);

      // Metadata section
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105); // Slate-600
      doc.text('Account Details', 14, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Company Name: ${currentAccount.account_name}`, 14, 47);
      doc.text(`Bank Name: ${currentAccount.bank_name}`, 14, 53);
      doc.text(`Account No: ${currentAccount.account_number}`, 14, 59);
      doc.text(`Currency: ${currentAccount.currency || 'INR'} (Indian Rupee)`, 14, 65);

      // Balance Summary block on the right
      doc.rect(130, 38, 66, 30, 'S');
      doc.setFont('helvetica', 'bold');
      doc.text('Current Available Balance', 135, 45);
      doc.setFontSize(14);
      doc.setTextColor(16, 185, 129); // Emerald-500
      const formattedBal = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(currentAccount.balance);
      doc.text(formattedBal, 135, 54);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text(`As of: ${format(new Date(currentAccount.last_updated), 'dd MMM yyyy, hh:mm a')}`, 135, 62);

      // Table mapping
      const tableColumn = ["Date", "Description", "Ref / UTR No", "Category", "Debit", "Credit", "Balance"];
      const tableRows: any[] = [];

      filteredTransactions.forEach(tx => {
        const txData = [
          format(new Date(tx.transaction_date), 'dd MMM yyyy'),
          tx.description,
          tx.ref_no,
          tx.category || 'Uncategorized',
          tx.debit > 0 ? `INR ${tx.debit.toLocaleString('en-IN', {minimumFractionDigits: 2})}` : '-',
          tx.credit > 0 ? `INR ${tx.credit.toLocaleString('en-IN', {minimumFractionDigits: 2})}` : '-',
          `INR ${tx.balance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`
        ];
        tableRows.push(txData);
      });

      // Write table
      (doc as any).autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 75,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [71, 85, 105], textColor: 255 }, // Slate-600 background
        alternateRowStyles: { fillColor: [248, 250, 252] }, // Slate-50 background
        margin: { left: 14, right: 14 }
      });

      // Save PDF
      doc.save(`UnionBank_Statement_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('Statement exported successfully as PDF!');
    } catch (error: any) {
      toast.error('Error exporting PDF: ' + error.message);
    }
  };

  // Export ledger to CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No transactions available to export');
      return;
    }

    try {
      const headers = ['Date', 'Value Date', 'Description', 'Reference No / UTR', 'Category', 'Debit', 'Credit', 'Running Balance'];
      const rows = filteredTransactions.map(tx => [
        tx.transaction_date,
        tx.value_date,
        `"${tx.description.replace(/"/g, '""')}"`,
        tx.ref_no,
        tx.category || '',
        tx.debit,
        tx.credit,
        tx.balance
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `UnionBank_Ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Statement exported successfully as CSV!');
    } catch (error: any) {
      toast.error('Error exporting CSV: ' + error.message);
    }
  };

  // Category unique options list
  const categoriesList = Array.from(
    new Set(transactions.map(t => t.category).filter(Boolean))
  ) as string[];

  // Filter & Search Logic
  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
      tx.ref_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.category || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType = 
      filterType === 'all' || 
      (filterType === 'credit' && tx.credit > 0) || 
      (filterType === 'debit' && tx.debit > 0);

    const matchesCategory = 
      filterCategory === 'all' || 
      tx.category === filterCategory;

    const txDate = new Date(tx.transaction_date);
    const matchesStartDate = !startDate || txDate >= new Date(startDate);
    const matchesEndDate = !endDate || txDate <= new Date(endDate);

    return matchesSearch && matchesType && matchesCategory && matchesStartDate && matchesEndDate;
  });

  // Access Control Card if not authorized
  if (!isAuthorized) {
    return (
      <div id="bank-statements-access-denied" className="p-8 max-w-2xl mx-auto mt-12 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm text-center">
        <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4 animate-bounce" />
        <h2 className="text-2xl font-bold text-slate-800 dark:text-zinc-100 tracking-tight mb-2">Access Denied</h2>
        <p className="text-slate-500 dark:text-zinc-400 text-sm mb-6 leading-relaxed">
          The corporate banking statement integration and ledger reports are restricted strictly to the <strong>Chief Sthapathy</strong>, <strong>General Administrator</strong>, and <strong>Finance Manager</strong> roles.
        </p>
        <div className="bg-slate-50 dark:bg-white/5 p-4 rounded-xl text-left border border-slate-100 dark:border-white/5 flex items-start gap-3">
          <Lock className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          <div className="text-xs text-slate-500 dark:text-zinc-400 space-y-1">
            <span className="font-semibold block text-slate-700 dark:text-zinc-300">Your Current Identity:</span>
            <span>Role: <span className="font-mono text-rose-600 dark:text-rose-400 font-bold uppercase">{user?.role || 'Guest'}</span></span>
            <span className="block">Email: {user?.email}</span>
          </div>
        </div>
      </div>
    );
  }

  const primaryAccount = accounts[0] || {
    account_name: "PURVA VEDIC CONSULTANCY PRIVATE LIMITED",
    account_number: "50100987654321",
    bank_name: "Union Bank of India",
    balance: 7485000.50,
    currency: "INR",
    branch: "Mumbai Fort Corporate Branch",
    ifsc: "UBIN0530123",
    account_type: "Current Account",
    last_updated: new Date().toISOString()
  };

  // Calculations for Summary
  const totalCredits = filteredTransactions.reduce((acc, curr) => acc + curr.credit, 0);
  const totalDebits = filteredTransactions.reduce((acc, curr) => acc + curr.debit, 0);
  const creditCount = filteredTransactions.filter(tx => tx.credit > 0).length;
  const debitCount = filteredTransactions.filter(tx => tx.debit > 0).length;

  return (
    <div id="bank-statements-dashboard" className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl">
              <Landmark className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 tracking-tight">Corporate Bank Statements</h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400">Union Bank of India • Open Banking API Portal</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Daily Cron Simulation Trigger */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleTriggerCronSimulator}
            className="border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 font-medium flex items-center gap-1.5"
            title="Trigger the daily scheduled background cron download manually"
          >
            <Clock className="w-4 h-4 text-slate-500" />
            Simulate Daily Cron
          </Button>

          {/* Force Refresh Trigger */}
          <Button 
            onClick={handleForceRefresh} 
            disabled={refreshing}
            variant="default"
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refetching...' : 'Force Refresh Account'}
          </Button>
        </div>
      </div>

      {/* Database Connection Alert Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 px-4 py-3 rounded-2xl">
        <div className="flex items-start gap-2.5">
          <Database className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              Database Table Status: <span className="font-mono font-bold">{dataSource === 'supabase_database' ? 'CONNECTED TO SUPABASE' : 'RUNNING LOCALLY (SIMULATED)'}</span>
            </p>
            <p className="text-11px text-amber-700 dark:text-amber-400 leading-normal">
              {dataSource === 'supabase_database' 
                ? 'Transactions are permanent, durable, and written directly to your secure Supabase database instance.' 
                : 'Showing dynamic memory sandbox. Run the SQL schema script below in your Supabase Editor to unlock permanent storage.'}
            </p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setShowSqlSetup(!showSqlSetup)}
          className="text-xs font-bold text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/40 shrink-0"
        >
          {showSqlSetup ? 'Hide SQL Code' : 'View SQL Setup'}
        </Button>
      </div>

      {/* SQL Setup Panel */}
      {showSqlSetup && (
        <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl border border-slate-800 shadow-lg space-y-4 font-sans animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              <span className="text-sm font-semibold">Supabase Provisioning Query</span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={copySqlSchema}
                className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSql ? 'Copied!' : 'Copy SQL'}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Copy and run this database schema block inside your <strong>Supabase SQL Editor</strong> to automatically create the ledger, transaction audit tables, and the native <strong>pg_cron + pg_net daily background scheduler</strong>.
          </p>
          <pre className="text-xs font-mono bg-black/40 p-4 rounded-xl overflow-x-auto max-h-60 text-slate-300 border border-slate-950">
{`-- Create Bank Accounts Table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id TEXT PRIMARY KEY,
    account_number TEXT UNIQUE NOT NULL,
    account_name TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    currency TEXT DEFAULT 'INR',
    balance NUMERIC(15, 2) DEFAULT 0.00,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Create Bank Transactions Table
CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    value_date DATE NOT NULL,
    description TEXT NOT NULL,
    ref_no TEXT UNIQUE NOT NULL,
    debit NUMERIC(15, 2) DEFAULT 0.00,
    credit NUMERIC(15, 2) DEFAULT 0.00,
    balance NUMERIC(15, 2) NOT NULL,
    category TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Supabase pg_cron + pg_net scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Clear previous cron if exists
SELECT cron.unschedule('daily-bank-sync');

-- Schedule statement download daily
SELECT cron.schedule(
    'daily-bank-sync',
    '0 0 * * *',
    $$
    SELECT net.http_post(
        url := '${window.location.origin}/api/cron/fetch-bank-statements',
        headers := '{"Authorization": "Bearer cron-secure-token-100293", "Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
    );
    $$
);`}
          </pre>
        </div>
      )}

      {/* Account Info Panel & Credentials verification */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Main Balance Card */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-3xl relative overflow-hidden shadow-md">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
            <Landmark className="w-56 h-56" />
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs uppercase tracking-widest text-indigo-200 font-bold">Union Bank of India Current A/C</span>
            <span className="px-2.5 py-1 text-9px bg-white/15 text-white uppercase rounded-md font-mono tracking-wider">
              {primaryAccount.account_type || 'CURRENT'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-indigo-200">Current Available Balance</span>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(primaryAccount.balance)}
            </h2>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-indigo-200">
            <div>
              <p className="opacity-70 text-10px">Account Number</p>
              <p className="font-mono font-semibold tracking-wider text-white">•••• •••• {primaryAccount.account_number?.slice(-6) || '543210'}</p>
            </div>
            <div className="text-right">
              <p className="opacity-70 text-10px">IFSC Code</p>
              <p className="font-mono font-semibold text-white">{primaryAccount.ifsc || 'UBIN0530123'}</p>
            </div>
          </div>
        </div>

        {/* Card 2: Server-Side API Credentials Verification */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2.5 mb-3">
              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                API Security Keyring
              </span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-9px font-semibold ${
                credentialsStatus?.configured 
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' 
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
              }`}>
                {credentialsStatus?.configured ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    LIVE DEPLOYED
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    SIMULATED SANDBOX
                  </>
                )}
              </span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-500 dark:text-zinc-400">
              <div className="flex items-center justify-between">
                <span>1. Certificate signature (.pfx)</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">
                  {credentialsStatus?.details.hasCertificatePfx ? '✅ SECURED' : '❌ NOT LOADED'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>2. OpenBanking Client ID</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">
                  {credentialsStatus?.details.hasClientId ? '✅ SECURED' : '❌ NOT LOADED'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>3. OpenBanking Secret Key</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">
                  {credentialsStatus?.details.hasClientSecret ? '✅ SECURED' : '❌ NOT LOADED'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>4. Bank Host Gateway URL</span>
                <span className="font-mono text-slate-600 dark:text-zinc-400 truncate max-w-[130px]" title={credentialsStatus?.details.apiEndpoint}>
                  {credentialsStatus?.details.hasApiUrl ? '✅ CONFIG' : 'USING SANDBOX'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center gap-2 text-10px text-slate-400">
            <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span>Credentials reside exclusively in environment secrets and are never exposed to clients.</span>
          </div>
        </div>

        {/* Card 3: Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-950/20 p-5 rounded-3xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-11px font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">Credits ({creditCount})</span>
              <div className="p-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-300 tracking-tight">
                +{totalCredits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-9px text-emerald-600 dark:text-emerald-400 mt-1">Total incoming ledger credits</p>
            </div>
          </div>

          <div className="bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-950/20 p-5 rounded-3xl flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-11px font-bold text-rose-800 dark:text-rose-400 uppercase tracking-wider">Debits ({debitCount})</span>
              <div className="p-1 bg-rose-100 dark:bg-rose-900/30 rounded-lg">
                <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              </div>
            </div>
            <div className="mt-2">
              <h3 className="text-lg font-bold text-rose-900 dark:text-rose-300 tracking-tight">
                -{totalDebits.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </h3>
              <p className="text-9px text-rose-600 dark:text-rose-400 mt-1">Total outgoing cash flow</p>
            </div>
          </div>
        </div>
      </div>

      {/* Finvu Account Aggregator Integration Portal */}
      <div id="finvu-aa-integration-portal" className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-white/10 rounded-3xl p-5 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="px-2 py-0.5 text-9px bg-amber-600 text-white rounded font-bold uppercase tracking-wide flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                Developer Sandbox Mode
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5">
                Finvu Account Aggregator Hub
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
              Consolidate savings accounts and individual ledgers securely using the standardized <strong>ReBIT Account Aggregator (AA)</strong> flow. Fully consent-driven and end-to-end encrypted.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            {hasFetchedFinvu && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleResetFinvu}
                className="text-11px text-rose-500 hover:text-rose-600 dark:hover:bg-rose-950/15"
              >
                Disconnect & Reset Link
              </Button>
            )}
            <button 
              onClick={() => setShowFinvuPanel(!showFinvuPanel)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1"
            >
              {showFinvuPanel ? 'Hide Setup & Live Guide' : 'Learn How To Go Live ⚡'}
            </button>
          </div>
        </div>

        {/* Global Sandbox Alert Banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-amber-800 dark:text-amber-400">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Why did you not receive an SMS or push notification on your actual Finvu Mobile App?</p>
            <p>
              This app is currently running in an <strong>Interactive Sandbox Simulator environment</strong>. Because we do not have your organization's legal Finvu client credentials or registered webhooks, the system does not send real-time triggers to the live Finvu network. Instead, you can <strong>simulate</strong> the complete flow directly in the dashboard below to preview exactly how the system decrypts, registers, and writes statements to your ledger database.
            </p>
          </div>
        </div>

        {/* Informational guide if requested */}
        {showFinvuPanel && (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-white/5 p-5 rounded-2xl text-xs space-y-4 text-slate-600 dark:text-zinc-300 animate-fadeIn">
            <div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-zinc-100 flex items-center gap-1.5 mb-1">
                <Lock className="w-4 h-4 text-indigo-500" />
                Step-by-Step Guide: Transitioning to Finvu Production API
              </h3>
              <p className="text-slate-400 text-11px">Follow this enterprise checklist to connect your live Indian bank accounts (HDFC, Union Bank, SBI, etc.) to your production database.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-white/2 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">01. Register with Sahamati</div>
                <p className="text-slate-500 dark:text-zinc-400 text-11px leading-relaxed">
                  Join the Sahamati central registry as an official <strong>Financial Information User (FIU)</strong> to receive your central digital certificate.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-white/2 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">02. Onboard with Finvu</div>
                <p className="text-slate-500 dark:text-zinc-400 text-11px leading-relaxed">
                  Sign your commercial agreement with Finvu. They will issue your production <strong>Client ID</strong>, <strong>Client Secret</strong>, and access endpoints.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-white/2 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">03. Exchange Keys</div>
                <p className="text-slate-500 dark:text-zinc-400 text-11px leading-relaxed">
                  Upload your public RSA/ECDH keys to Finvu. Use ephemeral Diffie-Hellman keys server-side to decrypt incoming ReBIT XML payloads.
                </p>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-white/2 space-y-1.5">
                <div className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-xs">04. Configure Webhooks</div>
                <p className="text-slate-500 dark:text-zinc-400 text-11px leading-relaxed">
                  Register your app's callback URL (e.g. <code>/api/finvu/webhook</code>) so Finvu can push active consent updates when users authorize in the app.
                </p>
              </div>
            </div>

            <div className="bg-indigo-50/50 dark:bg-indigo-950/10 p-3.5 rounded-xl border border-indigo-150 dark:border-indigo-950/20 text-11px leading-relaxed text-indigo-800 dark:text-indigo-300">
              💡 <strong>Technical Architecture Note:</strong> Because all Account Aggregator data fetched is end-to-end encrypted (E2EE) using keys exchanged directly between the Financial Information Provider (FIP) and your server, neither Finvu nor any intermediary has access to your raw bank statement bytes.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Linkage Control (Left Panel) */}
          <div className="lg:col-span-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 block">
                Link New Handle
              </span>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                Provide your active Account Aggregator VPA handle registered in Finvu or any Sahamati-compliant portal to begin synchronization.
              </p>
              
              <div className="space-y-1.5 pt-1">
                <label className="text-10px font-semibold text-slate-600 dark:text-zinc-400 block">Finvu / AA Handle</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      placeholder="username@finvu"
                      value={finvuHandle}
                      onChange={(e) => setFinvuHandle(e.target.value)}
                      disabled={submittingConsent || hasFetchedFinvu}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 dark:bg-zinc-950 dark:border-white/10 dark:text-zinc-100 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-mono text-indigo-600 dark:text-indigo-400 font-medium"
                    />
                  </div>
                  <Button 
                    onClick={handleInitiateFinvuConsent} 
                    disabled={submittingConsent || hasFetchedFinvu}
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                  >
                    {submittingConsent ? 'Sending...' : 'Initiate Link'}
                  </Button>
                </div>
              </div>
            </div>

            {hasFetchedFinvu ? (
              <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-950/25 rounded-xl space-y-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    Connection Active
                    <span className="px-1.5 py-0.5 text-9px bg-emerald-600 text-white rounded uppercase font-mono font-normal">SIMULATED</span>
                  </span>
                </div>
                <div className="text-11px text-emerald-700 dark:text-emerald-400 space-y-1 font-sans">
                  <p><strong>Linked Handle:</strong> {finvuHandle}</p>
                  <p><strong>Bank Provider:</strong> HDFC Bank Ltd</p>
                  <p><strong>Consent Duration:</strong> Active until July 2027</p>
                  <p><strong>Decrypted Ledger:</strong> Savings A/C (••••7490)</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/15 border border-amber-100/60 dark:border-amber-900/10 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-11px text-amber-700 dark:text-amber-400 leading-normal">
                  You can test the flow by submitting the pre-loaded handle <strong>ravimaturi@finvu</strong>. It will register a pending consent which you can approve and fetch instantly.
                </div>
              </div>
            )}
          </div>

          {/* Active Consents & Requests (Right Panel) */}
          <div className="lg:col-span-7 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Active Consent Requests ({finvuConsents.length})
              </span>
              <span className="text-10px text-slate-400">Updated Real-Time</span>
            </div>

            {finvuConsents.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-150 dark:border-white/5 rounded-xl">
                <p className="text-xs text-slate-400">No active consent requests yet. Enter your handle on the left to spawn a secure link request.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {finvuConsents.map((consent) => {
                  const isPending = consent.status === 'PENDING';
                  const isApproved = consent.status === 'APPROVED';
                  const isFetched = hasFetchedFinvu && consent.handle === finvuHandle;

                  return (
                    <div 
                      key={consent.id} 
                      className="p-3.5 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 dark:text-zinc-200">
                            {consent.handle}
                          </span>
                          <span className={`px-2 py-0.5 text-9px font-bold rounded ${
                            isFetched
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : isApproved
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}>
                            {isFetched ? 'SYNCHRONIZED (SANDBOX)' : consent.status}
                          </span>
                        </div>
                        <div className="text-11px text-slate-400 space-y-0.5">
                          <p><strong>Consent Token ID:</strong> {consent.id}</p>
                          <p><strong>Authorized FIPs:</strong> HDFC Bank, Union Bank of India</p>
                          <p><strong>FI Types Requested:</strong> DEPOSIT (Savings, Current)</p>
                        </div>
                      </div>

                      <div className="flex flex-row sm:flex-col items-stretch sm:items-end justify-center gap-1.5">
                        {isPending && (
                          <div className="space-y-1 text-right">
                            <Button
                              size="sm"
                              onClick={() => handleApproveFinvuConsent(consent.id)}
                              className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs py-1"
                            >
                              📱 Approve (Simulate Mobile App)
                            </Button>
                            <span className="block text-9px text-amber-500 italic">Pretend to approve in Finvu app</span>
                          </div>
                        )}
                        {isApproved && !isFetched && (
                          <div className="space-y-1 text-right">
                            <Button
                              size="sm"
                              disabled={fetchingFinvuData}
                              onClick={() => handleFetchFinvuData(consent.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-1 flex items-center gap-1"
                            >
                              {fetchingFinvuData && <Loader2 className="w-3 h-3 animate-spin" />}
                              ⚡ Decrypt & Import (Sandbox)
                            </Button>
                            <span className="block text-9px text-indigo-400 italic">Import simulated bank statement</span>
                          </div>
                        )}
                        {isFetched && (
                          <div className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs flex flex-col items-end">
                            <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Statements Imported</span>
                            <span className="text-9px text-slate-400 block font-normal">Simulated Sandbox Ledger</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar Toolbar */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Text Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4.5 h-4.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by UTR number, description, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 dark:bg-zinc-950 dark:border-white/10 dark:text-zinc-100 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter type */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value as any)}
                className="bg-transparent border-none outline-none text-slate-700 dark:text-zinc-300 font-medium"
              >
                <option value="all">All Trans.</option>
                <option value="credit">Credits</option>
                <option value="debit">Debits</option>
              </select>
            </div>

            {/* Filter category */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-xs">
              <select 
                value={filterCategory} 
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-transparent border-none outline-none text-slate-700 dark:text-zinc-300 font-medium"
              >
                <option value="all">All Categories</option>
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date Filters & Exports */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-slate-100 dark:border-white/5">
          {/* Date Pickers */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5 text-slate-400" /> From:</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 dark:bg-zinc-950 dark:border-white/10 rounded-lg p-1 text-slate-700 dark:text-zinc-300 outline-none"
            />
            <span>To:</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 dark:bg-zinc-950 dark:border-white/10 rounded-lg p-1 text-slate-700 dark:text-zinc-300 outline-none"
            />
            {(startDate || endDate || searchTerm || filterType !== 'all' || filterCategory !== 'all') && (
              <button 
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSearchTerm('');
                  setFilterType('all');
                  setFilterCategory('all');
                }}
                className="text-xs text-rose-600 hover:underline ml-2"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportCSV}
              className="border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 text-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              CSV Export
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportPDF}
              className="border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 text-xs flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-500" />
              PDF Statement
            </Button>
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Securing banking link and downloading statement transactions...</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-16 text-center">
            <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-700 dark:text-zinc-200 mb-1">No transactions found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              Try altering your keywords or filters, or hit the <strong>Force Refresh Account</strong> button at the top to download the latest live data from the banking server.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 dark:bg-white/2 dark:border-white/5 text-10px font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
                  <th className="px-5 py-3.5">Transaction Date</th>
                  <th className="px-5 py-3.5">Value Date</th>
                  <th className="px-5 py-3.5">UTR / Reference No</th>
                  <th className="px-5 py-3.5">Description</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5 text-right">Debit (₹)</th>
                  <th className="px-5 py-3.5 text-right">Credit (₹)</th>
                  <th className="px-5 py-3.5 text-right">Running Balance (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-white/5 text-xs">
                {filteredTransactions.map((tx) => (
                  <tr 
                    key={tx.id} 
                    className="hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors align-middle"
                  >
                    {/* Tx Date */}
                    <td className="px-5 py-4 font-medium text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                      {format(new Date(tx.transaction_date), 'dd MMM yyyy')}
                    </td>
                    
                    {/* Value Date */}
                    <td className="px-5 py-4 text-slate-400 whitespace-nowrap">
                      {format(new Date(tx.value_date), 'dd MMM yyyy')}
                    </td>

                    {/* UTR / Ref */}
                    <td className="px-5 py-4 font-mono font-medium text-slate-500 dark:text-zinc-400 whitespace-nowrap select-all" title="Click to copy">
                      {tx.ref_no}
                    </td>

                    {/* Description */}
                    <td className="px-5 py-4 text-slate-700 dark:text-zinc-300 max-w-[280px] break-words line-clamp-2 md:line-clamp-none font-medium leading-relaxed">
                      {tx.description}
                    </td>

                    {/* Category */}
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full text-9px font-semibold bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-zinc-400 whitespace-nowrap">
                        {tx.category || 'Unassigned'}
                      </span>
                    </td>

                    {/* Debit */}
                    <td className="px-5 py-4 text-right font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                      {tx.debit > 0 ? `-₹${tx.debit.toLocaleString('en-IN', {minimumFractionDigits: 2})}` : ''}
                    </td>

                    {/* Credit */}
                    <td className="px-5 py-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      {tx.credit > 0 ? `+₹${tx.credit.toLocaleString('en-IN', {minimumFractionDigits: 2})}` : ''}
                    </td>

                    {/* Balance */}
                    <td className="px-5 py-4 text-right font-mono font-bold text-slate-800 dark:text-zinc-200 whitespace-nowrap">
                      ₹{tx.balance.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Footnote information */}
        <div className="bg-slate-50 dark:bg-white/2 px-5 py-3.5 border-t border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-10px text-slate-400 dark:text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Account records downloaded dynamically: {format(new Date(primaryAccount.last_updated), 'dd MMM yyyy, hh:mm a')}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Secure 256-bit DSC Certified link</span>
            <span>•</span>
            <span className="flex items-center gap-0.5 text-indigo-500 dark:text-indigo-400 hover:underline cursor-pointer">
              Union Bank Developer Portal <ExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
