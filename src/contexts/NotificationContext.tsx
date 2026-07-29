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
  rlsError: boolean;
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

const DEFAULT_VAPID_PUBLIC_KEY = 'BDw87VKhNLhk1oleZkQAi2WWwzgATjdzNP99qpFirocygPyJnhUfRjQHKVFTx6EdmeJAGSJdaEn2Ui4N8_OpFSk';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [browserPermission, setBrowserPermission] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');
  const [rlsError, setRlsError] = useState(false);
  const realtimeChannelRef = React.useRef<any>(null);
  const currentUserIdsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (user?.id) {
      const ids = new Set<string>([user.id]);
      if (user.email) {
        supabase
          .from('profiles')
          .select('id')
          .ilike('email', user.email.trim())
          .then(({ data, error }) => {
            if (!error && data) data.forEach(p => ids.add(p.id));
            currentUserIdsRef.current = ids;
          });
      } else {
        currentUserIdsRef.current = ids;
      }
    } else {
      currentUserIdsRef.current = new Set();
    }
  }, [user?.id, user?.email]);

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
          console.error('[WebPush] Failed to save push subscription to Supabase:', error.message);
        } else {
          console.log('[WebPush] Push subscription successfully saved in Supabase table!');
        }
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

    if (!('Notification' in window)) return;

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
        setBrowserPermission(permission as any);
      } catch (e) {
        console.warn('Could not request Notification permission:', e);
      }
    }

    if (permission !== 'granted') return;

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
        if (isInIframe) {
          toast.info('OS Device Alerts: Please open the app in a new browser tab to allow OS system popups.');
        }
      }
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
      checkDeadlines();

      const handleIncomingNotif = (newNotif: Notification) => {
        setNotifications(prev => {
          if (prev.some(n => n.id === newNotif.id || (n.title === newNotif.title && n.message === newNotif.message && Math.abs(new Date(n.created_at).getTime() - new Date(newNotif.created_at).getTime()) < 5000))) {
            return prev;
          }
          return [newNotif, ...prev];
        });

        // Auditory cue
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

        triggerNativePushNotification(newNotif.title, cleanMessage, metadata);
      };

      const channel = supabase
        .channel('notifications_changes', {
          config: { broadcast: { self: true } }
        })
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications'
        }, (payload) => {
          const newNotif = payload.new as Notification;
          if (currentUserIdsRef.current.has(newNotif.user_id)) {
            handleIncomingNotif(newNotif);
          }
        })
        .on('broadcast', { event: 'new_notification' }, (payload) => {
          const { recipientIds, notification } = payload.payload || {};
          const isTargeted = Array.isArray(recipientIds) && recipientIds.some(id => currentUserIdsRef.current.has(id));
          const isBroadcast = !recipientIds || recipientIds.length === 0;
          
          if (isTargeted || isBroadcast) {
            handleIncomingNotif({
              ...notification,
              user_id: user.id
            });
          }
        })
        .subscribe((status) => {
          console.log('[NotificationContext] Realtime subscription status:', status);
        });

      realtimeChannelRef.current = channel;

      return () => {
        supabase.removeChannel(channel);
        realtimeChannelRef.current = null;
      };
    }
  }, [user?.id, user?.role, user?.email]);

  const fetchNotifications = async () => {
    if (!user) return;
    
    const userIds = new Set<string>([user.id]);
    try {
      if (user.email) {
        const { data: matchedProfiles } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', user.email.trim());
        if (matchedProfiles) {
          matchedProfiles.forEach(p => userIds.add(p.id));
        }
      }
    } catch (e) {
      console.warn('Error fetching matching profile IDs:', e);
    }

    let query = supabase.from('notifications').select('*').in('user_id', Array.from(userIds));

    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    
    if (!error && data) {
      setNotifications(data);
    }
  };

  const checkDeadlines = async () => {
    if (!user) return;
    
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

    const resolveUserIds = async (nameOrId: string | null | undefined): Promise<string[]> => {
      if (!nameOrId || nameOrId === 'Unassigned' || nameOrId === 'N/A') return [];
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId);
      try {
        const { data: allProfiles, error } = await supabase.from('profiles').select('id, full_name, email, role');
        if (error || !allProfiles || allProfiles.length === 0) {
          if (isUuid) return [nameOrId];
          return [];
        }

        const matchedIds = new Set<string>();

        if (isUuid) {
          matchedIds.add(nameOrId);
          return Array.from(matchedIds);
        }

        const targetNorm = nameOrId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetNoH = targetNorm.replace(/h/g, '');
        const targetWords = nameOrId.trim().toLowerCase().split(/\s+/).filter(Boolean);

        for (const p of allProfiles) {
          const pRoleNorm = (p.role || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

          if (pRoleNorm && (pRoleNorm === targetNorm )) {
            matchedIds.add(p.id);
            continue;
          }

          if (p.email && p.email.trim().toLowerCase() === nameOrId.trim().toLowerCase()) {
            matchedIds.add(p.id);
            continue;
          }

          if (p.full_name) {
            const pNorm = p.full_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            const pNoH = pNorm.replace(/h/g, '');

            if (pNorm === targetNorm || pNoH === targetNoH) {
              matchedIds.add(p.id);
              continue;
            }

            const pWords = p.full_name.trim().toLowerCase().split(/\s+/).filter(Boolean);
            const hasWordMatch = targetWords.some(tw => 
              tw.length >= 3 && pWords.some(pw => pw.replace(/h/g, '') === tw.replace(/h/g, ''))
            );
            if (hasWordMatch) {
              matchedIds.add(p.id);
            }
          }
        }

        if (matchedIds.size > 0) {
          return Array.from(matchedIds);
        }
      } catch (e) {
        console.warn('[NotificationTable] Error resolving user ID:', nameOrId, e);
      }
      return isUuid ? [nameOrId] : [];
    };

    const recipientIds = new Set<string>();

    if (targetUserId) {
      const resolvedTarget = await resolveUserIds(targetUserId);
      resolvedTarget.forEach(id => recipientIds.add(id));
    }

    if (metadata?.assigned_to) {
      (await resolveUserIds(metadata.assigned_to)).forEach(id => recipientIds.add(id));
    }
    if (metadata?.task_assignee || metadata?.task_assigned_to) {
      (await resolveUserIds(metadata.task_assignee || metadata.task_assigned_to)).forEach(id => recipientIds.add(id));
    }
    if (metadata?.project_assignee) {
      (await resolveUserIds(metadata.project_assignee)).forEach(id => recipientIds.add(id));
    }

    const resolvedProjectId = metadata?.project_id || (metadata?.type === 'project' ? metadata?.id : null);
    if (resolvedProjectId || (metadata?.project_name && metadata?.project_name !== 'N/A')) {
      try {
        let pQuery = supabase.from('projects').select('assigned_to');
        if (resolvedProjectId) {
          pQuery = pQuery.eq('id', resolvedProjectId);
        } else if (metadata.project_name) {
          pQuery = pQuery.eq('name', metadata.project_name);
        }
        const { data: projData } = await pQuery.maybeSingle();
        if (projData?.assigned_to) {
          (await resolveUserIds(projData.assigned_to)).forEach(id => recipientIds.add(id));
        }
      } catch (e) {
        console.warn('[NotificationTable] Error resolving project lead:', e);
      }
    }

    const validUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const finalRecipientIds = Array.from(recipientIds).filter(id => validUuidRegex.test(id));

    if (finalRecipientIds.length === 0) {
      console.warn('[NotificationTable] No valid target recipient UUIDs found.');
      return;
    }


    // 1. ALWAYS Insert notification entries into Supabase DB client-side to use auth
    const newNotifications = finalRecipientIds.map(uId => ({
      user_id: uId,
      title,
      message: finalMessage,
      read: false
    }));

    const { error: batchError } = await supabase.from('notifications').insert(newNotifications);
    if (batchError) {
      console.warn('[NotificationTable] Batch DB insert error:', batchError.message || batchError);
      setRlsError(true);
      if (!batchError.message?.includes('duplicate')) {
        toast.error("Database RLS Policy Blocks Notifications. Run the SQL fix provided by the assistant.");
      }
    } else {
      console.log(`[NotificationTable] Successfully created ${newNotifications.length} notification record(s) in Supabase DB.`);
      fetchNotifications(); // update local state with new DB records
    }

    // 2. Realtime Broadcast to online devices

    try {
      const notifPayload = {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        title,
        message: finalMessage,
        read: false,
        created_at: new Date().toISOString()
      };

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.send({
          type: 'broadcast',
          event: 'new_notification',
          payload: {
            recipientIds: finalRecipientIds,
            notification: notifPayload
          }
        });
      }
    } catch (e) {
      console.warn('[NotificationTable] Realtime broadcast notice:', e);
    }

    // 3. Dispatch to Server Endpoint for Push Delivery across devices
    try {
      await fetch('/api/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientIds: finalRecipientIds,
          title,
          message,
          metadata
        })
      });
    } catch (apiErr) {
      console.warn('[NotificationTable] VAPID push API endpoint warning:', apiErr);
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
    triggerNativePushNotification(testTitle, testMsg);
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
      testPushNotification,
      rlsError
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
