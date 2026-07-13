import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type AccentColor = 'indigo' | 'rose' | 'emerald' | 'blue' | 'violet' | 'orange' | 'slate' | string;
export type DashboardStyle = 'shadow' | 'border' | 'glass' | 'flat';
export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  dashboardStyle: DashboardStyle;
  setDashboardStyle: (style: DashboardStyle) => void;
  isColorful: boolean;
  setIsColorful: (colorful: boolean) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  workspaceName: string;
  setWorkspaceName: (name: string) => Promise<void>;
  workspaceLogo: string | null;
  workspaceLogoFull: string | null;
  setWorkspaceLogo: (logo: string | null, fullLogo?: string | null) => Promise<void>;
  getProjectColors: (index: number) => any;
  getDashboardColors: () => any;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accentColor, setAccentColor] = useState<AccentColor>(() => {
    return (localStorage.getItem('app-accent') as AccentColor) || 'indigo';
  });
  
  const [dashboardStyle, setDashboardStyle] = useState<DashboardStyle>(() => {
    return (localStorage.getItem('app-cardStyle') as DashboardStyle) || 'shadow';
  });

  const [isColorful, setIsColorful] = useState<boolean>(() => {
    const saved = localStorage.getItem('app-colorful');
    return saved !== null ? saved === 'true' : true;
  });

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('app-themeMode') as ThemeMode) || 'light';
  });

  const [workspaceName, setWorkspaceNameState] = useState<string>('Purva Vedic');
  const [workspaceLogo, setWorkspaceLogoState] = useState<string | null>(null);
  const [workspaceLogoFull, setWorkspaceLogoFullState] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('app-accent', accentColor);
    localStorage.setItem('app-cardStyle', dashboardStyle);
    localStorage.setItem('app-colorful', String(isColorful));
    localStorage.setItem('app-themeMode', themeMode);
    
    // Set root attribute to let CSS override the theme colors globally
    document.documentElement.setAttribute('data-accent', accentColor);
    
    // Apply dark mode
    let isDark = false;
    if (themeMode === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = themeMode === 'dark';
    }
    
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Attempt to sync to Supabase (debounce this in a real app, but this will do for simple settings)
    const syncThemeToSupabase = async () => {
      try {
        const { data } = await supabase.from('workspace_settings').select('id').limit(1).maybeSingle();
        const updateData = { 
          accent_color: accentColor, 
          dashboard_style: dashboardStyle, 
          is_colorful: isColorful, 
          theme_mode: themeMode 
        };
        if (data?.id) {
          await supabase.from('workspace_settings').update(updateData).eq('id', data.id);
        } else {
          await supabase.from('workspace_settings').insert([updateData]);
        }
      } catch (err) {
        // Ignore errors if table doesn't exist
      }
    };
    // Let it run async without blocking
    void syncThemeToSupabase();

  }, [accentColor, dashboardStyle, isColorful, themeMode]);

  // Listen for system theme changes if using 'system'
  useEffect(() => {
    if (themeMode !== 'system') return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  useEffect(() => {
    const loadWorkspaceSettings = async () => {
      // Load local settings as fallback
      const localName = localStorage.getItem('app-workspace-name');
      const localLogo = localStorage.getItem('app-workspace-logo');
      const localLogoFull = localStorage.getItem('app-workspace-logo-full');
      if (localName) setWorkspaceNameState(localName);
      if (localLogo) setWorkspaceLogoState(localLogo);
      if (localLogoFull) setWorkspaceLogoFullState(localLogoFull);

      // Try fetching from supabase (it will fail if the table doesn't exist yet, which is expected before running the SQL)
      try {
        const { data, error } = await supabase.from('workspace_settings').select('*').limit(1).maybeSingle();
        if (!error && data) {
          if (data.workspace_name) setWorkspaceNameState(data.workspace_name);
          if (data.logo_url) setWorkspaceLogoState(data.logo_url);
          if (data.full_logo_url !== undefined) setWorkspaceLogoFullState(data.full_logo_url);
          if (data.accent_color) setAccentColor(data.accent_color as AccentColor);
          if (data.dashboard_style) setDashboardStyle(data.dashboard_style as DashboardStyle);
          if (data.is_colorful !== null) setIsColorful(data.is_colorful);
          if (data.theme_mode) setThemeMode(data.theme_mode as ThemeMode);
        }
      } catch (err) {
        // Table probably doesn't exist yet, ignore
      }
    };
    loadWorkspaceSettings();

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (session) loadWorkspaceSettings();
      }
    });

    const channel = supabase
      .channel('public:workspace_settings:theme')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_settings' }, (payload) => {
         const newData = payload.new as any;
         if (newData) {
           if (newData.workspace_name) setWorkspaceNameState(prev => prev !== newData.workspace_name ? newData.workspace_name : prev);
           if (newData.logo_url !== undefined) setWorkspaceLogoState(prev => prev !== newData.logo_url ? newData.logo_url : prev);
           if (newData.full_logo_url !== undefined) setWorkspaceLogoFullState(prev => prev !== newData.full_logo_url ? newData.full_logo_url : prev);
           if (newData.accent_color) setAccentColor(prev => prev !== newData.accent_color ? newData.accent_color as AccentColor : prev);
           if (newData.dashboard_style) setDashboardStyle(prev => prev !== newData.dashboard_style ? newData.dashboard_style as DashboardStyle : prev);
           if (newData.is_colorful !== null) setIsColorful(prev => prev !== newData.is_colorful ? newData.is_colorful : prev);
           if (newData.theme_mode) setThemeMode(prev => prev !== newData.theme_mode ? newData.theme_mode as ThemeMode : prev);
         }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      authSub.unsubscribe();
    };
  }, []);

  const setWorkspaceName = async (name: string) => {
    setWorkspaceNameState(name);
    localStorage.setItem('app-workspace-name', name);
    try {
      const { data } = await supabase.from('workspace_settings').select('id').limit(1).maybeSingle();
      if (data?.id) {
        await supabase.from('workspace_settings').update({ workspace_name: name }).eq('id', data.id);
      } else {
        await supabase.from('workspace_settings').insert([{ workspace_name: name }]);
      }
    } catch (err) {
      // Ignored
    }
  };

  const setWorkspaceLogo = async (logo: string | null, fullLogo?: string | null) => {
    setWorkspaceLogoState(logo);
    if (fullLogo !== undefined) setWorkspaceLogoFullState(fullLogo);

    if (logo) localStorage.setItem('app-workspace-logo', logo);
    else localStorage.removeItem('app-workspace-logo');

    if (fullLogo !== undefined) {
      if (fullLogo) localStorage.setItem('app-workspace-logo-full', fullLogo);
      else localStorage.removeItem('app-workspace-logo-full');
    }

    try {
      const { data } = await supabase.from('workspace_settings').select('id').limit(1).maybeSingle();
      const updateData: any = { logo_url: logo };
      if (fullLogo !== undefined) updateData.full_logo_url = fullLogo;

      if (data?.id) {
        await supabase.from('workspace_settings').update(updateData).eq('id', data.id);
      } else {
        await supabase.from('workspace_settings').insert([updateData]);
      }
    } catch (err) {
      // Ignored
    }
  };

  const PALETTES: Record<string, any> = {
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-100 dark:border-indigo-500/20', progress: 'bg-indigo-500', hoverBg: 'hover:bg-indigo-500 hover:text-white', solid: 'bg-indigo-600 text-white', solidHover: 'hover:bg-indigo-700' },
    rose: { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-100 dark:border-rose-500/20', progress: 'bg-rose-500', hoverBg: 'hover:bg-rose-500 hover:text-white', solid: 'bg-rose-600 text-white', solidHover: 'hover:bg-rose-700' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-100 dark:border-emerald-500/20', progress: 'bg-emerald-500', hoverBg: 'hover:bg-emerald-500 hover:text-white', solid: 'bg-emerald-600 text-white', solidHover: 'hover:bg-emerald-700' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-100 dark:border-blue-500/20', progress: 'bg-blue-500', hoverBg: 'hover:bg-blue-500 hover:text-white', solid: 'bg-blue-600 text-white', solidHover: 'hover:bg-blue-700' },
    violet: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-100 dark:border-violet-500/20', progress: 'bg-violet-500', hoverBg: 'hover:bg-violet-500 hover:text-white', solid: 'bg-violet-600 text-white', solidHover: 'hover:bg-violet-700' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-100 dark:border-orange-500/20', progress: 'bg-orange-500', hoverBg: 'hover:bg-orange-500 hover:text-white', solid: 'bg-orange-600 text-white', solidHover: 'hover:bg-orange-700' },
    slate: { bg: 'bg-slate-100 dark:bg-slate-800/40', text: 'text-slate-700 dark:text-zinc-300', border: 'border-slate-200 dark:border-white/10', progress: 'bg-slate-600', hoverBg: 'hover:bg-slate-600 hover:text-white', solid: 'bg-slate-700 text-white', solidHover: 'hover:bg-slate-800' },
  };

  const getCustomPalette = () => ({
    bg: 'theme-custom-bg',
    text: 'theme-custom-text',
    border: 'theme-custom-border',
    progress: 'theme-custom-main',
    hoverBg: 'theme-custom-hoverbg',
    solid: 'theme-custom-main',
    solidHover: 'theme-custom-solidhover'
  });

  const getProjectColors = (index: number) => {
    if (isColorful) {
      const colors = [
        PALETTES.emerald,
        PALETTES.orange,
        PALETTES.blue,
        PALETTES.rose,
        PALETTES.violet,
        PALETTES.slate,
        PALETTES.indigo,
      ];
      return colors[index % colors.length];
    }
    return accentColor.startsWith('#') ? getCustomPalette() : PALETTES[accentColor];
  };

  const getDashboardColors = () => {
    return accentColor.startsWith('#') ? getCustomPalette() : PALETTES[accentColor];
  };

  useEffect(() => {
    // Dynamically update favicon and app icons when workspace logo changes
    if (workspaceLogo || workspaceLogoFull) {
      const logoUrl = workspaceLogoFull || workspaceLogo || '';
      
      // Update favicons
      const updateIcon = (selector: string) => {
        let el = document.querySelector(selector) as HTMLLinkElement;
        if (!el) {
          el = document.createElement('link');
          el.rel = selector.includes('apple-touch-icon') ? 'apple-touch-icon' : 'icon';
          document.head.appendChild(el);
        }
        el.href = logoUrl;
      };
      
      updateIcon('link[rel="icon"]');
      updateIcon('link[rel="apple-touch-icon"]');

      // Update PWA manifest dynamically
      try {
        const manifestStr = JSON.stringify({
          name: workspaceName || 'Purva Vedic Project Management',
          short_name: workspaceName || 'Purva Vedic',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#4f46e5',
          icons: [
            {
              src: logoUrl,
              sizes: '192x192 512x512',
              type: 'image/png' // Assuming PNG but works loosely
            }
          ]
        });
        const blob = new Blob([manifestStr], { type: 'application/manifest+json' });
        const manifestUrl = URL.createObjectURL(blob);
        let manifestEl = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
        if (!manifestEl) {
          manifestEl = document.createElement('link');
          manifestEl.rel = 'manifest';
          document.head.appendChild(manifestEl);
        }
        manifestEl.href = manifestUrl;
      } catch (e) {
        console.error('Failed to update manifest dynamically', e);
      }
    }
  }, [workspaceLogo, workspaceLogoFull, workspaceName]);

  return (
    <ThemeContext.Provider value={{ 
      accentColor, setAccentColor, 
      dashboardStyle, setDashboardStyle, 
      isColorful, setIsColorful, 
      themeMode, setThemeMode,
      workspaceName, setWorkspaceName,
      workspaceLogo, workspaceLogoFull, setWorkspaceLogo,
      getProjectColors, getDashboardColors 
    }}>
      {accentColor.startsWith('#') && (
        <style>{`
          .theme-custom-bg { background-color: ${accentColor}1A; }
          .dark .theme-custom-bg { background-color: ${accentColor}26; }
          .theme-custom-text { color: ${accentColor}; }
          .theme-custom-border { border-color: ${accentColor}33; }
          .theme-custom-main { background-color: ${accentColor}; color: white; }
          .theme-custom-hoverbg:hover { background-color: ${accentColor}; color: white; }
          .theme-custom-solidhover:hover { background-color: ${accentColor}E6; color: white; }
        `}</style>
      )}
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
