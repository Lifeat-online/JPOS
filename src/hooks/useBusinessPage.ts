import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { AppConfig } from '../types';

interface BusinessPageData {
  tenantId: string | null;
  config: AppConfig | null;
  loading: boolean;
  notFound: boolean;
}

export function useBusinessPage(slug: string | undefined): BusinessPageData {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return; }

    // Look up slug → tenantId from the root slugs collection
    const slugDoc = doc(db, 'slugs', slug.toLowerCase());
    getDoc(slugDoc).then(snap => {
      if (!snap.exists() || !snap.data().tenantId) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const tid = snap.data().tenantId as string;
      setTenantId(tid);

      // Subscribe to the tenant's config
      const unsubscribe = onSnapshot(
        doc(db, 'tenants', tid, 'settings', 'app'),
        (configSnap) => {
          if (configSnap.exists()) {
            setConfig(configSnap.data() as AppConfig);
          }
          setLoading(false);
        },
        (err) => {
          console.error('Business page config error:', err);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    }).catch(err => {
      console.error('Slug lookup error:', err);
      setNotFound(true);
      setLoading(false);
    });
  }, [slug]);

  return { tenantId, config, loading, notFound };
}
