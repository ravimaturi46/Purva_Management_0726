import { useState, useEffect } from 'react';
import { UserProvider, useUser } from './contexts/UserContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { GlobalKanban } from './components/GlobalKanban';
import { GlobalCalendar } from './components/GlobalCalendar';
import { ProjectList } from './components/ProjectList';
import { TeamManagement } from './components/TeamManagement';
import { Profile } from './components/Profile';
import { VendorManagement } from './components/VendorManagement';
import { PettyCash } from './components/PettyCash';
import { LeaveManagement } from './components/LeaveManagement';
import { BankStatements } from './components/BankStatements';
import { Login } from './components/Login';
import { UpdatePassword } from './components/UpdatePassword';
import { FileControls } from './components/FileControls';
import { Toaster } from './components/ui/sonner';
import { Sheet, SheetContent } from './components/ui/sheet';
import { ProjectDetails } from './components/ProjectDetails';
import { AssetManagement } from './components/AssetManagement';
import { TimeTracking } from './components/TimeTracking';
import { Project } from './types';
import { cn } from './lib/utils';
import { ThemeProvider } from './contexts/ThemeContext';
import { FileSettingsProvider } from './contexts/FileSettingsContext';
import { msalInstance, loginRequest } from './lib/msalConfig';
import { supabase } from './lib/supabase';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [projectDetailsTab, setProjectDetailsTab] = useState('activity');

  const { user, loading, recoveryMode } = useUser();

  const handleProjectClick = (project: Project, tab?: string) => {
    setSelectedProject(project);
    setProjectDetailsTab(tab || 'activity');
    setIsDetailsOpen(true);
    setIsMaximized(false);
  };

  // Handle interactive notification click events globally
  useEffect(() => {
    const handleNotificationClick = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const parsed = customEvent.detail;
      if (!parsed || !parsed.metadata) return;

      const { type, id } = parsed.metadata;
      if (type === 'project' && id) {
        try {
          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

          if (data && !error) {
            handleProjectClick(data as Project);
          } else {
            // Fallback to project tab
            setActiveTab('projects');
          }
        } catch (err) {
          console.error('Error loading project from notification click:', err);
          setActiveTab('projects');
        }
      } else if (type === 'leave') {
        setActiveTab('leaves');
      } else if (type === 'petty_cash') {
        setActiveTab('petty_cash');
      }
    };

    window.addEventListener('app-notification-click', handleNotificationClick);
    return () => {
      window.removeEventListener('app-notification-click', handleNotificationClick);
    };
  }, []);

  // Handle the special popup redirect flow
  useEffect(() => {
    if (window.location.search.includes('auth_action=login')) {
      if (msalInstance.getAllAccounts().length > 0) {
        // We already have an account logged in! Close the popup.
        const account = msalInstance.getAllAccounts()[0];
        msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: account
        }).then(response => {
          if (window.opener && window.opener !== window) {
            window.opener.postMessage({
              type: 'msal_login_success',
              account: account,
              token: response.accessToken,
              expiresOn: response.expiresOn ? response.expiresOn.getTime() : null
            }, '*');
            window.close();
          }
        }).catch(() => {
          if (window.opener && window.opener !== window) {
            window.opener.postMessage({
              type: 'msal_login_success',
              account: account
            }, '*');
            window.close();
          }
        });
      } else {
        // Set this session storage flag so when MSAL redirects back, we know this tab is just a popup
        sessionStorage.setItem('is_msal_popup', 'true');
        // Only trigger login if no accounts are present
        msalInstance.loginRedirect({
          ...loginRequest,
          prompt: 'select_account'
        });
      }
    }
  }, []);

  const isOAuthCallback = window.location.search.includes('code=') || window.location.hash.includes('code=');
  const isAuthAction = window.location.search.includes('auth_action=login');
  const isPopupAuth = sessionStorage.getItem('is_msal_popup') === 'true' || isOAuthCallback || isAuthAction;

  useEffect(() => {
    if (isPopupAuth) {
      const checkInterval = setInterval(() => {
        if (msalInstance.getAllAccounts().length > 0) {
          clearInterval(checkInterval);
          sessionStorage.removeItem('is_msal_popup');
          const account = msalInstance.getAllAccounts()[0];
          msalInstance.acquireTokenSilent({
            ...loginRequest,
            account: account
          }).then(response => {
            if (window.opener && window.opener !== window) {
              window.opener.postMessage({
                type: 'msal_login_success',
                account: account,
                token: response.accessToken,
                expiresOn: response.expiresOn ? response.expiresOn.getTime() : null
              }, '*');
            }
            window.close();
          }).catch(err => {
            console.error("Failed silent token in popup:", err);
            if (window.opener && window.opener !== window) {
              window.opener.postMessage({
                type: 'msal_login_success',
                account: account
              }, '*');
            }
            window.close();
          });
        }
      }, 500);

      // Fallback: close after some time to avoid hanging process (5 minutes)
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        sessionStorage.removeItem('is_msal_popup');
        window.close();
      }, 300000);

      return () => {
        clearInterval(checkInterval);
        clearTimeout(timeout);
      };
    }
  }, [isPopupAuth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFFFF0] dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  // If this window is a popup or OAuth callback, don't render the main app.
  // Just show a loading state while MSAL/Supabase processes the authentication.
  if (isPopupAuth) {
    return (
      <div className="min-h-screen bg-[#FFFFF0] dark:bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Completing authentication...</p>
        <p className="text-slate-400 text-sm mt-2">This window should close automatically.</p>
        <button 
          onClick={() => {
            sessionStorage.removeItem('is_msal_popup');
            window.close();
          }} 
          className="mt-6 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-sm transition-colors"
        >
          Close Window
        </button>
      </div>
    );
  }

  if (recoveryMode) {
    return <UpdatePassword />;
  }

  if (!user) {
    return <Login />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'projects':
        return <ProjectList onProjectClick={handleProjectClick} />;
      case 'my-projects':
        return <ProjectList employeeView={true} onProjectClick={handleProjectClick} />;
      case 'kanban':
        return <GlobalKanban onProjectClick={handleProjectClick} />;
      case 'calendar':
        return <GlobalCalendar onProjectClick={handleProjectClick} />;
      case 'time_tracking':
        return <TimeTracking />;
      case 'team':
        return <TeamManagement />;
      case 'vendors':
        return <VendorManagement onProjectClick={handleProjectClick} />;
      case 'petty_cash':
        return <PettyCash />;
      case 'bank_statements':
        return <BankStatements />;
      case 'leaves':
        return <LeaveManagement />;
      case 'file_controls':
        return <FileControls />;
      case 'assets':
        return <AssetManagement />;
      case 'profile':
        return <Profile />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {renderContent()}
      </Layout>
      
      <Sheet open={isDetailsOpen} onOpenChange={(open) => {
        setIsDetailsOpen(open);
        if (!open) setIsMaximized(false);
      }}>
        <SheetContent 
          side="right"
          className={cn(
            "p-0 border-l-border dark:border-white/10 shadow-2xl transition-all duration-500 ease-in-out !max-w-none sm:border-l",
            isMaximized ? "!w-full !inset-0 !h-full" : "w-screen sm:w-[85vw] sm:max-w-[85vw]"
          )}
        >
          {selectedProject && (
            <ProjectDetails 
              project={selectedProject} 
              onClose={() => setIsDetailsOpen(false)} 
              isMaximized={isMaximized}
              onToggleMaximize={() => setIsMaximized(!isMaximized)}
              initialTab={projectDetailsTab}
              onUpdate={() => {
                // Refresh data if needed
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <UserProvider>
          <NotificationProvider>
            <FileSettingsProvider>
              <MainApp />
              <Toaster position="top-right" />
            </FileSettingsProvider>
          </NotificationProvider>
        </UserProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
