import { useState, useEffect } from 'react';
import { AppConfig } from '../types';
import { getTenantConfig, getTenantIdBySlug } from '../api';

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
    let isMounted = true;
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function resolveTenant() {
      try {
        const slugResult = await getTenantIdBySlug(slug.toLowerCase());
        const tid = slugResult.tenantId;
        if (!tid) {
          if (isMounted) {
            setNotFound(true);
            setLoading(false);
          }
          return;
        }

        if (isMounted) {
          setTenantId(tid);
        }

        const configResult = await getTenantConfig(tid);
        if (isMounted) {
          setConfig(configResult);
          setLoading(false);
        }
      } catch (err) {
        console.error('Business page lookup error:', err);
        if (isMounted) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    resolveTenant();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  return { tenantId, config, loading, notFound };
}
