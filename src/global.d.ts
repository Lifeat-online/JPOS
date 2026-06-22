interface DesktopRuntimeInfo {
  isDesktop: boolean;
  packaged: boolean;
  platform: string;
  userDataPath: string;
  storageBackend: "electron-file";
  desktopDeviceId: string;
}

interface MaseposDesktopBridge {
  getRuntimeInfo(): DesktopRuntimeInfo;
  storageGetItem?(key: string): string | null;
  storageSetItem?(key: string, value: string): void;
  storageRemoveItem?(key: string): void;
}

interface Window {
  maseposDesktop?: MaseposDesktopBridge;
}
