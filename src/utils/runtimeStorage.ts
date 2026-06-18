export interface DesktopRuntimeInfo {
  isDesktop: boolean;
  packaged: boolean;
  platform: string;
  userDataPath: string;
  storageBackend: 'electron-file';
  desktopDeviceId: string;
}

function browserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getDesktopRuntimeInfo(): DesktopRuntimeInfo | null {
  try {
    return window.maseposDesktop?.getRuntimeInfo() || null;
  } catch {
    return null;
  }
}

export function readPersistentItem(key: string): string | null {
  const desktopValue = window.maseposDesktop?.storageGetItem?.(key);
  if (desktopValue !== undefined && desktopValue !== null) {
    return desktopValue;
  }
  return browserStorage()?.getItem(key) ?? null;
}

export function writePersistentItem(key: string, value: string) {
  if (window.maseposDesktop?.storageSetItem) {
    window.maseposDesktop.storageSetItem(key, value);
    return;
  }
  browserStorage()?.setItem(key, value);
}

export function removePersistentItem(key: string) {
  if (window.maseposDesktop?.storageRemoveItem) {
    window.maseposDesktop.storageRemoveItem(key);
    return;
  }
  browserStorage()?.removeItem(key);
}
