import React from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Trello,
  Calendar as CalendarIcon,
  LogOut,
  User,
  Settings,
  Bell,
  ListTodo,
  Users as UsersIcon,
  Menu,
  X as CloseIcon,
  MoreVertical,
  Building2,
  Languages,
  Monitor,
  ShieldCheck,
  Sun,
  Moon,
  Briefcase,
  CalendarDays,
  Landmark,
  Paperclip,
  ExternalLink,
  FileText,
  Maximize2,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { useNotifications } from "../contexts/NotificationContext";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { supabase } from "../lib/supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { cn, getInitials } from "../lib/utils";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { format } from "date-fns";
import { BanknotesIcon } from "@heroicons/react/24/outline"; // Or use IndianRupee from lucide-react? let's use lucide
import { IndianRupee } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

import {
  hasAdminAccess,
  hasProjectManagementAccess,
  hasFinanceAccess,
  isLimitedUser,
  RoleLabels,
} from "../types";
import { useFileSettings } from "../contexts/FileSettingsContext";

export const Layout: React.FC<LayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
}) => {
  const { user, setUser, allUsers } = useUser();
  const { themeMode, setThemeMode, colorTheme, workspaceLogo, workspaceName } =
    useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead, browserPermission, requestBrowserPermission, addNotification } =
    useNotifications();
  const { language, setLanguage, t, translateData } = useLanguage();
  const { canViewDashboard, canManageBackups, canManageTimeTracking, canManageSalaries } = useFileSettings();
  const [showHistory, setShowHistory] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [activePettyCashDetail, setActivePettyCashDetail] = React.useState<any | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = React.useState<string | null>(null);

  const parseNotification = React.useCallback((n: any) => {
    const parts = (n.message || '').split(' ||METADATA||');
    const cleanMessage = parts[0];
    let metadata: any = null;
    if (parts.length > 1) {
      try {
        metadata = JSON.parse(parts[1]);
      } catch (e) {
        console.error('Error parsing notification metadata:', e);
      }
    }
    return {
      ...n,
      cleanMessage,
      metadata
    };
  }, []);

  React.useEffect(() => {
    if (!user) return;
    const role = user.role;
    if (activeTab === "dashboard" && !canViewDashboard(role)) {
      setActiveTab("kanban");
    }
  }, [user?.role, activeTab, setActiveTab, canViewDashboard]);

  const getNavItems = () => {
    const role = user?.role;

    let baseItems = [];

    if (hasAdminAccess(role)) {
      baseItems = [
        { id: "projects", label: t("projects"), icon: ListTodo },
        { id: "kanban", label: t("kanban"), icon: Trello },
        { id: "calendar", label: t("calendar"), icon: CalendarIcon },
        { id: "vendors", label: t("vendors"), icon: Building2 },
        { id: "team", label: t("team"), icon: UsersIcon },
        { id: "leaves", label: "Leaves", icon: CalendarDays },
        { id: "petty_cash", label: t("petty_cash"), icon: IndianRupee },
        { id: "assets", label: "Assets", icon: Briefcase },
        { id: "file_controls", label: t("control_panel"), icon: ShieldCheck },
      ];
    } else if (role === "deputy_sthapathy") {
      baseItems = [
        { id: "kanban", label: t("kanban"), icon: Trello },
        { id: "projects", label: t("projects"), icon: ListTodo },
        { id: "calendar", label: t("calendar"), icon: CalendarIcon },
        { id: "vendors", label: t("vendors"), icon: Building2 },
        { id: "leaves", label: "Leaves", icon: CalendarDays },
        { id: "petty_cash", label: t("petty_cash"), icon: IndianRupee },
        { id: "assets", label: "Assets", icon: Briefcase },
      ];
    } else if (role === "finance_manager") {
      baseItems = [
        { id: "projects", label: t("projects"), icon: ListTodo },
        { id: "vendors", label: t("vendors"), icon: Building2 },
        { id: "leaves", label: "Leaves", icon: CalendarDays },
        { id: "petty_cash", label: t("petty_cash"), icon: IndianRupee },
        { id: "assets", label: "Assets", icon: Briefcase },
      ];
    } else {
      baseItems = [
        { id: "kanban", label: t("kanban"), icon: Trello },
        { id: "projects", label: t("projects"), icon: ListTodo },
        { id: "calendar", label: t("calendar"), icon: CalendarIcon },
        { id: "leaves", label: "Leaves", icon: CalendarDays },
        { id: "petty_cash", label: t("petty_cash"), icon: IndianRupee },
      ];
    }

    if (canViewDashboard(role)) {
      baseItems.unshift({
        id: "dashboard",
        label: t("dashboard"),
        icon: LayoutDashboard,
      });
    }

    if (canManageTimeTracking(role, 'create') || canManageTimeTracking(role, 'delete')) {
      // Find a good spot to insert it, or just push it before team/assets.
      // Let's just push it
      baseItems.push({
        id: "time_tracking",
        label: "Time Tracking",
        icon: CalendarIcon,
      });
    }

    return baseItems;
  };

  const navItems = getNavItems();

  const renderUserMenuContent = () => (
    <DropdownMenuContent
      align="end"
      className="w-64 rounded-xl shadow-lg border-slate-200 dark:border-white/10 dark:border-slate-800 p-2"
    >
      <div className="px-2 py-2 mb-1">
        <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100">
          {user?.full_name}
        </p>
        <div className="flex flex-col mt-1">
          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
            {translateData(user?.designation || "N/A")}
          </p>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">
            {user?.role
              ? translateData(RoleLabels[user.role] || user.role)
              : ""}
          </p>
        </div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => setActiveTab("profile")}>
        <User className="mr-2 h-4 w-4" />
        <span>{t("my_profile")}</span>
      </DropdownMenuItem>
      {hasAdminAccess(user?.role) && (
        <>
          <DropdownMenuItem onClick={() => setActiveTab("team")}>
            <UsersIcon className="mr-2 h-4 w-4" />
            <span>{t("team")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActiveTab("file_controls")}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            <span>{t("file_access_config")}</span>
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="text-red-600"
        onClick={async () => {
          await supabase.auth.signOut();
          setUser(null);
          window.location.reload();
        }}
      >
        <LogOut className="mr-2 h-4 w-4" />
        <span>{t("logout")}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  const renderSidebarContent = (isCollapsed: boolean = false) => {
    const { getDashboardColors, workspaceName, workspaceLogo } = useTheme();
    const themeColors = getDashboardColors();

    return (
      <div className="flex flex-col h-full relative">
        <div
          className={cn(
            "border-b border-slate-100 dark:border-slate-800 dark:border-slate-800 flex flex-col justify-center",
            isCollapsed ? "p-4 items-center h-[88px]" : "p-6 h-[88px]",
          )}
        >
          <div className="flex items-center gap-3 w-full">
            {workspaceLogo ? (
              <img
                src={workspaceLogo}
                alt="Logo"
                className={cn(
                  "object-contain object-left",
                  isCollapsed ? "h-8 w-8 mx-auto" : "h-8 max-w-[120px]",
                )}
              />
            ) : (
              <div
                className={cn(
                  "rounded-lg flex items-center justify-center shrink-0 text-white",
                  themeColors.solid,
                  isCollapsed ? "w-10 h-10 mx-auto" : "w-8 h-8",
                )}
              >
                {workspaceName.charAt(0)}
              </div>
            )}
            {!isCollapsed && (
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight flex-1">
                {workspaceName}
              </h1>
            )}
          </div>
          {!isCollapsed && (
            <p className="text-xs text-slate-500 mt-1.5 font-medium uppercase tracking-wider">
              {t("project_management")}
            </p>
          )}
        </div>

        <nav className={cn("flex-1 space-y-1", isCollapsed ? "p-3" : "p-4")}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center transition-all duration-200",
                isCollapsed
                  ? "w-12 h-12 justify-center rounded-2xl mx-auto"
                  : "w-full gap-3 px-4 py-3 rounded-xl",
                activeTab === item.id
                  ? cn(
                      themeColors.bg,
                      themeColors.text,
                      "shadow-sm border dark:border-white/5",
                    )
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 dark:border-transparent hover:text-slate-900 dark:hover:text-slate-100 border border-transparent",
              )}
            >
              <item.icon
                className={cn(
                  "shrink-0",
                  activeTab === item.id ? themeColors.text : "text-slate-400",
                  isCollapsed ? "w-6 h-6" : "w-5 h-5",
                )}
              />
              {!isCollapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          ))}
        </nav>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#FFFFF0] dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex bg-white dark:bg-[#121212] dark:bg-slate-900 dark:border-slate-800 border-r border-slate-200 dark:border-slate-800 flex-col shrink-0 transition-all duration-300 relative",
          isSidebarCollapsed ? "w-20" : "w-64",
        )}
      >
        {renderSidebarContent(isSidebarCollapsed)}

        {/* Collapse Toggle Button */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-8 w-6 h-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors z-50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Trigger */}
            <Sheet>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden rounded-xl"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="p-0 w-72">
                {renderSidebarContent(false)}
              </SheetContent>
            </Sheet>

            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {activeTab === "file_controls"
                ? t("control_panel")
                : t(activeTab.replace("-", "_"))}
            </h2>
          </div>

          <div className="flex items-center gap-2 lg:gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-slate-500 relative mr-1"
              onClick={() =>
                setThemeMode(themeMode === "light" ? "dark" : "light")
              }
            >
              {themeMode === "dark" ||
              (themeMode === "system" &&
                window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches) ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-slate-500 relative mr-1"
                  >
                    <Languages className="h-5 w-5" />
                  </Button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-32 rounded-xl shadow-lg border-slate-200 dark:border-slate-800 p-1"
              >
                <DropdownMenuItem
                  onClick={() => setLanguage("en")}
                  className={cn(
                    "rounded-lg text-xs font-bold",
                    language === "en" && "bg-indigo-50 text-indigo-700",
                  )}
                >
                  English
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLanguage("te")}
                  className={cn(
                    "rounded-lg text-xs font-bold",
                    language === "te" && "bg-indigo-50 text-indigo-700",
                  )}
                >
                  తెలుగు
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-slate-500 relative"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                    )}
                  </Button>
                }
              />
              <DropdownMenuContent
                align="end"
                className="w-80 rounded-xl shadow-lg border-slate-200 dark:border-slate-800 p-0 overflow-hidden"
              >
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Notifications
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowHistory(true)}
                      className="text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700 dark:text-zinc-300"
                    >
                      History
                    </button>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider hover:text-indigo-700"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                </div>

                {/* Browser Notification Consent & Status Panel */}
                {browserPermission === 'default' && (
                  <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/20 border-b border-slate-100 dark:border-slate-850 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-indigo-500 animate-bounce shrink-0" />
                      <div className="text-left">
                        <p className="text-xs font-bold text-slate-850 dark:text-slate-200">Enable Browser Popups</p>
                        <p className="text-[10px] text-slate-500 leading-tight">Get real-time workspace alerts</p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={async () => {
                        const result = await requestBrowserPermission();
                        if (result === 'granted') {
                          toast.success("Browser notifications enabled!");
                          try {
                            new Notification("Purva Vedic Consultancy", {
                              body: "Real-time alerts are now active!",
                              icon: '/icon-512x512.png'
                            });
                          } catch (err) {
                            console.error("Failed to show permission grant notification", err);
                          }
                        } else if (result === 'denied') {
                          toast.error("Notifications blocked by browser.");
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold h-7 px-2.5 rounded-lg shrink-0"
                    >
                      Allow
                    </Button>
                  </div>
                )}

                {browserPermission === 'denied' && (
                  <div className="p-3.5 bg-rose-50/40 dark:bg-rose-950/10 border-b border-slate-100 dark:border-slate-850 flex flex-col gap-1.5 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-rose-500 text-xs font-bold">⚠️ Notifications Blocked</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      To receive popup alerts, click the lock or settings icon next to the URL bar and change notifications permission to <strong>Allow</strong>.
                    </p>
                    <Button 
                      variant="outline"
                      size="sm" 
                      onClick={() => {
                        toast.info(
                          "To reset: Click lock/settings icon next to browser URL. Change 'Notifications' from Block to Allow.", 
                          { duration: 8000 }
                        );
                      }}
                      className="text-[10px] font-bold h-7 px-2 border-rose-200 hover:bg-rose-50/50 dark:border-rose-900/40 dark:hover:bg-rose-950/20 text-rose-600 dark:text-rose-400 self-start"
                    >
                      Show Instructions
                    </Button>
                  </div>
                )}

                {browserPermission === 'granted' && (
                  <div className="px-3.5 py-3 bg-emerald-50/20 dark:bg-emerald-950/10 border-b border-slate-100 dark:border-slate-850 flex flex-col gap-2 text-left">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                          Browser & Device Push Alerts Active
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (user?.id) {
                            await addNotification(
                              "Device Push Notification Test",
                              "Push notifications are actively connected for allowed devices!",
                              user.id
                            );
                            toast.success("Test notification dispatched to your devices!");
                          }
                        }}
                        className="text-[10px] h-6 px-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 font-semibold"
                      >
                        Send Test Push
                      </Button>
                    </div>
                    {typeof window !== 'undefined' && window.self !== window.top && (
                      <p className="text-[9px] text-slate-500 dark:text-zinc-400 leading-normal border-t border-slate-200/50 dark:border-white/5 pt-1.5">
                        💡 <strong>Sandbox Iframe Active:</strong> Modern browsers block OS-level push notifications from inside nested preview frames. To receive native desktop push popups, click <strong>"Open in New Tab"</strong> in the top-right corner to run the application on its direct domain.
                      </p>
                    )}
                  </div>
                )}
                <div className="max-h-[400px] overflow-y-auto">
                  {notifications.length > 0 ? (
                    <div className="divide-y divide-slate-50 dark:divide-slate-800">
                      {notifications
                        .filter((n) => !n.read)
                        .concat(notifications.filter((n) => n.read).slice(0, 10))
                        .map((n) => {
                          const parsed = parseNotification(n);
                          return (
                            <div
                              key={n.id}
                              className={cn(
                                "p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors cursor-pointer relative text-left",
                                !n.read && "bg-indigo-50/30 dark:bg-indigo-950/10",
                                parsed.metadata && "hover:shadow-sm"
                              )}
                              onClick={() => {
                                markAsRead(n.id);
                                if (parsed.metadata) {
                                  if (parsed.metadata.type === 'petty_cash') {
                                    setActivePettyCashDetail(parsed.metadata);
                                  }
                                  window.dispatchEvent(new CustomEvent('app-notification-click', { detail: parsed }));
                                }
                              }}
                            >
                              {!n.read && (
                                <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-full" />
                              )}
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {n.title}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                                {parsed.cleanMessage}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-2 font-semibold">
                                {format(new Date(n.created_at), "MMM d, yyyy • h:mm a")}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 bg-slate-50 dark:bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Bell className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        No notifications
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        We'll notify you when something happens.
                      </p>
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Profile Button in Header */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-100 dark:border-slate-800">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="flex items-center gap-2 px-2 py-1 h-10 rounded-xl hover:bg-slate-50 dark:bg-slate-950 transition-all"
                    >
                      <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-800">
                        <AvatarFallback className="bg-indigo-600 text-white font-bold text-[10px]">
                          {getInitials(user?.full_name || "")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden md:flex flex-col items-start text-left">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-none">
                          {user?.full_name}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          {user?.role
                            ? translateData(RoleLabels[user.role] || user.role)
                            : ""}
                        </p>
                      </div>
                    </Button>
                  }
                />
                {renderUserMenuContent()}
              </DropdownMenu>
            </div>

            {/* Mobile User Avatar */}
            <div className="lg:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                    >
                      <Avatar className="h-8 w-8 border border-slate-200 dark:border-slate-800">
                        <AvatarFallback className="bg-indigo-600 text-white font-bold text-[10px]">
                          {getInitials(user?.full_name || "")}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  }
                />
                {renderUserMenuContent()}
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Notification History Dialog */}
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col p-0 overflow-hidden rounded-3xl">
            <DialogHeader className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
              <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Notification History
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6">
              {notifications.length > 0 ? (
                <div className="space-y-4">
                  {notifications.map((n) => {
                    const parsed = parseNotification(n);
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          "flex gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm transition-all text-left",
                          parsed.metadata ? "cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-900 hover:shadow-md" : ""
                        )}
                        onClick={() => {
                          markAsRead(n.id);
                          if (parsed.metadata) {
                            if (parsed.metadata.type === 'petty_cash') {
                              setActivePettyCashDetail(parsed.metadata);
                            }
                            setShowHistory(false);
                            window.dispatchEvent(new CustomEvent('app-notification-click', { detail: parsed }));
                          }
                        }}
                      >
                        <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center shrink-0">
                          {parsed.metadata?.type === 'petty_cash' ? (
                            <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          ) : parsed.metadata?.type === 'project' ? (
                            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          ) : parsed.metadata?.type === 'leave' ? (
                            <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Bell className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          )}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {n.title}
                            </h4>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {format(
                                new Date(n.created_at),
                                "MMM d, yyyy h:mm a",
                              )}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
                            {parsed.cleanMessage}
                          </p>
                          {parsed.metadata?.type === 'petty_cash' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-2 hover:underline">
                              <ExternalLink className="w-3 h-3" /> View Petty Cash Voucher
                            </span>
                          )}
                          {parsed.metadata?.type === 'project' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-2 hover:underline">
                              <ExternalLink className="w-3 h-3" /> Open Project Details
                            </span>
                          )}
                          {parsed.metadata?.type === 'leave' && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-2 hover:underline">
                              <ExternalLink className="w-3 h-3" /> View Leave Hub
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-950 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bell className="w-8 h-8 text-slate-300" />
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    No history
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    You don't have any notifications yet.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Interactive Petty Cash Detail Dialog */}
        <Dialog open={!!activePettyCashDetail} onOpenChange={(open) => { if (!open) setActivePettyCashDetail(null); }}>
          <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800 shadow-2xl bg-white dark:bg-zinc-950">
            <DialogHeader className="p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-900/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="text-left">
                  <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Petty Cash Voucher Details
                  </DialogTitle>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium">
                    {activePettyCashDetail?.date ? format(new Date(activePettyCashDetail.date), "MMMM d, yyyy") : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 shrink-0 hover:bg-slate-100 dark:hover:bg-zinc-800"
                onClick={() => setActivePettyCashDetail(null)}
              >
                <CloseIcon className="w-4 h-4 text-slate-500" />
              </Button>
            </DialogHeader>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Display details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50/60 dark:bg-zinc-900/40 border border-slate-100/50 dark:border-white/5 text-left">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block mb-1">
                    Amount & Type
                  </span>
                  <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <IndianRupee className="w-4 h-4 shrink-0" />
                    {activePettyCashDetail?.amount?.replace(/Expense:\s*|Advance:\s*|Rs\.\s*/g, '') || "N/A"}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-semibold block mt-1">
                    {activePettyCashDetail?.amount?.includes('Expense') ? 'Direct Expenditure' : 'Cash Advance'}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/60 dark:bg-zinc-900/40 border border-slate-100/50 dark:border-white/5 text-left">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block mb-1">
                    Category Badge
                  </span>
                  <div className="mt-1">
                    <span className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10">
                      {activePettyCashDetail?.category || "Misc"}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/60 dark:bg-zinc-900/40 border border-slate-100/50 dark:border-white/5 text-left">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                    Project
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {activePettyCashDetail?.project_name || "N/A"}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/60 dark:bg-zinc-900/40 border border-slate-100/50 dark:border-white/5 text-left">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 block mb-0.5">
                    Paid / Raised By
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {activePettyCashDetail?.raised_by_name || "N/A"}
                  </span>
                </div>
              </div>

              {/* Bill/Item Description & Purpose */}
              <div className="space-y-2 text-left">
                <h4 className="text-[11px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500">
                  Item Name & Purpose
                </h4>
                <div className="p-4 rounded-2xl bg-slate-50/30 dark:bg-zinc-900/20 border border-slate-100/30 dark:border-white/5">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {activePettyCashDetail?.bill_name || "N/A"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                    {activePettyCashDetail?.reason || "No details provided."}
                  </p>
                </div>
              </div>

              {/* Receipt Visualizer Attachment Section */}
              <div className="space-y-2 text-left">
                <h4 className="text-[11px] uppercase font-bold tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  Receipt Attachment
                </h4>

                {activePettyCashDetail?.receipt_url ? (
                  <div className="border border-slate-100 dark:border-white/5 rounded-2xl overflow-hidden bg-slate-50 dark:bg-zinc-900">
                    {/* Check if receipt_url points to a standard image */}
                    {activePettyCashDetail.receipt_url.match(/\.(png|jpg|jpeg|webp|gif)/i) || 
                     activePettyCashDetail.receipt_url.includes('supabase.co/storage/v1/object') || 
                     activePettyCashDetail.receipt_url.startsWith('data:image/') ? (
                      <div className="relative group cursor-zoom-in overflow-hidden max-h-[220px]" onClick={() => setZoomedImageUrl(activePettyCashDetail.receipt_url)}>
                        <img 
                          src={activePettyCashDetail.receipt_url} 
                          alt="Receipt Attachment" 
                          referrerPolicy="no-referrer"
                          className="w-full object-cover max-h-[220px] group-hover:scale-105 transition-all duration-300" 
                        />
                        <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-[10px] bg-white/95 dark:bg-zinc-900/95 font-bold text-slate-800 dark:text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 border border-slate-100 dark:border-zinc-850">
                            <Maximize2 className="w-3 h-3" /> Click to Expand
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 flex flex-col items-center justify-center text-center">
                        <FileText className="w-12 h-12 text-slate-400 mb-2" />
                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">Non-Image Document Receipt</p>
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-1">This attachment is a PDF or spreadsheet document.</p>
                      </div>
                    )}
                    <div className="p-3 bg-slate-100/50 dark:bg-zinc-900/85 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-3">
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate max-w-[220px] font-mono">
                        {activePettyCashDetail.receipt_url}
                      </span>
                      <a 
                        href={activePettyCashDetail.receipt_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 bg-indigo-50/50 dark:bg-indigo-950/20 px-2.5 py-1 rounded-lg"
                      >
                        <ExternalLink className="w-3 h-3" /> Open Receipt
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 text-center text-slate-400 dark:text-zinc-500 flex flex-col items-center justify-center">
                    <Paperclip className="w-6 h-6 mb-1 text-slate-300" />
                    <p className="text-xs font-semibold">No receipt image attached</p>
                    <p className="text-[10px] text-slate-400/80 dark:text-zinc-500/80 mt-0.5">This entry was logged without a scan/file upload.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="p-4 bg-slate-50 dark:bg-zinc-900/40 border-t border-slate-100 dark:border-white/5 flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                className="text-xs font-bold rounded-xl border-slate-200 hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                onClick={() => setActivePettyCashDetail(null)}
              >
                Close
              </Button>
              <Button
                className="text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
                onClick={() => {
                  setActiveTab('petty_cash');
                  setActivePettyCashDetail(null);
                }}
              >
                Go to Petty Cash Hub
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Lightbox Receipt Image Zoom Overlay */}
        <Dialog open={!!zoomedImageUrl} onOpenChange={(open) => { if (!open) setZoomedImageUrl(null); }}>
          <DialogContent className="max-w-[90vw] md:max-w-[70vw] p-0 overflow-hidden bg-slate-950 border-none rounded-2xl shadow-2xl flex flex-col">
            <div className="p-3 bg-slate-900/80 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 truncate max-w-[70%]">
                {zoomedImageUrl}
              </span>
              <div className="flex items-center gap-2">
                <a 
                  href={zoomedImageUrl || '#'} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Full size
                </a>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full w-8 h-8 text-white hover:bg-white/10"
                  onClick={() => setZoomedImageUrl(null)}
                >
                  <CloseIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 bg-slate-950 overflow-auto max-h-[80vh]">
              {zoomedImageUrl && (
                <img 
                  src={zoomedImageUrl} 
                  alt="Zoomed Receipt" 
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Content Area */}
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};
