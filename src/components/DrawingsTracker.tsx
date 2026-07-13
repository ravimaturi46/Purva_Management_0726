import React, { useState, useEffect, useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { loginRequest } from '../lib/msalConfig';
import { Client } from '@microsoft/microsoft-graph-client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { FileIcon, Download, Upload, Loader2, FolderOpen, Image as ImageIcon, FileText, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useFileSettings } from '../contexts/FileSettingsContext';
import { canDownloadDrawings } from '../types';
import { uploadToAutodeskCloud } from '../lib/autodesk';

interface DrawingsTrackerProps {
  projectId: string;
  projectName: string;
  projectFiles?: any[];
  onFileUploaded?: () => void;
}

export const DrawingsTracker: React.FC<DrawingsTrackerProps> = ({ 
  projectId, 
  projectName,
  projectFiles = [],
  onFileUploaded
}) => {
  const { instance, accounts, inProgress } = useMsal();
  const [msalReady, setMsalReady] = useState(() => instance.getAllAccounts().length > 0);
  const isAuthenticated = useIsAuthenticated() || msalReady;
  const { user, allUsers } = useUser();
  const { canViewFile, canDownloadFile } = useFileSettings();
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<{name: string, url: string, isMicrosoft?: boolean, originalUrl?: string, originalFileObj?: any} | null>(null);

  const getPreviewUrl = (url: string) => {
    if (url.includes('sharepoint.com') || url.includes('onedrive.live.com')) {
      return url + (url.includes('?') ? '&' : '?') + 'action=embedview';
    }
    return url;
  };

  const getGraphClient = useCallback(async () => {
    const activeAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (!activeAccount) throw new Error("No accounts found");
    
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

  const handleViewFile = async (file: any) => {
    // If it's a microsoft file, we need to bypass iframe restrictions by fetching the raw BLOB
    if (file.url.includes('sharepoint.com') || file.url.includes('onedrive.live.com')) {
      if (!isAuthenticated) {
        toast.info("Please sign in to Microsoft first to view this file.");
        handleLogin();
        return;
      }
      setIsPreviewLoading(file.id);
      try {
        const client = await getGraphClient();
        
        // Convert webUrl to Graph API encoded share URL
        const base64 = btoa(file.url);
        const encodedUrl = 'u!' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        
        // Fetch raw file as blob through the Graph API content endpoint
        const blob = await client.api(`/shares/${encodedUrl}/driveItem/content`).responseType('blob').get();
        const blobUrl = URL.createObjectURL(blob);
        
        setPreviewFile({ name: file.name, url: blobUrl, isMicrosoft: true, originalUrl: file.url, originalFileObj: file });
      } catch (graphError) {
        console.error("Failed to fetch graph blob, falling back to viewer", graphError);
        setPreviewFile({ name: file.name, url: getPreviewUrl(file.url), isMicrosoft: true, originalUrl: file.url, originalFileObj: file });
      } finally {
        setIsPreviewLoading(null);
      }
    } else {
      setPreviewFile({ name: file.name, url: getPreviewUrl(file.url), isMicrosoft: false, originalUrl: file.url, originalFileObj: file });
    }
  };

  const handleNativeDownload = async (file: any) => {
    if (file.url.includes('sharepoint.com') || file.url.includes('onedrive.live.com')) {
      if (!isAuthenticated) {
        toast.info("Please sign in to Microsoft first to download this file.");
        handleLogin();
        return;
      }
    }
    setIsPreviewLoading(file.id);
    try {
      if (file.url.includes('sharepoint.com') || file.url.includes('onedrive.live.com')) {
        try {
          const client = await getGraphClient();
          const base64 = btoa(file.url);
          const encodedUrl = 'u!' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          
          const blob = await client.api(`/shares/${encodedUrl}/driveItem/content`).responseType('blob').get();
          const blobUrl = URL.createObjectURL(blob);
          
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        } catch (authError) {
          console.warn("Not authenticated to download via Graph API, falling back to browser download:", authError);
          const a = document.createElement('a');
          a.href = file.url;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        const a = document.createElement('a');
        a.href = file.url;
        a.download = file.name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download file natively:", error);
      toast.error("An error occurred while trying to download the file.");
    } finally {
      setIsPreviewLoading(null);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleLogin = async () => {
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
    
    // Fallback interval just in case postMessage fails
    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      if (attempts > 180) { // Stop after 3 mins
        clearInterval(pollInterval);
        return;
      }

      try {
        if (instance.getAllAccounts().length > 0) {
          clearInterval(pollInterval);
          window.removeEventListener('message', receiveMessage);
          setMsalReady(true);
        }
      } catch (err) {
        // Just ignore errors during polling
      }
    }, 1500);
  };

  const convertToWebP = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/') || file.type === 'image/webp') {
        resolve(file);
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file); // fallback
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
              const webpFile = new File([blob], newName, { type: 'image/webp' });
              resolve(webpFile);
            } else {
              resolve(file); // fallback
            }
          }, 'image/webp', 0.85); // 85% quality
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = event.target.files?.[0];
    if (!originalFile) return;

    setIsUploading(true);
    try {
      let file = originalFile;
      if (file.type.startsWith('image/') && file.type !== 'image/webp') {
        file = await convertToWebP(file);
      }

      const client = await getGraphClient();
      const folderName = projectName.replace(/[^a-zA-Z0-9 -]/g, '').trim();
      const encodedFolder = encodeURIComponent('PurvaVedic_Projects') + '/' + encodeURIComponent(folderName);
      const encodedFile = encodeURIComponent(file.name);
      const folderPath = `PurvaVedic_Projects/${folderName}`;

      if (file.size <= 4 * 1024 * 1024) {
        // Simple upload for small files (<= 4MB)
        await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/content`)
          .put(file);
      } else {
        // Large file upload session for files > 4MB (like large DWG files)
        const uploadSession = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/createUploadSession`).post({
          item: {
            "@microsoft.graph.conflictBehavior": "replace",
            "name": file.name
          }
        });

        const uploadUrl = uploadSession.uploadUrl;
        const maxChunkSize = 320 * 1024 * 10; // 3.2 MB chunks (must be a multiple of 320 KiB)
        const size = file.size;
        let start = 0;

        while (start < size) {
          const end = Math.min(start + maxChunkSize, size);
          const chunk = file.slice(start, end);
          
          const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Range': `bytes ${start}-${end - 1}/${size}`
            },
            body: chunk
          });

          if (!response.ok) {
            throw new Error(`Upload failed at chunk ${start}-${end}`);
          }
          
          start = end;
        }
      }
      
      const fileNameLower = file.name.toLowerCase();
      if (fileNameLower.endsWith('.dwg') || fileNameLower.endsWith('.stl') || fileNameLower.endsWith('.rvt')) {
        await uploadToAutodeskCloud(file, folderPath, projectId);
      }

      // Create an organization-wide sharing link so anyone in the company can view it
      let sharedUrl = '';
      try {
        const permission = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}:/createLink`).post({
          type: 'view',
          scope: 'organization'
        });
        sharedUrl = permission.link.webUrl;
      } catch (linkError) {
        console.error("Error creating sharing link:", linkError);
        // Fallback to default webUrl if sharing link creation fails (e.g., admin disabled it)
        const item = await client.api(`/me/drive/root:/${encodedFolder}/${encodedFile}`).get();
        sharedUrl = item.webUrl;
      }

      // Automatically add this file to the project's central "Files" tab
      if (user && sharedUrl) {
        await supabase.from('project_files').insert({
          project_id: projectId,
          name: file.name,
          url: sharedUrl,
          description: 'Uploaded via OneDrive Integration',
          uploaded_by: user.id
        });
      }
      
      toast.success("File uploaded and shared successfully");
      if (onFileUploaded) onFileUploaded(); // Refresh the list
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload file");
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = ''; // Reset input
      }
    }
  };

  const getFileIcon = (mimeType?: string, name?: string) => {
    if (!name) return <FileIcon className="w-8 h-8 text-slate-400" />;
    if (name.toLowerCase().endsWith('.dwg')) return <FileIcon className="w-8 h-8 text-blue-600" />;
    if (mimeType?.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-emerald-500" />;
    if (mimeType === 'application/pdf') return <FileText className="w-8 h-8 text-red-500" />;
    return <FileIcon className="w-8 h-8 text-slate-400" />;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100">Project Files</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400">Manage project drawings and documents</p>
        </div>
        <div className="relative">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleFileUpload}
            disabled={isUploading || !isAuthenticated}
          />
          <Button 
            disabled={isUploading || !isAuthenticated} 
            onClick={() => {
              document.getElementById('file-upload')?.click();
            }}
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload File
          </Button>
        </div>
      </div>

      {!isAuthenticated && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center text-blue-800 dark:text-blue-300">
            <Loader2 className="w-5 h-5 mr-3 hidden" />
            <div>
              <p className="font-bold text-sm">Authentication Required</p>
              <p className="text-xs opacity-90">Please sign in with your Microsoft account to view and download secure project files.</p>
            </div>
          </div>
          <Button onClick={handleLogin} disabled={inProgress !== "none"} className="bg-[#0078D4] hover:bg-[#006CBF] text-white whitespace-nowrap ml-4">
            {inProgress !== "none" ? "Connecting..." : "Sign in with Microsoft"}
          </Button>
        </div>
      )}

      {projectFiles.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#121212]">
          <FileIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">No files uploaded yet</p>
          <p className="text-xs text-slate-500 mt-1">Upload DWG, PDF, or image files to get started.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-white/10 text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-bold">
                  <th className="p-4 rounded-tl-2xl">File Name</th>
                  <th className="p-4">Uploaded By</th>
                  <th className="p-4">Date Uploaded</th>
                  <th className="p-4 text-right rounded-tr-2xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {projectFiles.map((file) => {
                  const uploader = allUsers.find(u => u.id === file.uploaded_by);
                  const uploaderName = uploader?.full_name || 'Unknown User';
                  
                  return (
                  <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-[#181818] transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-[#0a0a0a] flex items-center justify-center shrink-0 border border-slate-100 dark:border-white/10">
                          {getFileIcon(undefined, file.name)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900 dark:text-zinc-100 line-clamp-1" title={file.name}>
                            {file.name}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-zinc-500 uppercase tracking-wider mt-0.5">
                            {file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                          {uploaderName.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                          {uploaderName}
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-zinc-400">
                      {formatDate(file.created_at)}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(() => {
                            const canView = canViewFile(user?.role, file.name, file.uploaded_by, user?.id);
                            const canDownload = canDownloadFile(user?.role, file.name, file.uploaded_by, user?.id);
                            
                            return (
                                <>
                                    {canView && (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        disabled={isPreviewLoading === file.id}
                                        className="h-8 text-xs font-bold"
                                        onClick={() => handleViewFile(file)}
                                      >
                                        {isPreviewLoading === file.id ? (
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        ) : (
                                          <Eye className="w-3 h-3 mr-1" />
                                        )}
                                        View
                                      </Button>
                                    )}
                                    
                                    {canDownload ? (
                                      <Button 
                                        variant="default" 
                                        size="sm" 
                                        className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700"
                                        onClick={() => handleNativeDownload(file)}
                                      >
                                        {isPreviewLoading === file.id ? (
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                        ) : (
                                          <Download className="w-3 h-3 mr-1" />
                                        )}
                                        Download
                                      </Button>
                                    ) : (
                                      <span className="text-xs text-slate-400 dark:text-zinc-500 italic ml-2">Secure File</span>
                                    )}
                                </>
                            );
                        })()}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* File Preview Dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl w-full h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-950 border-slate-800">
          <DialogHeader className="p-4 border-b border-white/10 shrink-0 flex flex-row items-center justify-between">
            <DialogTitle className="text-white text-lg font-bold flex items-center">
              <Eye className="w-5 h-5 mr-2 text-indigo-400" />
              {previewFile?.name || 'File Preview'}
            </DialogTitle>
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-slate-400 hover:text-white hover:bg-white/10 h-8 w-8 rounded-full"
              onClick={() => setPreviewFile(null)}
            >
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>
          <div className="flex-1 w-full flex flex-col bg-[#0a0a0a] relative items-center justify-center">
            {previewFile && (
              <>
                <div className="absolute top-4 right-6 z-10 flex gap-2">
                  {(() => {
                    if (!previewFile.originalFileObj) return null;
                    const file = previewFile.originalFileObj;
                    const canDownload = canDownloadFile(user?.role, file.name, file.uploaded_by, user?.id);
                    
                    if (!canDownload) return <span className="bg-black/50 text-white backdrop-blur-md px-3 py-1.5 rounded-md text-sm font-bold border border-white/20">Secure File (View Only)</span>;
                    
                    return (
                      <Button 
                        variant="outline" 
                        className="bg-black/50 hover:bg-black/80 text-white border-white/20 backdrop-blur-md"
                        onClick={() => handleNativeDownload(previewFile)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Secure Download
                      </Button>
                    );
                  })()}
                </div>

                {/* If it's a Microsoft file but we failed to fetch the blob, it will be caught here and show the secure message */}
                {(previewFile.isMicrosoft && (previewFile.url.includes('sharepoint.com') || previewFile.url.includes('onedrive.live.com'))) ? (
                  <div className="flex flex-col items-center justify-center w-full h-full p-8 text-center bg-[#121212]">
                    <div className="w-20 h-20 bg-[#0078D4]/10 rounded-full flex items-center justify-center mb-6 border border-[#0078D4]/20">
                      <FileIcon className="w-10 h-10 text-[#0078D4]" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Secure Microsoft Document</h3>
                    <p className="text-slate-400 max-w-md mb-8 text-sm leading-relaxed">
                      This file is securely hosted in your organization's Microsoft 365 environment. Microsoft's security policies prevent authenticated documents from being embedded.
                    </p>
                    {(() => {
                      if (!previewFile.originalFileObj) return null;
                      const file = previewFile.originalFileObj;
                      const canDownload = canDownloadFile(user?.role, file.name, file.uploaded_by, user?.id);
                      
                      if (!canDownload) return <span className="text-slate-400 font-bold border border-slate-700 px-4 py-2 rounded-xl">View Only (Download Protected)</span>;
                      return (
                        <Button 
                          size="lg"
                          className="bg-[#0078D4] hover:bg-[#006CBF] text-white rounded-xl shadow-lg shadow-[#0078D4]/20"
                          onClick={() => handleNativeDownload(previewFile)}
                        >
                          <Download className="w-4 h-4 mr-2" /> Download Directly
                        </Button>
                      );
                    })()}
                  </div>
                ) : previewFile.name.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/i) ? (
                  <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-full object-contain p-4" />
                ) : previewFile.name.match(/\.(pdf)$/i) ? (
                  <embed 
                    src={previewFile.url} 
                    type="application/pdf" 
                    className="absolute inset-0 w-full h-full border-0 bg-white" 
                  />
                ) : (
                  <iframe 
                    src={previewFile.url} 
                    className="absolute inset-0 w-full h-full border-0 bg-white"
                    allowFullScreen
                    title="File Preview"
                  />
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
