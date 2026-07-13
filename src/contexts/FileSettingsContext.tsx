import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { UserRole } from "../types";
import { supabase } from "../lib/supabase";

export interface RolePermissions {
  view: UserRole[];
  download: UserRole[];
}

export interface FilePermissionsConfig {
  defaultPermissions: RolePermissions;
  // Key: file extension (e.g., 'dwg', 'pdf', 'jpg')
  extensionOverrides: Record<string, RolePermissions>;

  projects: {
    create: UserRole[];
    edit: UserRole[];
    delete: UserRole[];
  };
  tasks: {
    create: UserRole[];
    edit: UserRole[];
    delete: UserRole[];
  };
  vendors: {
    create: UserRole[];
    edit: UserRole[];
    delete: UserRole[];
  };
  pettyCash: {
    create: UserRole[];
    edit: UserRole[];
    delete: UserRole[];
  };
  assets: {
    create: UserRole[];
    edit: UserRole[];
    delete: UserRole[];
  };
  timeTracking: {
    create: UserRole[];
    edit: UserRole[];
    delete: UserRole[];
  };
  salaryManagement: {
    manage: UserRole[];
  };
  dashboard: {
    view: UserRole[];
  };
  backups: {
    manage: UserRole[];
  };
}

const DEFAULT_CONFIG: FilePermissionsConfig = {
  defaultPermissions: {
    view: [
      "admin",
      "chief_sthapathy",
      "deputy_sthapathy",
      "assistant_sthapathy",
      "junior_sthapathy",
      "finance_manager",
      "employee",
    ], // Everyone can view by default
    download: [
      "admin",
      "chief_sthapathy",
      "deputy_sthapathy",
      "assistant_sthapathy",
      "finance_manager",
      "employee",
    ], // Excludes junior_sthapathy by default
  },
  extensionOverrides: {
    dwg: {
      view: [
        "admin",
        "chief_sthapathy",
        "deputy_sthapathy",
        "assistant_sthapathy",
        "junior_sthapathy",
      ],
      download: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    },
    stl: {
      view: [
        "admin",
        "chief_sthapathy",
        "deputy_sthapathy",
        "assistant_sthapathy",
        "junior_sthapathy",
      ],
      download: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    },
    rvt: {
      view: [
        "admin",
        "chief_sthapathy",
        "deputy_sthapathy",
        "assistant_sthapathy",
        "junior_sthapathy",
      ],
      download: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    },
  },
  projects: {
    create: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    edit: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    delete: ["admin"], // Only admin by default
  },
  tasks: {
    create: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    edit: ["admin", "chief_sthapathy", "deputy_sthapathy"],
    delete: ["admin", "chief_sthapathy"],
  },
  vendors: {
    create: ["admin", "finance_manager"],
    edit: ["admin", "finance_manager"],
    delete: ["admin"],
  },
  pettyCash: {
    create: ["admin", "finance_manager"],
    edit: ["admin", "finance_manager"],
    delete: ["admin"],
  },
  assets: {
    create: ["admin", "finance_manager"],
    edit: ["admin", "finance_manager"],
    delete: ["admin"],
  },
  timeTracking: {
    create: ["admin", "chief_sthapathy", "deputy_sthapathy", "assistant_sthapathy", "junior_sthapathy", "finance_manager", "employee"],
    edit: ["admin", "chief_sthapathy"],
    delete: ["admin", "chief_sthapathy"],
  },
  salaryManagement: {
    manage: ["admin", "finance_manager"],
  },
  dashboard: {
    view: ["admin", "chief_sthapathy", "finance_manager"],
  },
  backups: {
    manage: ["admin"],
  },
};

interface FileSettingsContextType {
  config: FilePermissionsConfig;
  updateConfig: (newConfig: FilePermissionsConfig) => void;
  canViewFile: (
    role: UserRole | undefined,
    fileName: string,
    uploaderId?: string | null,
    userId?: string | null,
  ) => boolean;
  canDownloadFile: (
    role: UserRole | undefined,
    fileName: string,
    uploaderId?: string | null,
    userId?: string | null,
  ) => boolean;
  canManageProjects: (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => boolean;
  canManageTasks: (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => boolean;
  canManageVendors: (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => boolean;
  canManagePettyCash: (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => boolean;
  canManageAssets: (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => boolean;
  canManageTimeTracking: (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => boolean;
  canManageSalaries: (
    role: UserRole | undefined,
    action: "manage",
  ) => boolean;
  canViewDashboard: (role: UserRole | undefined) => boolean;
  canManageBackups: (role: UserRole | undefined) => boolean;
}

const FileSettingsContext = createContext<FileSettingsContextType | undefined>(
  undefined,
);

export const FileSettingsProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [config, setConfig] = useState<FilePermissionsConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const fetchConfig = async () => {
      // 1. Try fetching from Supabase
      try {
        const { data, error } = await supabase.from("workspace_settings").select("file_permissions_config").limit(1).maybeSingle();
        if (!error && data?.file_permissions_config) {
          const parsed =
            typeof data.file_permissions_config === "string"
              ? JSON.parse(data.file_permissions_config)
              : data.file_permissions_config;
          setConfig({
            defaultPermissions: parsed.defaultPermissions || DEFAULT_CONFIG.defaultPermissions,
            extensionOverrides: parsed.extensionOverrides || DEFAULT_CONFIG.extensionOverrides,
            projects: parsed.projects || DEFAULT_CONFIG.projects,
            tasks: parsed.tasks || DEFAULT_CONFIG.tasks,
            vendors: parsed.vendors || DEFAULT_CONFIG.vendors,
            pettyCash: parsed.pettyCash || DEFAULT_CONFIG.pettyCash,
            assets: parsed.assets || DEFAULT_CONFIG.assets,
            timeTracking: parsed.timeTracking || DEFAULT_CONFIG.timeTracking,
            salaryManagement: parsed.salaryManagement || DEFAULT_CONFIG.salaryManagement,
            dashboard: parsed.dashboard || DEFAULT_CONFIG.dashboard,
            backups: parsed.backups || DEFAULT_CONFIG.backups,
          });
          return; // Success
        }
      } catch (e) {
        // Ignored
      }
      
      // 2. Fallback to localStorage for prototypes / local-only 
      const saved = localStorage.getItem("purva_file_permissions_v1");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setConfig({
            defaultPermissions:
              parsed.defaultPermissions || DEFAULT_CONFIG.defaultPermissions,
            extensionOverrides:
              parsed.extensionOverrides || DEFAULT_CONFIG.extensionOverrides,
            projects: parsed.projects || DEFAULT_CONFIG.projects,
            tasks: parsed.tasks || DEFAULT_CONFIG.tasks,
            vendors: parsed.vendors || DEFAULT_CONFIG.vendors,
            pettyCash: parsed.pettyCash || DEFAULT_CONFIG.pettyCash,
            assets: parsed.assets || DEFAULT_CONFIG.assets,
            timeTracking: parsed.timeTracking || DEFAULT_CONFIG.timeTracking,
            salaryManagement: parsed.salaryManagement || DEFAULT_CONFIG.salaryManagement,
            dashboard: parsed.dashboard || DEFAULT_CONFIG.dashboard,
            backups: parsed.backups || DEFAULT_CONFIG.backups,
          });
        } catch (e) {
          console.error("Failed to parse file permissions from local storage");
        }
      }
    };
    fetchConfig();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session) fetchConfig();
      }
    });

    const channel = supabase
      .channel('public:workspace_settings:files')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_settings' }, (payload) => {
         const newData = payload.new as any;
         if (newData && newData.file_permissions_config) {
           try {
             const parsed = typeof newData.file_permissions_config === "string" 
                ? JSON.parse(newData.file_permissions_config) 
                : newData.file_permissions_config;
             setConfig((prev) => ({
                ...prev,
                defaultPermissions: parsed.defaultPermissions || DEFAULT_CONFIG.defaultPermissions,
                extensionOverrides: parsed.extensionOverrides || DEFAULT_CONFIG.extensionOverrides,
                projects: parsed.projects || DEFAULT_CONFIG.projects,
                tasks: parsed.tasks || DEFAULT_CONFIG.tasks,
                vendors: parsed.vendors || DEFAULT_CONFIG.vendors,
                pettyCash: parsed.pettyCash || DEFAULT_CONFIG.pettyCash,
                assets: parsed.assets || DEFAULT_CONFIG.assets,
            timeTracking: parsed.timeTracking || DEFAULT_CONFIG.timeTracking,
            salaryManagement: parsed.salaryManagement || DEFAULT_CONFIG.salaryManagement,
                dashboard: parsed.dashboard || DEFAULT_CONFIG.dashboard,
                backups: parsed.backups || DEFAULT_CONFIG.backups,
             }));
           } catch(err) {}
         }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      authSub.unsubscribe();
    };
  }, []);

  const updateConfig = async (newConfig: FilePermissionsConfig) => {
    setConfig(newConfig);
    localStorage.setItem(
      "purva_file_permissions_v1",
      JSON.stringify(newConfig),
    );

    try {
      const { data } = await supabase.from('workspace_settings').select('id').limit(1).maybeSingle();
      if (data?.id) {
        await supabase.from('workspace_settings').update({ file_permissions_config: newConfig }).eq('id', data.id);
      } else {
        await supabase.from('workspace_settings').insert([{ file_permissions_config: newConfig }]);
      }
    } catch (e) {
      // It will fail if the user hasn't added the file_permissions_config column yet.
      console.warn("Could not sync file permissions to Supabase (missing column?)", e);
    }
  };

  const getExt = (fileName: string) =>
    fileName.split(".").pop()?.toLowerCase() || "";

  const canViewFile = (
    role: UserRole | undefined,
    fileName: string,
    uploaderId?: string | null,
    userId?: string | null,
  ) => {
    if (!role) return false;
    if (role === "admin" || role === "chief_sthapathy") return true; // Admins override everything
    if (uploaderId && userId && uploaderId === userId) return true; // Uploader can always view their file

    const ext = getExt(fileName);
    const rules = config.extensionOverrides[ext] || config.defaultPermissions;
    return rules.view.includes(role);
  };

  const canDownloadFile = (
    role: UserRole | undefined,
    fileName: string,
    uploaderId?: string | null,
    userId?: string | null,
  ) => {
    if (!role) return false;
    if (role === "admin" || role === "chief_sthapathy") return true; // Admins override everything
    if (uploaderId && userId && uploaderId === userId) return true; // Uploader can always download their file

    const ext = getExt(fileName);
    const rules = config.extensionOverrides[ext] || config.defaultPermissions;
    return rules.download.includes(role);
  };

  const canManageProjects = (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => {
    if (!role) return false;
    if (role === "admin" || role === "chief_sthapathy") return true;
    return config.projects[action].includes(role);
  };

  const canManageTasks = (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => {
    if (!role) return false;
    if (role === "admin" || role === "chief_sthapathy") return true;
    return config.tasks[action].includes(role);
  };

  const canManageVendors = (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => {
    if (!role) return false;
    if (role === "admin") return true;
    return config.vendors[action].includes(role);
  };

  const canManagePettyCash = (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => {
    if (!role) return false;
    if (role === "admin") return true;
    return config.pettyCash[action].includes(role);
  };

  const canManageAssets = (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => {
    if (!role) return false;
    if (role === "admin") return true;
    return config.assets[action].includes(role);
  };

  const canManageTimeTracking = (
    role: UserRole | undefined,
    action: "create" | "edit" | "delete",
  ) => {
    if (!role) return false;
    if (role === "admin" || role === "chief_sthapathy") return true;
    return config.timeTracking[action].includes(role);
  };

  const canManageSalaries = (
    role: UserRole | undefined,
    action: "manage",
  ) => {
    if (!role) return false;
    if (role === "admin") return true;
    return config.salaryManagement[action].includes(role);
  };

  const canViewDashboard = (role: UserRole | undefined) => {
    if (!role) return false;
    if (role === "admin" || role === "chief_sthapathy") return true;
    return config.dashboard.view.includes(role);
  };

  const canManageBackups = (role: UserRole | undefined) => {
    if (!role) return false;
    if (role === "admin") return true;
    return config.backups.manage.includes(role);
  };

  return (
    <FileSettingsContext.Provider
      value={{
        config,
        updateConfig,
        canViewFile,
        canDownloadFile,
        canManageProjects,
        canManageTasks,
        canManageVendors,
        canManagePettyCash,
        canManageAssets,
        canManageTimeTracking,
        canManageSalaries,
        canViewDashboard,
        canManageBackups,
      }}
    >
      {children}
    </FileSettingsContext.Provider>
  );
};

export const useFileSettings = () => {
  const context = useContext(FileSettingsContext);
  if (context === undefined) {
    throw new Error(
      "useFileSettings must be used within a FileSettingsProvider",
    );
  }
  return context;
};
