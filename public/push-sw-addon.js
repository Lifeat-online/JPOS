self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || "MasePOS";
  const data = {
    ...(payload.data || {}),
    url: payload.url || payload.data?.url || '/',
  };

  const options = {
    body: payload.body || 'New POS notification',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'masepos-notification',
    data,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [120, 60, 120],
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'masepos-push-notification', payload: { title, ...payload } });
        });
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const normalized = new URL(url, self.location.origin).href;
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'masepos-notification-open', url });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(normalized);
      return undefined;
    })
  );
});
