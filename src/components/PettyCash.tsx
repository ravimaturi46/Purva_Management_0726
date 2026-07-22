import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest, msalConfig, getFreshGraphToken, hasActiveMsalAccount } from '../lib/msalConfig';
import { getStoredMsalToken, saveMsalSession, getStoredMsalAccount, getGraphAccessToken, clearMsalSession } from '../lib/msalHelper';
import { PublicClientApplication } from '@azure/msal-browser';
import { Client, ResponseType } from '@microsoft/microsoft-graph-client';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useFileSettings } from '../contexts/FileSettingsContext';
import { hasAdminAccess } from '../types';
import { Button } from './ui/button';
import { Plus, Filter, Download, Printer, ArrowDown, ArrowUp, Calendar as CalendarIcon, User as UserIcon, X, Loader2, Pencil, Paperclip, ExternalLink, RefreshCw, } from 'lucide-react';
import { toast } from 'sonner';
import { exportPettyCashToPrint } from '../lib/exportToHtml';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const CATEGORIES = ['Office', 'Travel', 'Food', 'Stationary', 'Prasad Sir', 'Misc'];
const COLORS = ['#4f46e5', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#64748b'];

interface PettyCashEntry {
  id: string;
  date: string;
  project_name: string;
  category: string;
  bill_name: string;
  reason: string;
  advance_amount: number;
  expenditure_amount: number;
  raised_by_id: string;
  raised_by_name: string;
  entered_by_id?: string;
  entered_by_name?: string;
  created_at: string;
  receipt_url?: string;
}
export function PettyCash() {
  const { user, allUsers } = useUser();
  const { addNotification } = useNotifications();
  const { canManagePettyCash } = useFileSettings();
  const isAdmin = canManagePettyCash(user?.role, 'edit') || hasAdminAccess(user?.role);
  const canCreate = canManagePettyCash(user?.role, 'create');

  const { instance, accounts, inProgress } = useMsal();

  const getMSALAccountFromStorage = useCallback(() => {
    const targetTenantId = "372752f4-b131-4c36-a887-25c96537640c";
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('-account-') || key.includes('.accounts.'))) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item);
            if (parsed && parsed.homeAccountId && parsed.username) {
              const realm = parsed.realm || '';
              const homeAccountId = parsed.homeAccountId || '';
              // Ensure the tenant ID matches our specific tenant ID to prevent false-positives from other apps on the same domain
              if (realm === targetTenantId || homeAccountId.includes(targetTenantId)) {
                return {
                  homeAccountId: parsed.homeAccountId,
                  environment: parsed.environment || 'login.microsoftonline.com',
                  tenantId: parsed.realm || targetTenantId,
                  username: parsed.username,
                  localAccountId: parsed.localAccountId || parsed.homeAccountId,
                  name: parsed.name || parsed.username.split('@')[0],
                };
              }
            }
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    return null;
  }, []);

  const [msalReady, setMsalReady] = useState(() => {
    if (instance.getAllAccounts().length > 0) return true;
    if (getStoredMsalToken()) return true;
    if (getStoredMsalAccount()) return true;
    // Check if there is a valid stored account specifically for our tenant to avoid false positives
    const storedAccount = getMSALAccountFromStorage();
    if (storedAccount) return true;
    return false;
  });
  
  useEffect(() => {
    const initAndCheckToken = async () => {
      // Set active account first if possible
      const allAccounts = instance.getAllAccounts();
      const hasAccounts = allAccounts.length > 0 || accounts.length > 0;
      if (hasAccounts) {
        if (!instance.getActiveAccount()) {
          const active = allAccounts[0] || accounts[0];
          if (active) {
            instance.setActiveAccount(active);
          }
        }
      } else {
        const stored = getStoredMsalAccount() || getMSALAccountFromStorage();
        if (stored) {
          instance.setActiveAccount(stored as any);
        }
      }

      // Check token status
      const token = getStoredMsalToken();
      if (token) {
        setMsalReady(true);
        return;
      }

      // If no valid stored token, but we have accounts or stored accounts, try silent refresh
      const hasAccount = allAccounts.length > 0 || accounts.length > 0 || getStoredMsalAccount() || getMSALAccountFromStorage();
      if (hasAccount) {
        try {
          const freshToken = await getFreshGraphToken();
          if (freshToken) {
            const activeAcc = instance.getActiveAccount() || allAccounts[0] || accounts[0] || getStoredMsalAccount() || getMSALAccountFromStorage();
            saveMsalSession(activeAcc, freshToken, Date.now() + 3500 * 1000);
            setMsalReady(true);
          } else {
            setMsalReady(false);
          }
        } catch (err) {
          console.warn("Silent token refresh on mount/change failed:", err);
          setMsalReady(false);
        }
      } else {
        setMsalReady(false);
      }
    };

    initAndCheckToken();
  }, [accounts, instance, getMSALAccountFromStorage]);
  
  const customInteractiveLogin = async () => {
    return new Promise<void>((resolve, reject) => {
      let isDone = false;
      
      instance.loginPopup({
        ...loginRequest,
        prompt: 'select_account'
      }).then(response => {
        if (!isDone) {
          isDone = true;
          if (response && response.account) {
            instance.setActiveAccount(response.account);
          }
          resolve();
        }
      }).catch(e => {
        if (!isDone) {
          if (e.message && e.message.includes('timed_out')) {
            const allAccounts = instance.getAllAccounts();
            if (allAccounts.length > 0) {
               instance.setActiveAccount(allAccounts[0]);
               isDone = true;
               resolve();
               return;
            }
            const stored = getMSALAccountFromStorage();
            if (stored) {
               instance.setActiveAccount(stored);
               isDone = true;
               resolve();
               return;
            }
          }
          isDone = true;
          console.error("MSAL loginPopup failed:", e);
          const isTimeout = e?.message?.includes('timed_out') || e?.errorCode?.includes('timed_out');
          if (isTimeout) {
            toast.error("Microsoft Auth failed: " + e.message + ". Note: Since this app is running in an iframe, the login popup might be blocked. Try opening the app in a new window/tab.", { duration: 10000 });
          } else {
            toast.error("Microsoft Auth failed: " + e.message);
          }
          reject(e);
        }
      });

      // Poll in case postMessage fails (e.g. inside iframe)
      const interval = setInterval(() => {
        if (isDone) {
          clearInterval(interval);
          return;
        }
        const allAccounts = instance.getAllAccounts();
        if (allAccounts.length > 0) {
          isDone = true;
          clearInterval(interval);
          instance.setActiveAccount(allAccounts[0]);
          resolve();
        } else {
          const stored = getMSALAccountFromStorage();
          if (stored) {
            isDone = true;
            clearInterval(interval);
            instance.setActiveAccount(stored);
            resolve();
          }
        }
      }, 1000);
    });
  };

  const getGraphToken = useCallback(async (interactive = false) => {
    try {
      return await getGraphAccessToken(instance);
    } catch (e: any) {
      console.warn("msalHelper getGraphAccessToken failed:", e);
      if (interactive) {
        await customInteractiveLogin();
        return await getGraphAccessToken(instance);
      } else {
        throw e;
      }
    }
  }, [instance, customInteractiveLogin]);

  const getGraphClient = useCallback(async (interactive = false) => {
    try {
      const token = await getFreshGraphToken();
      return Client.init({
        authProvider: (done) => {
          done(null, token);
        }
      });
    } catch (e: any) {
      console.warn("Silent fresh token acquisition failed:", e);
      try {
        const token = await getGraphToken(interactive);
        return Client.init({
          authProvider: (done) => {
            done(null, token);
          }
        });
      } catch (innerError) {
        throw innerError;
      }
    }
  }, [getGraphToken]);

  const [entries, setEntries] = useState<PettyCashEntry[]>([]);
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
        const [imageRefreshKey, setImageRefreshKey] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);

  // Filters
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterUser, setFilterUser] = useState<string>('All');
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({ start: firstDayOfMonth, end: lastDayOfMonth });

  // Form State
  const defaultDate = new Date().toISOString().split('T')[0];
  const emptyForm = {
    date: defaultDate,
    project_name: '',
    category: CATEGORIES[0],
    bill_name: '',
    reason: '',
    advance_amount: '',
    expenditure_amount: '',
    raised_by_id: ''
};
  const [form, setForm] = useState(emptyForm);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const handleMicrosoftLogout = () => {
    try {
      clearMsalSession();
      const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
      if (activeAccount) {
        instance.logoutPopup({ account: activeAccount }).then(() => {
          setMsalReady(false);
          toast.success("Logged out of Microsoft.");
        }).catch(() => {
          instance.clearCache();
          setMsalReady(false);
          window.location.reload();
        });
      } else {
        instance.clearCache();
        setMsalReady(false);
        toast.success("Microsoft Auth Cache cleared.");
      }
    } catch (e) {
      clearMsalSession();
      setMsalReady(false);
      window.location.reload();
    }
  };


  const handleExport = async () => {
    setIsExporting(true);
    
    let msAuthFailed = false;
    const hasSharepointLinks = filteredEntries.some(e => e.receipt_url?.includes("sharepoint.com") || e.receipt_url?.includes("1drv.ms"));
    
    if (hasSharepointLinks) {
       try {
         toast.info("Authenticating with Microsoft to access SharePoint images...");
         // Attempt to get token BEFORE opening the print window, as it might open a popup
         await getGraphToken(true);
         toast.success("Microsoft Authentication successful!");
       } catch (e: any) {
         console.warn("Failed to acquire MSAL token interactively upfront:", e);
         msAuthFailed = true;
         
         const isTimeout = e?.message?.includes('timed_out') || e?.errorCode?.includes('timed_out');
         if (isTimeout) {
           toast.error(
             "Microsoft Auth timed out! Since this app runs in an iframe, the login popup might be blocked or fail. " +
             "Please click 'Open in new window' in the top-right corner of the screen and try again.",
             { duration: 10000 }
           );
         } else {
           toast.error(`Microsoft Auth failed: ${e?.message || e}. (Try opening the app in a new window/tab to resolve iframe security restrictions).`, { duration: 10000 });
         }
       }
    }

    // Open the window after auth (might trigger popup blocker if MSAL took too long, but MSAL handles popups best immediately)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
       toast.error("Please allow popups for this site to print receipts.");
       setIsExporting(false);
       return;
    }
    printWindow.document.write("<html><head><title>Loading Receipts...</title></head><body style='font-family: sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #f8fafc;'><h2>Loading receipts for print...</h2><p style='color: #64748b; margin-top: 10px;' id='loading-status'>Initializing export process...</p><div style='margin-top: 20px; width: 300px; height: 6px; background-color: #e2e8f0; border-radius: 3px; overflow: hidden;'><div id='loading-progress-bar' style='width: 0%; height: 100%; background-color: #3b82f6; transition: width 0.3s ease;'></div></div></body></html>");
    
    let failedImages = 0;
    try {
      const fetchImagesBatch = async (urls: string[]) => {
        const results: Record<string, any> = {};
        const graphUrls = urls.filter(u => u.includes("sharepoint.com") || u.includes("1drv.ms"));
        const otherUrls = urls.filter(u => !u.includes("sharepoint.com") && !u.includes("1drv.ms"));
        
        const statusEl = printWindow.document.getElementById('loading-status');
        const progressEl = printWindow.document.getElementById('loading-progress-bar');
        
        if (statusEl) statusEl.innerText = `Found ${urls.length} images to load (${graphUrls.length} from SharePoint/OneDrive, ${otherUrls.length} standard attachments)...`;
        if (progressEl) progressEl.style.width = '10%';
        
        // 1. Batch Request to Graph API
        if (graphUrls.length > 0) {
          try {
            if (msAuthFailed) {
              console.warn("Skipping MSAL image fetch because auth failed.");
              if (statusEl) statusEl.innerText = `Microsoft Auth not available. Skipping silent batch fetch and falling back to browser direct load...`;
            } else {
              if (statusEl) statusEl.innerText = `Authenticating and requesting SharePoint images from Graph API...`;
              const token = await getGraphToken(false);
              
              // Helper to build candidates for a given URL
              const getCandidatesForUrl = (url: string, index: number) => {
                const candidates: { id: string; method: string; url: string }[] = [];
                
                // Helper to encode a URL into sharing token
                const getShareToken = (targetUrl: string) => {
                  try {
                    const base64 = btoa(unescape(encodeURIComponent(targetUrl)))
                      .replace(/=/g, '')
                      .replace(/\//g, '_')
                      .replace(/\+/g, '-');
                    return `u!${base64}`;
                  } catch (e) {
                    return null;
                  }
                };

                // 1. Cleaned original URL
                let cleanUrl = url;
                try {
                  const urlObj = new URL(url);
                  if (!urlObj.pathname.includes('/shared') && !urlObj.searchParams.has('id') && !urlObj.searchParams.has('parent')) {
                    urlObj.search = '';
                  }
                  cleanUrl = urlObj.toString();
                } catch (e) {}

                const token1 = getShareToken(cleanUrl);
                if (token1) {
                  candidates.push({
                    id: `${index}-c1`,
                    method: "GET",
                    url: `/shares/${token1}/driveItem?$select=name,@microsoft.graph.downloadUrl`
                  });
                }

                try {
                  const urlObj = new URL(url);
                  
                  // 2. Reconstructed direct URL (if 'id' parameter exists)
                  const idParam = urlObj.searchParams.get('id');
                  if (idParam) {
                    const directUrl = urlObj.origin + idParam;
                    const token2 = getShareToken(directUrl);
                    if (token2) {
                      candidates.push({
                        id: `${index}-c2`,
                        method: "GET",
                        url: `/shares/${token2}/driveItem?$select=name,@microsoft.graph.downloadUrl`
                      });
                    }

                    // 3. Direct drive relative path (if 'id' contains '/Documents/')
                    const docIndex = idParam.indexOf('/Documents/');
                    if (docIndex !== -1) {
                      const relativePath = idParam.substring(docIndex + '/Documents/'.length - 1); // should start with '/'
                      candidates.push({
                        id: `${index}-c3`,
                        method: "GET",
                        url: `/me/drive/root:${encodeURIComponent(relativePath)}?$select=name,@microsoft.graph.downloadUrl`
                      });
                    }
                  }

                  // 4. Unique ID from query params
                  const uniqueId = urlObj.searchParams.get('UniqueId') || urlObj.searchParams.get('uniqueid');
                  if (uniqueId) {
                    candidates.push({
                      id: `${index}-c4`,
                      method: "GET",
                      url: `/me/drive/items/${uniqueId}?$select=name,@microsoft.graph.downloadUrl`
                    });
                  }
                } catch (e) {
                  console.error("Error parsing URL for candidates:", e);
                }

                return candidates;
              };

              // Chunk requests to 4 graph URLs per batch to accommodate multiple candidates (max 20 per batch)
              const chunkSize = 4;
              for (let i = 0; i < graphUrls.length; i += chunkSize) {
                const chunk = graphUrls.slice(i, i + chunkSize);
                if (statusEl) statusEl.innerText = `Requesting SharePoint images chunk ${Math.floor(i/chunkSize) + 1} of ${Math.ceil(graphUrls.length/chunkSize)}...`;
                if (progressEl) progressEl.style.width = `${10 + Math.floor((i / graphUrls.length) * 50)}%`;
                const requests: any[] = [];
                
                chunk.forEach((url, urlIndex) => {
                  const candidates = getCandidatesForUrl(url, urlIndex);
                  requests.push(...candidates);
                });

                if (requests.length === 0) continue;
                
                const batchResponse = await fetch('https://graph.microsoft.com/v1.0/$batch', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ requests })
                });
                
                const batchData = await batchResponse.json();
                
                if (batchData.responses) {
                  const responsesByUrlIndex: Record<number, any[]> = {};
                  
                  batchData.responses.forEach((res: any) => {
                    const parts = res.id.split('-');
                    const urlIndex = parseInt(parts[0]);
                    if (!isNaN(urlIndex)) {
                      if (!responsesByUrlIndex[urlIndex]) {
                        responsesByUrlIndex[urlIndex] = [];
                      }
                      responsesByUrlIndex[urlIndex].push(res);
                    }
                  });
                  
                  for (let urlIndex = 0; urlIndex < chunk.length; urlIndex++) {
                     const originalUrl = chunk[urlIndex];
                     const candidatesResponses = responsesByUrlIndex[urlIndex] || [];
                     
                     // Find the first candidate response that is 200 OK and has a downloadUrl
                     const successRes = candidatesResponses.find(r => r.status === 200 && r.body && r.body["@microsoft.graph.downloadUrl"]);
                     
                     if (successRes) {
                        try {
                            const downloadUrl = successRes.body["@microsoft.graph.downloadUrl"];
                            const imgRes = await fetch(downloadUrl);
                            if (!imgRes.ok) throw new Error(`Failed to fetch from downloadUrl: ${imgRes.status}`);
                            const originalBlob = await imgRes.blob();
                            
                            const arrayBuffer = await originalBlob.arrayBuffer();
                            let type: "jpg" | "png" | "gif" | "bmp" | "webp" | "jpeg" = "jpg";
                            if (originalBlob.type.includes("png")) type = "png";
                            else if (originalBlob.type.includes("webp")) type = "webp";
                            else if (originalBlob.type.includes("gif")) type = "gif";
                            else if (originalBlob.type.includes("bmp")) type = "bmp";
                            else if (originalBlob.type.includes("jpeg")) type = "jpeg";

                            results[originalUrl] = { arrayBuffer, type };
                        } catch (e) {
                            console.error("Failed downloading Graph item:", e);
                            failedImages++;
                        }
                     } else {
                        console.error(`No successful candidate for URL: ${originalUrl}`);
                        failedImages++;
                     }
                  }
                }
              }
            }
          } catch (graphErr) {
             console.error("Graph batch process failed:", graphErr);
          }
        }
        
        // 2. Fetch other non-Graph URLs sequentially or in parallel
        let otherIndex = 0;
        for (const url of otherUrls) {
          otherIndex++;
          if (statusEl) statusEl.innerText = `Fetching attachment image ${otherIndex} of ${otherUrls.length}...`;
          if (progressEl) progressEl.style.width = `${60 + Math.floor((otherIndex / otherUrls.length) * 35)}%`;
          try {
             let originalBlob;
             try {
               const response = await fetch(url, { mode: 'cors' });
               if (!response.ok) throw new Error(`Failed to fetch image`);
               originalBlob = await response.blob();
             } catch (fetchError) {
               console.warn("Direct fetch failed, checking if url is loaded:", fetchError);
               throw fetchError;
             }
             
             if (!originalBlob.type.includes('text/html')) {
               const arrayBuffer = await originalBlob.arrayBuffer();
               let type: "jpg" | "png" | "gif" | "bmp" | "webp" | "jpeg" = "jpg";
               if (originalBlob.type.includes("png")) type = "png";
               else if (originalBlob.type.includes("webp")) type = "webp";
               else if (originalBlob.type.includes("gif")) type = "gif";
               else if (originalBlob.type.includes("bmp")) type = "bmp";
               else if (originalBlob.type.includes("jpeg")) type = "jpeg";

               results[url] = { arrayBuffer, type };
             } else {
               failedImages++;
             }
          } catch (e) {
             console.error("Failed other image:", e);
             failedImages++;
          }
        }
        
        if (progressEl) progressEl.style.width = '100%';
        if (statusEl) statusEl.innerText = `All images loaded! Generating print-friendly PDF view...`;
        
        return results;
      };

      // Pre-fetch all images in batch using our optimized fetchImagesBatch
      const allUrls = filteredEntries
        .map(e => e.receipt_url)
        .filter((url): url is string => !!url);
      
      const fetchedImagesMap = await fetchImagesBatch(allUrls);
      
      // Pass a single-image fetcher that looks up the pre-fetched images
      const singleImageFetcher = async (url: string) => {
        return fetchedImagesMap[url] || null;
      };

      await exportPettyCashToPrint(filteredEntries, singleImageFetcher, printWindow);
      if (failedImages > 0) {
        toast.warning(`Export completed, but ${failedImages} images failed to load.`);
      } else {
        toast.success('Export completed successfully');
      }
    } catch (err) {
      console.error(err);
      if (printWindow) {
         printWindow.document.body.innerHTML = "<h2>Failed to load receipts for printing. Please try again.</h2>";
      }
      toast.error('Failed to export to Print');
    } finally {
      setIsExporting(false);
    }
  };
  useEffect(() => {
    fetchQueries();
}, [dateRange.start, dateRange.end]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // If not an image (e.g. PDF or document), skip compression and keep original file
    if (!file.type.startsWith('image/')) {
      setReceiptFile(file);
      setIsCompressing(false);
      return;
    }

    setIsCompressing(true);
    
    const reader = new FileReader();
    reader.onerror = () => {
      console.error("FileReader error reading receipt");
      toast.error("Failed to read receipt file. Using original file.");
      setReceiptFile(file);
      setIsCompressing(false);
    };
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => {
        console.error("Image load error for compression");
        toast.error("Could not process image compression. Using original file.");
        setReceiptFile(file);
        setIsCompressing(false);
      };
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], `${Date.now()}_receipt.webp`, { type: 'image/webp' });
              setReceiptFile(compressedFile);
            } else {
              setReceiptFile(file);
            }
            setIsCompressing(false);
          }, 'image/webp', 0.85);
        } catch (err) {
          console.error("Compression exception:", err);
          setReceiptFile(file);
          setIsCompressing(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const fetchQueries = async () => {
    setIsLoading(true);
    try {
      // Fetch projects for dropdown
      const { data: projData } = await supabase.from('projects').select('id, name');
      if (projData) setProjects(projData);

      // Fetch Petty Cash entries
      let query = supabase.from('petty_cash')
        .select('*')
        .order('date', { ascending: false });
        
      if (dateRange.start) {
        query = query.gte('date', dateRange.start);
    }
      if (dateRange.end) {
        query = query.lte('date', dateRange.end);
    }
      
      // Limit slightly just in case the date range selected is massive
      query = query.limit(3000);
      
      // If not admin, restrict to own entries or entries this user entered
      if (!isAdmin && user?.id) {
        query = query.or(`raised_by_id.eq.${user.id},entered_by_id.eq.${user.id}`);
    }

      const { data, error } = await query;
      
      if (error) {
        console.error("Fetch error or table doesn't exist yet:", error);
    } else if (data) {
        setEntries(data as PettyCashEntry[]);
    }
  } catch (error) {
      console.error(error);
  } finally {
      setIsLoading(false);
  }
};

  const handleEdit = (entry: PettyCashEntry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.date,
      project_name: entry.project_name || '',
      category: entry.category,
      bill_name: entry.bill_name,
      reason: entry.reason,
      advance_amount: entry.advance_amount ? entry.advance_amount.toString() : '',
      expenditure_amount: entry.expenditure_amount ? entry.expenditure_amount.toString() : '',
      raised_by_id: entry.raised_by_id || ''
  });
    setExistingReceiptUrl(entry.receipt_url || null);
    setReceiptFile(null);
    setShowForm(true);
};

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
};

  const handleSubmit = async (e: React.FormEvent, addAnother = false) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      const adv = parseFloat(form.advance_amount) || 0;
      const exp = parseFloat(form.expenditure_amount) || 0;
      
      let finalReceiptUrl = existingReceiptUrl;
      
      if (receiptFile) {
        // Active validation check: if token is not valid and cannot be silently refreshed, block form submit and notify user
        const activeToken = getStoredMsalToken();
        if (!activeToken) {
          try {
            const freshToken = await getFreshGraphToken();
            if (!freshToken) {
              throw new Error("No token returned");
            }
          } catch (err) {
            console.error("Token validation error prior to submission:", err);
            toast.error("Your Microsoft account connection has expired. Please connect your account first before saving.");
            setMsalReady(false);
            setIsSubmitting(false);
            return;
          }
        }

        let uploadedUrl = "";
        try {
          const filePath = `receipts/${Date.now()}_${receiptFile.name}`;
          const { error: uploadError } = await supabase.storage
            .from("project-backups")
            .upload(filePath, receiptFile, {
              cacheControl: "3600",
              upsert: true,
            });

          if (uploadError) {
            throw uploadError;
          }

          const { data: { publicUrl } } = supabase.storage
            .from("project-backups")
            .getPublicUrl(filePath);

          uploadedUrl = publicUrl;
          toast.success("Receipt image converted to web-optimized WebP (WebPNG) format and saved directly!");
        } catch (supabaseError: any) {
          console.warn("Supabase Storage upload failed, trying Microsoft Graph API fallback:", supabaseError);
          try {
            // Use interactive = false so we NEVER trigger popup block during submission
            const client = await getGraphClient(false);
            const folderPath = `PurvaVedic_PettyCash_Receipts/${user.id}`;
            const encodedFolder = encodeURIComponent('PurvaVedic_PettyCash_Receipts') + '/' + encodeURIComponent(user.id);
            const encodedFile = encodeURIComponent(receiptFile.name);
            
            if (receiptFile.size <= 4 * 1024 * 1024) {
               await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/content`).put(receiptFile);
            } else {
               const uploadSession = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/createUploadSession`).post({
                 item: {
                   "@microsoft.graph.conflictBehavior": "replace",
                   "name": receiptFile.name
                 }
               });
               
               const uploadUrl = uploadSession.uploadUrl;
               const maxChunkSize = 320 * 1024 * 10;
               const size = receiptFile.size;
               let start = 0;
               
               while (start < size) {
                 const end = Math.min(start + maxChunkSize, size);
                 const chunk = receiptFile.slice(start, end);
                 const response = await fetch(uploadUrl, {
                   method: 'PUT',
                   headers: { 'Content-Range': `bytes ${start}-${end - 1}/${size}` },
                   body: chunk
                 });
                 if (!response.ok) throw new Error(`Upload failed at chunk ${start}-${end}`);
                 start = end;
               }
            }
            
            let sharedUrl = '';
            try {
              const permission = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/createLink`).post({
                type: 'view',
                scope: 'organization'
              });
              sharedUrl = permission.link.webUrl;
            } catch (linkError) {
               console.error("Error creating sharing link:", linkError);
               const item = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}`).get();
               sharedUrl = item.webUrl;
            }
            uploadedUrl = sharedUrl;
          } catch (uploadError: any) {
               console.error("OneDrive upload error", uploadError);
               const errMsg = uploadError.message || String(uploadError);
               // If there is an authorization/expiry error, reset the MSAL connection state so the user can re-login
               if (
                 errMsg.toLowerCase().includes('expired') || 
                 errMsg.toLowerCase().includes('auth') || 
                 errMsg.toLowerCase().includes('login') || 
                 errMsg.toLowerCase().includes('lifetime validation') ||
                 errMsg.toLowerCase().includes('authenticated')
               ) {
                 clearMsalSession();
                 setMsalReady(false);
               }
               // Correctly report the Microsoft Graph API/OneDrive upload error instead of the Supabase error
               toast.error(`Upload failed: ${errMsg}`);
               setIsSubmitting(false);
               return;
          }
        }
        finalReceiptUrl = uploadedUrl;
      }

      if (editingId) {
        const updatePayload: any = {
          date: form.date,
          project_name: form.project_name,
          category: form.category,
          bill_name: form.bill_name,
          reason: form.reason,
          advance_amount: adv,
          expenditure_amount: exp
      };
        
        if (form.raised_by_id && form.raised_by_id !== '') {
          const selectedUser = allUsers?.find(u => u.id === form.raised_by_id);
          if (selectedUser) {
            updatePayload.raised_by_id = selectedUser.id;
            updatePayload.raised_by_name = selectedUser.full_name;
        }
      }
        
        if (finalReceiptUrl) updatePayload.receipt_url = finalReceiptUrl;

                const { data, error } = await supabase.from('petty_cash').update(updatePayload).eq('id', editingId).select();
        if (error) throw error;
        
        if (!data || data.length === 0) {
           throw new Error("Missing UPDATE policy on petty_cash table. Admin needs to run: CREATE POLICY \"Enable update for users\" ON petty_cash FOR UPDATE USING (true);");
      }
        
        const updatedEntries = entries.map(e => String(e.id) === editingId ? { ...e, ...updatePayload } : e);
        setEntries(updatedEntries);
        toast.success("Petty Cash entry updated successfully!");
        
        // Add notification for admins/chief_sthapathy for updates
        const expAmt = data[0].expenditure_amount ? `Rs. ${data[0].expenditure_amount}` : '';
        const advAmt = data[0].advance_amount ? `Rs. ${data[0].advance_amount}` : '';
        const amtStr = expAmt ? `Expense: ${expAmt}` : (advAmt ? `Advance: ${advAmt}` : '');
        const notificationTitle = `Updated Petty Cash Entry: ${data[0].bill_name || data[0].category}`;
        const notificationMessage = `Project: ${data[0].project_name || 'N/A'} | ${amtStr} | Reason: ${data[0].reason || 'N/A'} | Paid By: ${data[0].raised_by_name || 'N/A'}`;
        
        await addNotification(
          notificationTitle,
          notificationMessage,
          undefined,
          {
            type: 'petty_cash',
            id: data[0].id,
            project_name: data[0].project_name || 'N/A',
            category: data[0].category,
            bill_name: data[0].bill_name || 'N/A',
            reason: data[0].reason || 'N/A',
            amount: amtStr,
            raised_by_name: data[0].raised_by_name || 'N/A',
            receipt_url: data[0].receipt_url || null,
            date: data[0].date
          }
        );

        setEditingId(null);
        setShowForm(false);
        setForm(emptyForm);
        setReceiptFile(null);
        setExistingReceiptUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
        const newEntry: any = {
          date: form.date,
          project_name: form.project_name,
          category: form.category,
          bill_name: form.bill_name,
          reason: form.reason,
          advance_amount: adv,
          expenditure_amount: exp,
          raised_by_id: user.id,
          raised_by_name: user.full_name,
          entered_by_id: user.id,
          entered_by_name: user.full_name,
      };
        
        if (form.raised_by_id && form.raised_by_id !== '') {
          const selectedUser = allUsers?.find(u => u.id === form.raised_by_id);
          if (selectedUser) {
            newEntry.raised_by_id = selectedUser.id;
            newEntry.raised_by_name = selectedUser.full_name;
        }
      }
        
        if (finalReceiptUrl) newEntry.receipt_url = finalReceiptUrl;

        const { data, error } = await supabase.from('petty_cash').insert(newEntry).select();
        if (error) throw error;

        if (data) {
          setEntries(prev => {
            const exists = prev.find(e => e.id === data[0].id);
            if (exists) return prev;
            return [data[0], ...prev];
          });
          toast.success("Petty Cash entry added successfully!");
          
          // Add notification for admins/chief_sthapathy
          const expAmt = data[0].expenditure_amount ? `Rs. ${data[0].expenditure_amount}` : '';
          const advAmt = data[0].advance_amount ? `Rs. ${data[0].advance_amount}` : '';
          const amtStr = expAmt ? `Expense: ${expAmt}` : (advAmt ? `Advance: ${advAmt}` : '');
          const notificationTitle = `New Petty Cash Entry: ${data[0].bill_name || data[0].category}`;
          const notificationMessage = `Project: ${data[0].project_name || 'N/A'} | ${amtStr} | Reason: ${data[0].reason || 'N/A'} | Paid By: ${data[0].raised_by_name || 'N/A'}`;
          
          await addNotification(
            notificationTitle,
            notificationMessage,
            undefined,
            {
              type: 'petty_cash',
              id: data[0].id,
              project_name: data[0].project_name || 'N/A',
              category: data[0].category,
              bill_name: data[0].bill_name || 'N/A',
              reason: data[0].reason || 'N/A',
              amount: amtStr,
              raised_by_name: data[0].raised_by_name || 'N/A',
              receipt_url: data[0].receipt_url || null,
              date: data[0].date
            }
          );
      }

        if (addAnother) {
          setForm({
            ...form,
            bill_name: '',
            reason: '',
            advance_amount: '',
            expenditure_amount: ''
        });
          setReceiptFile(null);
          setExistingReceiptUrl(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
          setShowForm(false);
          setForm(emptyForm);
          setReceiptFile(null);
          setExistingReceiptUrl(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("Missing UPDATE policy")) {
        toast.error("You don't have permission to update. Ask Admin to add RLS UPDATE policy.");
    } else if (error?.code === 'PGRST204' && error?.message?.includes('receipt_url')) {
        toast.error("Database column 'receipt_url' is missing. Please run the SQL command provided by the AI.");
    } else if (error?.message?.includes("does not exist")) {
        toast.error("Database table 'petty_cash' missing! Contact Admin to run SQL setup.");
    } else {
        toast.error("Failed to save entry.");
    }
  } finally {
      setIsSubmitting(false);
  }
};

  // Sort State
  const [sortField, setSortField] = useState<'date' | 'category' | 'advance' | 'expenditure'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Derived filtered data
  const filteredEntries = useMemo(() => {
    let result = entries.filter(e => {
      const matchCat = filterCategory === 'All' || e.category === filterCategory;
      const matchUser = filterUser === 'All' || e.raised_by_id === filterUser;
      const matchDate = (!dateRange.start || e.date >= dateRange.start) && 
                        (!dateRange.end || e.date <= dateRange.end);
      return matchCat && matchUser && matchDate;
  });

    // Apply Sorting with Number casting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') comparison = a.date.localeCompare(b.date);
      if (sortField === 'category') comparison = a.category.localeCompare(b.category);
      if (sortField === 'advance') comparison = (Number(a.advance_amount) || 0) - (Number(b.advance_amount) || 0);
      if (sortField === 'expenditure') comparison = (Number(a.expenditure_amount) || 0) - (Number(b.expenditure_amount) || 0);
      
      return sortDirection === 'asc' ? comparison : -comparison;
  });

    return result;
}, [entries, filterCategory, filterUser, dateRange, sortField, sortDirection]);

  const handleSort = (field: 'date' | 'category' | 'advance' | 'expenditure') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  } else {
      setSortField(field);
      setSortDirection('desc');
  }
    setCurrentPage(1);
};

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
}, [filterCategory, filterUser, dateRange]);

  // Aggregate for Charts
  const chartDataByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredEntries.forEach(e => {
      map.set(e.category, (map.get(e.category) || 0) + (Number(e.expenditure_amount) || 0));
  });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).filter(i => i.value > 0);
}, [filteredEntries]);

  const chartDataByDate = useMemo(() => {
    const map = new Map<string, {date: string, Advance: number, Expenditure: number}>();
    
    // Sort chronological
    const sorted = [...filteredEntries].sort((a,b) => a.date.localeCompare(b.date));
    
    sorted.forEach(e => {
      const existing = map.get(e.date) || { date: e.date, Advance: 0, Expenditure: 0 };
      existing.Advance += (Number(e.advance_amount) || 0);
      existing.Expenditure += (Number(e.expenditure_amount) || 0);
      map.set(e.date, existing);
  });
    return Array.from(map.values());
}, [filteredEntries]);

  const uniqueUsers = useMemo(() => {
    const users = new Map<string, string>();
    entries.forEach(e => {
      const name = e.raised_by_name || e.raised_by_id || 'Unknown User';
      users.set(e.raised_by_id, name);
  });
    return Array.from(users.entries()).map(([id, name]) => ({id, name}));
}, [entries]);

  // Global totals (Using whole numbers for math precision)
  const globalAdvance = entries.reduce((sum, e) => {
    return sum + Math.round((Number(e.advance_amount) || 0) * 100);
}, 0) / 100;

  const globalExpenditure = entries.reduce((sum, e) => {
    return sum + Math.round((Number(e.expenditure_amount) || 0) * 100);
}, 0) / 100;

  // Filtered totals (Using whole numbers for math precision)
  const totalAdvance = filteredEntries.reduce((sum, e) => {
    return sum + Math.round((Number(e.advance_amount) || 0) * 100);
}, 0) / 100;

  const totalExpenditure = filteredEntries.reduce((sum, e) => {
    return sum + Math.round((Number(e.expenditure_amount) || 0) * 100);
}, 0) / 100;

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);


  const totalReceiptsCount = useMemo(() => filteredEntries.filter(e => e.receipt_url).length, [filteredEntries]);

  return (
    <div className="p-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {/* Iframe detection notice */}
      {typeof window !== 'undefined' && window.self !== window.top && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40 rounded-xl flex items-start gap-3 text-amber-800 dark:text-amber-300 shadow-sm print:hidden">
          <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-lg text-amber-700 dark:text-amber-400 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-xs sm:text-sm">
            <span className="font-bold">Iframe Preview Mode:</span> Microsoft Auth (MSAL.js) popups or silent login sessions will fail or time out inside an iframe due to standard browser security policies. To load SharePoint/OneDrive receipt photos and generate complete PDFs with all images, please click <strong className="text-amber-900 dark:text-amber-200">"Open in new window"</strong> (the diagonal arrow icon) in the top-right corner of the screen.
          </div>
        </div>
      )}
      <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Petty Cash Tracking</h1>
          <p className="text-slate-500 dark:text-zinc-400 mt-1">Manage expenditures and advances</p>
        </div>
        <div className="flex items-center gap-3 mt-4 sm:mt-0 print:hidden">
          
          
          <Button 
            onClick={handleExport} 
            disabled={isExporting || filteredEntries.length === 0}
            variant="outline" 
            className="font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
          >
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Export for PDF
          </Button>
          
          {(canCreate || showForm) && (
            <Button onClick={() => {
              if (showForm) {
                setShowForm(false);
                setEditingId(null);
                setForm(emptyForm);
            } else {
                setShowForm(true);
            }
          }} className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20">
              {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {showForm ? 'Cancel Form' : 'New Entry'}
            </Button>
          )}
        </div>
      </div>

      {showForm ? (
        <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 text-slate-900 dark:text-white border-b border-slate-100 dark:border-white/5 pb-4">
            {editingId ? 'Edit Petty Cash Entry' : 'Add Petty Cash Entry'}
          </h2>
          <form className="space-y-6" onSubmit={(e) => handleSubmit(e, false)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Date <span className="text-red-500">*</span></label>
                <input 
                  type="date" 
                  name="date"
                  required
                  value={form.date}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Category <span className="text-red-500">*</span></label>
                <select 
                  name="category"
                  required
                  value={form.category}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white h-10"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Paid By (Expense Owner)</label>
                  <select 
                    name="raised_by_id"
                    value={form.raised_by_id || user?.id || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white h-10"
                  >
                    <option value="" disabled>Select User</option>
                    {allUsers?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Project Name</label>
                <select 
                  name="project_name"
                  value={form.project_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white h-10"
                >
                  <option value="">Select Project...</option>
                  {projects.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Name of Bill <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  name="bill_name"
                  required
                  value={form.bill_name}
                  onChange={handleInputChange}
                  placeholder="e.g. Hardware supplies, Taxi fare..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Reason <span className="text-red-500">*</span></label>
                <textarea 
                  name="reason"
                  required
                  value={form.reason}
                  onChange={handleInputChange}
                  placeholder="Additional details behind this transaction..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Advance Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-[10px] text-slate-500 font-bold">₹</span>
                  <input 
                    type="number" 
                    name="advance_amount"
                    min="0"
                    step="0.01"
                    value={form.advance_amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Expenditure Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-[10px] text-slate-500 font-bold">₹</span>
                  <input 
                    type="number" 
                    name="expenditure_amount"
                    min="0"
                    step="0.01"
                    value={form.expenditure_amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 dark:text-white"
                  />
                </div>
              </div>

            </div>

            <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
              <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Receipt Image (Microsoft OneDrive)</label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {!msalReady ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
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
                        const data = event.data;
                        const isSuccess = data === 'msal_login_success' || (data && data.type === 'msal_login_success');
                        if (isSuccess) {
                          window.removeEventListener('message', receiveMessage);
                          clearInterval(pollInterval);
                          
                          if (data && data.type === 'msal_login_success' && data.token) {
                            saveMsalSession(data.account, data.token, data.expiresOn);
                            if (data.account) {
                              instance.setActiveAccount(data.account);
                            }
                          } else {
                            try {
                              const pca = new PublicClientApplication(msalConfig);
                              await pca.initialize();
                              const allAccounts = pca.getAllAccounts();
                              if (allAccounts.length > 0) {
                                instance.setActiveAccount(allAccounts[0]);
                              } else {
                                const stored = getStoredMsalAccount() || getMSALAccountFromStorage();
                                if (stored) {
                                  instance.setActiveAccount(stored as any);
                                }
                              }
                            } catch (err) {
                              console.warn("Error initializing fresh MSAL in popup message handler:", err);
                            }
                          }
                          setMsalReady(true);
                          toast.success("Successfully logged in to Microsoft");
                        }
                      };
                      window.addEventListener('message', receiveMessage);
                      
                      // Fallback interval just in case postMessage fails
                      let attempts = 0;
                      const pollInterval = setInterval(async () => {
                        attempts++;
                        if (attempts > 180) { // Stop after 3 mins
                          clearInterval(pollInterval);
                          return;
                        }

                        try {
                          const validToken = getStoredMsalToken();
                          if (validToken) {
                            clearInterval(pollInterval);
                            window.removeEventListener('message', receiveMessage);
                            const storedAcc = getStoredMsalAccount();
                            if (storedAcc) {
                              instance.setActiveAccount(storedAcc as any);
                            }
                            setMsalReady(true);
                            toast.success("Successfully logged in to Microsoft");
                            return;
                          }

                          const pca = new PublicClientApplication(msalConfig);
                          await pca.initialize();
                          const allAccounts = pca.getAllAccounts();
                          if (allAccounts.length > 0) {
                            clearInterval(pollInterval);
                            window.removeEventListener('message', receiveMessage);
                            instance.setActiveAccount(allAccounts[0]);
                            setMsalReady(true);
                            toast.success("Successfully logged in to Microsoft");
                          } else {
                            const stored = getStoredMsalAccount() || getMSALAccountFromStorage();
                            if (stored) {
                              clearInterval(pollInterval);
                              window.removeEventListener('message', receiveMessage);
                              instance.setActiveAccount(stored as any);
                              setMsalReady(true);
                              toast.success("Successfully logged in to Microsoft");
                            }
                          }
                        } catch (err) {
                          // Just ignore errors during polling
                        }
                      }, 1500);
                  }}
                    className="border-[#0078D4] text-[#0078D4] hover:bg-[#0078D4]/5 dark:border-[#0078D4] dark:hover:bg-[#0078D4]/20"
                  >
                    Connect Microsoft Account
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex items-center gap-3">
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        accept="image/*" 
                        onChange={handleFileUpload}
                        className="hidden" 
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="border-slate-200 dark:border-white/10"
                      >
                        Choose File
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={handleMicrosoftLogout}
                        className="text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 h-9 px-3"
                      >
                        Disconnect Account
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                       {isCompressing ? (
                         <span className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Compressing...</span>
                       ) : receiptFile ? (
                         <span className="text-sm text-emerald-600 font-medium break-all">Ready: {receiptFile.name} ({(receiptFile.size / 1024).toFixed(1)} KB)</span>
                       ) : existingReceiptUrl ? (
                         <a href={existingReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline">View Existing Receipt</a>
                       ) : (
                         <span className="text-sm text-slate-500">No file chosen.</span>
                       )}
                    </div>
                  </div>
                )}
              </div>

              {/* Manual URL / Embed Code input hidden */}
            </div>
            
            <div className="pt-4 flex flex-col sm:flex-row sm:justify-end gap-3 border-t border-slate-100 dark:border-white/5 mt-6">
              {!editingId && (
                <Button 
                  type="button" 
                  variant="outline" 
                  disabled={isSubmitting}
                  className="font-bold"
                  onClick={(e) => handleSubmit(e, true)}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save & Add Another
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-700 font-bold text-white shadow-lg shadow-indigo-600/20"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editingId ? 'Update Entry' : 'Save Entry'}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Dashboard Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-[#121212] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-zinc-400 mb-1">Total Expenditure</p>
                <h3 className="text-2xl font-black text-rose-600 dark:text-rose-500 font-mono">
                  ₹{globalExpenditure.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h3>
                {globalExpenditure !== totalExpenditure && (
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
                    Filtered: ₹{totalExpenditure.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center">
                <ArrowDown className="w-6 h-6 text-rose-600" />
              </div>
            </div>
            <div className="bg-white dark:bg-[#121212] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-zinc-400 mb-1">Total Advances</p>
                <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-500 font-mono">
                  ₹{globalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h3>
                {globalAdvance !== totalAdvance && (
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
                    Filtered: ₹{totalAdvance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center">
                <ArrowUp className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
            <div className="bg-white dark:bg-[#121212] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-zinc-400 mb-1">Net Balance</p>
                <h3 className={`text-2xl font-black font-mono ${globalAdvance - globalExpenditure >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ₹{(globalAdvance - globalExpenditure).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h3>
                {(globalAdvance - globalExpenditure) !== (totalAdvance - totalExpenditure) && (
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">
                    Filtered: ₹{(totalAdvance - totalExpenditure).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-full flex items-center justify-center">
                <Filter className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sidebar / Filters */}
            <div className="col-span-1 space-y-6">
              
              <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center text-slate-800 dark:text-white">
                    <Filter className="w-4 h-4 mr-2 text-indigo-500" /> Filters
                  </h3>
                  {(filterCategory !== 'All' || filterUser !== 'All' || dateRange.start) && (
                    <button 
                      onClick={() => {
                        setFilterCategory('All');
                        setFilterUser('All');
                        setDateRange({start:'', end:''});
                    }}
                      className="text-xs font-bold text-rose-500 hover:text-rose-600 uppercase tracking-wider"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Category</label>
                    <select 
                      value={filterCategory}
                      onChange={e => setFilterCategory(e.target.value)}
                      className="w-full text-sm border-slate-300 border dark:border-white/10 rounded-md p-2 bg-slate-50 dark:bg-black text-slate-800 dark:text-zinc-200 outline-none"
                    >
                      <option value="All">All Categories</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center">
                         User
                      </label>
                      <select 
                        value={filterUser}
                        onChange={e => setFilterUser(e.target.value)}
                        className="w-full text-sm border-slate-300 border dark:border-white/10 rounded-md p-2 bg-slate-50 dark:bg-black text-slate-800 dark:text-zinc-200 outline-none"
                      >
                        <option value="All">All Employees</option>
                        {uniqueUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>

                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center">
                       Date Range
                    </label>
                    <div className="grid grid-cols-1 2xl:grid-cols-[1fr,auto,1fr] items-center gap-2 w-full">
                      <input 
                        type="date" 
                        value={dateRange.start}
                        onChange={e => setDateRange({...dateRange, start: e.target.value})}
                        className="w-full text-sm border-slate-300 border dark:border-white/10 rounded-md p-2 bg-slate-50 dark:bg-black text-slate-800 dark:text-zinc-200 outline-none"
                      />
                      <span className="text-slate-400 hidden 2xl:block text-center text-xs uppercase font-bold">to</span>
                      <input 
                        type="date" 
                        value={dateRange.end}
                        onChange={e => setDateRange({...dateRange, end: e.target.value})}
                        className="w-full text-sm border-slate-300 border dark:border-white/10 rounded-md p-2 bg-slate-50 dark:bg-black text-slate-800 dark:text-zinc-200 outline-none"
                      />
                    </div>
                    {(dateRange.start || dateRange.end) && (
                      <button 
                        onClick={() => setDateRange({start:'', end:''})}
                        className="text-xs text-indigo-500 font-medium mt-1 hover:underline w-full text-right"
                      >
                        Clear Dates
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {chartDataByCategory.length > 0 && (
                <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800 dark:text-white">
                    Splits by Category
                  </h3>
                  {/* UPDATED: Added min-w-0 and explicit height to ResponsiveContainer */}
                  <div className="h-[240px] min-w-0">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={chartDataByCategory}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          onClick={(data) => {
                            if (data && data.name) {
                              setFilterCategory(data.name === filterCategory ? 'All' : data.name);
                          }
                        }}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {chartDataByCategory.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => `₹${val}`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>

            {/* Main Content Area */}
            <div className="col-span-1 lg:col-span-2 space-y-6 min-w-0">

              {/* Transactions Table */}
              <div className="bg-white dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#181818] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-slate-800 dark:text-white">Transaction Logs</h3>
                    
                    {/* Active Filters Display */}
                    <div className="hidden sm:flex items-center gap-2">
                      {filterCategory !== 'All' && (
                        <div className="flex items-center text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-500/30">
                          {filterCategory}
                          <button onClick={() => setFilterCategory('All')} className="ml-1 hover:text-indigo-900 dark:hover:text-indigo-100">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      
                      {dateRange.start && (
                        <div className="flex items-center text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                          {dateRange.start} {dateRange.start === dateRange.end ? '' : ` to ${dateRange.end || '...'}`}
                          <button onClick={() => setDateRange({start: '', end: ''})} className="ml-1 hover:text-emerald-900 dark:hover:text-emerald-100">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-bold bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-zinc-400 px-2.5 py-1 rounded-full">
                    {filteredEntries.length} entries
                  </span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-black/50 text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 border-b border-slate-200 dark:border-white/5">
                        <th 
                          className="p-4 font-semibold whitespace-nowrap cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors"
                          onClick={() => handleSort('date')}
                        >
                          Date {sortField === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="p-4 font-semibold">Bill / Reason</th>
                        <th 
                          className="p-4 font-semibold cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors"
                          onClick={() => handleSort('category')}
                        >
                          Category {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="p-4 font-semibold text-right cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors"
                          onClick={() => handleSort('advance')}
                        >
                          Advance {sortField === 'advance' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th 
                          className="p-4 font-semibold text-right cursor-pointer hover:text-slate-800 dark:hover:text-white transition-colors"
                          onClick={() => handleSort('expenditure')}
                        >
                          Expenditure {sortField === 'expenditure' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="p-4 font-semibold text-right w-[60px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {paginatedEntries.length > 0 ? paginatedEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4 text-sm text-slate-600 dark:text-zinc-400 whitespace-nowrap align-top">
                            <div className="font-semibold text-slate-800 dark:text-zinc-200">{e.date}</div>
                            {e.created_at && (
                              <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium mt-0.5" title={new Date(e.created_at).toLocaleString()}>
                                Created: {new Date(e.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </div>
                            )}
                            {e.raised_by_name && (
                              <div className="mt-1 text-xs opacity-70 flex items-center text-indigo-600 dark:text-indigo-400 font-medium">
                                <UserIcon className="w-3 h-3 mr-1" />
                                {e.raised_by_name?.split(' ')[0]}
                              </div>
                            )}
                          </td>
                          <td className="p-4 align-top">
                            <div className="flex flex-col gap-1.5">
                              <p className="text-sm font-bold text-slate-800 dark:text-white line-clamp-1">{e.bill_name}</p>
                              {e.receipt_url && (
                                <a 
                                  href={e.receipt_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="inline-flex items-center gap-1.5 w-fit text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group"
                                  title="View Receipt Document"
                                >
                                  <Paperclip className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                                  <span className="underline decoration-slate-300 dark:decoration-slate-700 underline-offset-2 group-hover:decoration-indigo-300 dark:group-hover:decoration-indigo-700">Receipt Attachment</span>
                                  <ExternalLink className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all text-indigo-500" />
                                </a>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2 line-clamp-2 leading-relaxed">{e.reason}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {e.project_name && (
                                <span className="inline-flex text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                                  {e.project_name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 align-top">
                            <span className="inline-flex text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10">
                              {e.category}
                            </span>
                          </td>
                          <td className="p-4 align-top text-right text-sm">
                            {e.advance_amount > 0 ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                                ₹{Number(e.advance_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-4 align-top text-right text-sm">
                            {e.expenditure_amount > 0 ? (
                              <span className="text-rose-600 dark:text-rose-400 font-mono font-bold">
                                ₹{Number(e.expenditure_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-4 align-top text-right w-[60px]">
                            {(isAdmin || e.raised_by_id === user?.id || e.entered_by_id === user?.id) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(e)}
                                className="h-8 w-8 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-sm text-slate-500">
                            {isLoading ? 'Loading records...' : 'No petty cash records found matching your filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#181818]">
                    <span className="text-xs text-slate-500 font-medium">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredEntries.length)} of {filteredEntries.length} entries
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="h-8 text-xs font-bold"
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="h-8 text-xs font-bold"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Trend Chart */}
              {chartDataByDate.length > 0 && (
                <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-lg font-bold mb-6 text-slate-800 dark:text-white">Expenditure & Advance Trends</h3>
                  {/* UPDATED: Added min-w-0 and explicit height to ResponsiveContainer */}
                  <div className="h-[300px] min-w-0">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart 
                        data={chartDataByDate} 
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        onClick={(state) => {
                          if (state && state.activeLabel) {
                            setDateRange(prev => {
                              if (prev.start === state.activeLabel && prev.end === state.activeLabel) {
                                return { start: '', end: '' }; // toggle off
                            }
                              return { start: state.activeLabel as string, end: state.activeLabel as string }; // filter to specific date
                          });
                        }
                      }}
                        className="cursor-pointer"
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12, fill: '#888' }} 
                          tickFormatter={(val) => val.split('-').slice(1).join('/')}
                          axisLine={false}
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#888' }} 
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(val) => `₹${val/1000}k`}
                        />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff', borderRadius: '8px' }}
                          formatter={(val: number) => `₹${val}`}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Bar dataKey="Advance" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="Expenditure" fill="#e11d48" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      </div>
      {/* Print View */}
          </div>
  );
}
