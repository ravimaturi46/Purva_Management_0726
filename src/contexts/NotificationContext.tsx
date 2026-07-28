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
  testPushNotification: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const DEFAULT_VAPID_PUBLIC_KEY = 'BK3AqTAA1gq0fewhIhJmXBZcrPA_Nll1STsO4lDVZNpNFPlTlfLFKELPguhPpMnTiOnlyKSzPrtV8qYknbdqNQM';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');

  const subscribeUserToPush = async (userId: string) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[WebPush] PushManager or ServiceWorker not supported in this browser environment.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY).trim();

      console.log('[WebPush] Registering VAPID push subscription for user:', userId);

      let subscription = await registration.pushManager.getSubscription();
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      try {
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          });
          console.log('[WebPush] New PushSubscription created using VAPID key');
        } else {
          console.log('[WebPush] Existing PushSubscription retrieved from browser');
        }
      } catch (subErr) {
        console.warn('[WebPush] Existing subscription invalid or key changed. Re-subscribing...', subErr);
        if (subscription) {
          await subscription.unsubscribe().catch(() => {});
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
        console.log('[WebPush] Re-subscribed with new VAPID key successfully');
      }

      const subJson = subscription.toJSON();
      if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
        const { error } = await supabase.from('user_push_subscriptions').upsert(
          {
            user_id: userId,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,endpoint' }
        );
        if (error) {
          console.error('[WebPush] Failed to save push subscription to Supabase user_push_subscriptions table:', error.message, error.details);
        } else {
          console.log('[WebPush] Push subscription successfully saved in Supabase table user_push_subscriptions!');
        }
      } else {
        console.warn('[WebPush] Subscription JSON missing keys or endpoint:', subJson);
      }
    } catch (err: any) {
      console.error('[WebPush] Error during push subscription workflow:', err);
    }
  };

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

        if (user?.id && Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then(() => {
            subscribeUserToPush(user.id);
          }).catch(err => {
            console.error('[WebPush] Error getting SW ready:', err);
          });
        }
      }
    }
  }, [user?.id]);

  const requestBrowserPermission = async (): Promise<'default' | 'granted' | 'denied' | 'unsupported'> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermission('unsupported');
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission as any);
      if (permission === 'granted' && user?.id) {
        subscribeUserToPush(user.id);
      }
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
      icon: '/notification-icon.svg',
      badge: '/notification-icon.svg',
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

    const resolveUserIds = async (nameOrId: string | null | undefined): Promise<string[]> => {
      if (!nameOrId || nameOrId === 'Unassigned' || nameOrId === 'N/A') return [];
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId);

        const { data: allProfiles, error } = await supabase.from('profiles').select('id, full_name, email');
        if (error || !allProfiles || allProfiles.length === 0) {
          if (isUuid) return [nameOrId];
          return [];
        }

        const matchedIds = new Set<string>();

        if (isUuid) {
          const found = allProfiles.find(p => p.id === nameOrId);
          if (found) matchedIds.add(found.id);
          else matchedIds.add(nameOrId);
          return Array.from(matchedIds);
        }

        const targetNorm = nameOrId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetNoH = targetNorm.replace(/h/g, '');
        const targetWords = nameOrId.trim().toLowerCase().split(/\s+/).filter(Boolean);

        for (const p of allProfiles) {
          if (!p.full_name) {
            if (p.email && p.email.toLowerCase() === nameOrId.trim().toLowerCase()) {
              matchedIds.add(p.id);
            }
            continue;
          }

          const pNorm = p.full_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          const pNoH = pNorm.replace(/h/g, '');

          // Exact match
          if (pNorm === targetNorm) {
            matchedIds.add(p.id);
            continue;
          }

          // Spelling variation match (e.g. Dhyanesh vs Dyanesh)
          if (pNoH === targetNoH) {
            matchedIds.add(p.id);
            continue;
          }

          // Email match
          if (p.email && p.email.toLowerCase() === nameOrId.trim().toLowerCase()) {
            matchedIds.add(p.id);
            continue;
          }

          // Distinct word match
          const pWords = p.full_name.trim().toLowerCase().split(/\s+/).filter(Boolean);
          const hasWordMatch = targetWords.some(tw => 
            tw.length >= 3 && pWords.some(pw => pw.replace(/h/g, '') === tw.replace(/h/g, ''))
          );
          if (hasWordMatch) {
            matchedIds.add(p.id);
          }
        }

        if (matchedIds.size > 0) {
          console.log(`[NotificationTable] Resolved "${nameOrId}" ->`, Array.from(matchedIds));
          return Array.from(matchedIds);
        }
      } catch (e) {
        console.warn('[NotificationTable] Error resolving user ID:', nameOrId, e);
      }
      return [];
    };

    const recipientIds = new Set<string>();

    // Always include current logged-in user so at least one valid auth.users row is inserted
    if (user?.id) {
      recipientIds.add(user.id);
    }

    if (targetUserId) {
      const resolvedTarget = await resolveUserIds(targetUserId);
      if (resolvedTarget.length > 0) {
        resolvedTarget.forEach(id => recipientIds.add(id));
      } else {
        recipientIds.add(targetUserId);
      }
    }

    // Always query admins and chief_sthapathys for broadcast updates
    try {
      const { data: admins, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'chief_sthapathy']);

      if (profileError) {
        console.warn('[NotificationTable] Could not fetch admin profiles for broadcast:', profileError.message);
      } else if (admins && admins.length > 0) {
        admins.forEach(admin => recipientIds.add(admin.id));
      }
    } catch (e) {
      console.warn('[NotificationTable] Error querying admin profiles:', e);
    }

    // Resolve assigned lead or task assignee from metadata if provided
    if (metadata?.assigned_to) {
      const ids = await resolveUserIds(metadata.assigned_to);
      ids.forEach(id => recipientIds.add(id));
    }

    if (metadata?.task_assignee || metadata?.task_assigned_to) {
      const ids = await resolveUserIds(metadata.task_assignee || metadata.task_assigned_to);
      ids.forEach(id => recipientIds.add(id));
    }

    if (metadata?.project_assignee) {
      const ids = await resolveUserIds(metadata.project_assignee);
      ids.forEach(id => recipientIds.add(id));
    }

    // Automatically resolve and notify the assigned lead for the project from database if not explicitly passed
    if (metadata?.project_id || (metadata?.project_name && metadata?.project_name !== 'N/A')) {
      try {
        let pQuery = supabase.from('projects').select('assigned_to');
        if (metadata.project_id) {
          pQuery = pQuery.eq('id', metadata.project_id);
        } else if (metadata.project_name) {
          pQuery = pQuery.eq('name', metadata.project_name);
        }
        const { data: projData } = await pQuery.maybeSingle();
        if (projData?.assigned_to) {
          const ids = await resolveUserIds(projData.assigned_to);
          ids.forEach(id => recipientIds.add(id));
        }
      } catch (e) {
        console.warn('[NotificationTable] Error resolving assigned project lead:', e);
      }
    }

    if (recipientIds.size === 0) {
      console.warn('[NotificationTable] No target recipient IDs found to insert notification.');
      return;
    }

    // Optimistically add to current user's local notification list if relevant
    if (user?.id && (!targetUserId || targetUserId === user.id || recipientIds.has(user.id))) {
      const optimisticNotif: Notification = {
        id: 'opt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        user_id: user.id,
        title,
        message: finalMessage,
        read: false,
        created_at: new Date().toISOString()
      };
      setNotifications(prev => [optimisticNotif, ...prev.filter(n => n.id !== optimisticNotif.id)]);
    }

    // Try batch insert first
    const newNotifications = Array.from(recipientIds).map(uId => ({
      user_id: uId,
      title,
      message: finalMessage,
      read: false
    }));

    const { error: batchError } = await supabase.from('notifications').insert(newNotifications);

    if (!batchError) {
      console.log(`[NotificationTable] Successfully created ${newNotifications.length} notification record(s) in Supabase.`);
      return;
    }

    console.debug('[NotificationTable] Batch insert notice (some user IDs may not exist in auth.users):', batchError.message);

    // Individual insert fallback: insert one by one so valid user IDs (like current user) succeed
    for (const uId of recipientIds) {
      const { error: singleError } = await supabase.from('notifications').insert({
        user_id: uId,
        title,
        message: finalMessage,
        read: false
      });
      if (singleError) {
        console.debug(`[NotificationTable] User ID ${uId} not in auth.users or restricted by RLS:`, singleError.message);
      } else {
        console.log(`[NotificationTable] Successfully inserted notification for user_id ${uId}`);
      }
    }
  };

  const testPushNotification = async () => {
    let perm = browserPermission;
    if (perm !== 'granted') {
      perm = await requestBrowserPermission();
    }

    if (user?.id) {
      await subscribeUserToPush(user.id);
    }

    const testTitle = 'VAPID Web Push Active';
    const testMsg = 'Real-time VAPID web push notifications are working!';

    toast.success('Test VAPID push notification triggered!');

    // Trigger OS level browser popup
    triggerNativePushNotification(testTitle, testMsg);

    // Also insert into database table
    await addNotification(testTitle, testMsg, user?.id);
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
      requestBrowserPermission,
      testPushNotification
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
