import { useEffect, useState } from 'react';
import { isBrowserOfflineNow } from '../utils/offlineGuards';

export function useBrowserOnlineStatus() {
  const [isOffline, setIsOffline] = useState(isBrowserOfflineNow);

  useEffect(() => {
    const update = () => setIsOffline(isBrowserOfflineNow());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return { isOffline, isOnline: !isOffline };
}
