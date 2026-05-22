import { apiDelete, apiPost, type PushNotificationStatus } from '../api';

type BrowserPushSupport = {
  supported: boolean;
  reason?: string;
};

let audioContext: AudioContext | null = null;

function basePath(path: string) {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${path.replace(/^\/+/, '')}`;
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise
      .then(value => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(null);
      });
  });
}

export function getBrowserPushSupport(publicKey?: string | null): BrowserPushSupport {
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'Service workers are not available in this browser.' };
  if (!('PushManager' in window)) return { supported: false, reason: 'Push notifications are not available in this browser.' };
  if (!('Notification' in window)) return { supported: false, reason: 'Notifications are not available in this browser.' };
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return { supported: false, reason: 'Push requires HTTPS, localhost, or 127.0.0.1.' };
  }
  if (!publicKey) return { supported: false, reason: 'Create VAPID keys before enrolling this browser.' };
  return { supported: true };
}

async function getPushServiceWorkerRegistration() {
  const ready = await timeout(navigator.serviceWorker.ready, 5000);
  if (ready) return ready;

  const scriptUrl = basePath('push-sw-addon.js');
  const scope = basePath('push/');
  return navigator.serviceWorker.register(scriptUrl, { scope });
}

export async function subscribeBrowserToPush(
  tenantId: string,
  publicKey: string,
  deviceLabel = 'Dev browser'
): Promise<PushNotificationStatus> {
  const support = getBrowserPushSupport(publicKey);
  if (!support.supported) throw new Error(support.reason || 'Browser push is not supported.');

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const registration = await getPushServiceWorkerRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  return apiPost<PushNotificationStatus>(`/api/mariadb/tenants/${tenantId}/push/subscriptions`, {
    subscription: subscription.toJSON(),
    deviceLabel,
  });
}

export async function unsubscribeBrowserFromPush(tenantId: string): Promise<PushNotificationStatus | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await timeout(navigator.serviceWorker.ready, 5000);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return null;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => false);
  return apiDelete<PushNotificationStatus>(`/api/mariadb/tenants/${tenantId}/push/subscriptions?endpoint=${encodeURIComponent(endpoint)}`);
}

export function playRealtimeAttention(pattern: number[] = [120, 60, 120]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}

  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    audioContext = audioContext || new AudioCtx();
    const ctx = audioContext;
    if (ctx.state === 'suspended') void ctx.resume();

    const start = ctx.currentTime + 0.02;
    [0, 0.18].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.12);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.13);
    });
  } catch {}
}
