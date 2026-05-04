import { useState, useEffect, useCallback } from 'react';

interface UsePWAReturn {
  canInstall: boolean;
  isInstalled: boolean;
  installApp: () => Promise<void>;
  isFullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
  isKioskMode: boolean;
  enterKioskMode: () => void;
  exitKioskMode: () => void;
}

export function usePWA(): UsePWAReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isKioskMode, setIsKioskMode] = useState(false);

  // Detect if already installed as PWA
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    setIsInstalled(mq.matches || (navigator as any).standalone === true);
    const handler = (e: MediaQueryListEvent) => setIsInstalled(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Capture the install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    const installedHandler = () => {
      setCanInstall(false);
      setIsInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  // Track fullscreen state
  useEffect(() => {
    const handler = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);
      // If fullscreen was exited externally (Escape), also exit kiosk mode
      if (!inFullscreen) setIsKioskMode(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Kiosk mode: block Escape key so user can't exit fullscreen accidentally
  useEffect(() => {
    if (!isKioskMode) return;
    const blockEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F11') {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    // Capture phase so we intercept before the browser handles it
    document.addEventListener('keydown', blockEscape, true);
    return () => document.removeEventListener('keydown', blockEscape, true);
  }, [isKioskMode]);

  const installApp = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  // Fullscreen only — Escape still works
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen not supported:', err);
    }
  }, []);

  // Kiosk mode — fullscreen + Escape blocked + exit only via button
  const enterKioskMode = useCallback(() => {
    setIsKioskMode(true);
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }, []);

  const exitKioskMode = useCallback(() => {
    setIsKioskMode(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  return {
    canInstall,
    isInstalled,
    installApp,
    isFullscreen,
    toggleFullscreen,
    isKioskMode,
    enterKioskMode,
    exitKioskMode,
  };
}
