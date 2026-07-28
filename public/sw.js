// Background Service Worker for Web Push & VAPID Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for incoming Web Push events from the push service (triggered via VAPID protocol)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Purva Vedic Consultancy',
    body: 'You have a new update in your portal.',
    icon: '/notification-icon.svg',
    url: '/'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || data.message || '',
    icon: data.icon || '/notification-icon.svg',
    badge: '/notification-icon.svg',
    tag: data.tag || `push_${Date.now()}`,
    data: data,
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Purva Vedic Consultancy', options)
  );
});

// Handle notification click to focus or open the web app window
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
