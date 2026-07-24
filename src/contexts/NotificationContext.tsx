import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from './UserContext';
import { toast } from 'sonner';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (title: string, message: string, targetUserId?: string, metadata?: any) => Promise<void>;
  browserPermission: 'default' | 'granted' | 'denied' | 'unsupported';
  requestBrowserPermission: () => Promise<'default' | 'granted' | 'denied' | 'unsupported'>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!('Notification' in window)) {
        setBrowserPermission('unsupported');
      } else {
        setBrowserPermission(Notification.permission as any);
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => {
          console.debug('Service worker registration:', err);
        });
      }
    }
  }, []);

  const requestBrowserPermission = async (): Promise<'default' | 'granted' | 'denied' | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermission('unsupported');
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission as any);
      return permission as any;
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      return 'default';
    }
  };

  const triggerNativePushNotification = async (title: string, cleanMessage: string, metadata?: any) => {
    if (typeof window === 'undefined') return;

    const isInIframe = window.self !== window.top;

    if (!('Notification' in window)) {
      console.warn('Browser notifications not supported.');
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
        setBrowserPermission(permission as any);
      } catch (e) {
        console.warn('Could not request Notification permission:', e);
      }
    }

    if (permission !== 'granted') {
      return;
    }

    const notifOptions: any = {
      body: cleanMessage,
      icon: '/auth.html',
      badge: '/auth.html',
      tag: `notif_${Date.now()}`,
      renotify: true,
      requireInteraction: false,
      data: { metadata }
    };

    let pushDelivered = false;

    // 1. Try Service Worker showNotification (Best for OS & mobile system tray popups)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.showNotification) {
          await registration.showNotification(title, notifOptions);
          pushDelivered = true;
        }
      } catch (swErr) {
        console.debug('Service Worker showNotification notice:', swErr);
      }
    }

    // 2. Fallback to standard Notification constructor
    if (!pushDelivered) {
      try {
        const n = new Notification(title, notifOptions);
        n.onclick = () => {
          window.focus();
          if (metadata) {
            window.dispatchEvent(new CustomEvent('app-notification-click', { detail: { title, message: cleanMessage, metadata } }));
          }
        };
        pushDelivered = true;
      } catch (err: any) {
        console.warn('Standard Notification trigger error:', err);
        if (isInIframe) {
          toast.info('OS Device Alerts: Please open the app in a new browser tab (↗️) to allow OS system popups outside iframe restrictions.');
        }
      }
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
      checkDeadlines();
      
      // Subscribe to new notifications
      const channel = supabase
        .channel('notifications_changes')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        }, (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev]);

          // Play auditory cue
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.25);
          } catch (e) {
            console.debug('Auditory cue note');
          }

          const messageParts = (newNotif.message || '').split(' ||METADATA||');
          const cleanMessage = messageParts[0];
          let metadata: any = null;
          if (messageParts.length > 1) {
            try {
              metadata = JSON.parse(messageParts[1]);
            } catch (e) {
              console.error('Error parsing metadata:', e);
            }
          }

          // In-app toast banner
          toast(newNotif.title, {
            description: cleanMessage,
            duration: 8000,
            action: metadata ? {
              label: 'View',
              onClick: () => {
                window.dispatchEvent(new CustomEvent('app-notification-click', { detail: { ...newNotif, metadata } }));
              }
            } : undefined,
          });

          // OS Push Notification
          triggerNativePushNotification(newNotif.title, cleanMessage, metadata);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  const fetchNotifications = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setNotifications(data);
    }
  };

  const checkDeadlines = async () => {
    if (!user) return;
    
    // Fetch tasks assigned to this user that are not completed and have a deadline
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, title, deadline')
      .eq('assigned_to', user.full_name)
      .neq('status', 'Completed')
      .not('deadline', 'is', null);

    if (error || !tasks) return;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const task of tasks) {
      const deadline = new Date(task.deadline);
      deadline.setHours(0, 0, 0, 0);
      
      const diffTime = deadline.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 7 || diffDays === 2) {
        const title = `Deadline Approaching: ${task.title}`;
        const message = `This task is due in ${diffDays} days. Please ensure it is completed on time.`;
        
        // Check if we already notified them today about this task
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', user.id)
          .eq('title', title)
          .gte('created_at', now.toISOString())
          .limit(1);

        if (!existing || existing.length === 0) {
          await addNotification(title, message, user.id);
        }
      }
    }
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);
    
    if (!error) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
    
    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  };

  const addNotification = async (title: string, message: string, targetUserId?: string, metadata?: any) => {
    const finalMessage = metadata
      ? `${message} ||METADATA||${JSON.stringify(metadata)}`
      : message;

    // Immediately attempt local native push notification for real-time desktop / mobile OS alert
    if (!targetUserId || targetUserId === user?.id || user?.role === 'admin' || user?.role === 'chief_sthapathy') {
      triggerNativePushNotification(title, message, metadata);
    }

    if (targetUserId) {
      const { error } = await supabase.from('notifications').insert({
        user_id: targetUserId,
        title,
        message: finalMessage,
        read: false
      });
      if (error) console.error('Error adding notification:', error);
      return;
    }

    // This would normally be done by a database trigger or backend
    // But for this demo, we'll manually add it for all admins
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'chief_sthapathy']);

    if (admins) {
      const newNotifications = admins.map(admin => ({
        user_id: admin.id,
        title,
        message: finalMessage,
        read: false
      }));

      const { error } = await supabase.from('notifications').insert(newNotifications);
      if (error) console.error('Error adding notifications:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{ 
      notifications, 
      unreadCount, 
      markAsRead, 
      markAllAsRead,
      addNotification,
      browserPermission,
      requestBrowserPermission
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
