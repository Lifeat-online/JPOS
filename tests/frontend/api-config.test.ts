import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiUrl,
  apiUrls,
  getApiTargets,
  getDeploymentMode,
  getSocketBaseUrl,
  setPreferredApiTarget,
} from '../../src/apiConfig';

describe('apiConfig', () => {
  afterEach(() => {
    setPreferredApiTarget(null);
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('keeps same-origin API paths unchanged by default', () => {
    expect(apiUrl('/api/health')).toBe('/api/health');
  });

  it('prefixes relative API paths when a mobile API base URL is configured', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.masepos.test/');

    expect(apiUrl('/api/health')).toBe('https://api.masepos.test/api/health');
    expect(apiUrl('api/health')).toBe('https://api.masepos.test/api/health');
  });

  it('does not rewrite absolute URLs', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.masepos.test');

    expect(apiUrl('https://other.example/api/health')).toBe('https://other.example/api/health');
  });

  it('uses explicit socket URL before falling back to the API base URL', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.masepos.test');
    vi.stubEnv('VITE_SOCKET_URL', 'https://socket.masepos.test/');

    expect(getSocketBaseUrl()).toBe('https://socket.masepos.test');
  });

  it('orders hybrid targets as on-prem first, then cloud, then same-origin by default', () => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'hybrid');
    vi.stubEnv('VITE_ON_PREM_API_BASE_URL', 'http://pos-box.local:8080/');
    vi.stubEnv('VITE_CLOUD_API_BASE_URL', 'https://cloud.masepos.test/');

    expect(getDeploymentMode()).toBe('hybrid');
    expect(getApiTargets()).toEqual([
      { kind: 'on-prem', baseUrl: 'http://pos-box.local:8080' },
      { kind: 'cloud', baseUrl: 'https://cloud.masepos.test' },
      { kind: 'same-origin', baseUrl: '' },
    ]);
    expect(apiUrl('/api/health')).toBe('http://pos-box.local:8080/api/health');
    expect(apiUrls('/api/health')).toEqual([
      'http://pos-box.local:8080/api/health',
      'https://cloud.masepos.test/api/health',
      '/api/health',
    ]);
  });

  it('lets operators prefer cloud first in hybrid mode', () => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'hybrid');
    vi.stubEnv('VITE_ON_PREM_API_BASE_URL', 'http://pos-box.local:8080');
    vi.stubEnv('VITE_CLOUD_API_BASE_URL', 'https://cloud.masepos.test');

    setPreferredApiTarget('cloud');

    expect(getApiTargets().map(target => target.kind)).toEqual(['cloud', 'on-prem', 'same-origin']);
    expect(apiUrl('/api/health')).toBe('https://cloud.masepos.test/api/health');
  });

  it('uses the on-prem endpoint as the only target in on-prem mode', () => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'on_prem');
    vi.stubEnv('VITE_ON_PREM_API_BASE_URL', 'http://register-server.local:8080');
    vi.stubEnv('VITE_CLOUD_API_BASE_URL', 'https://cloud.masepos.test');

    expect(getDeploymentMode()).toBe('on_prem');
    expect(getApiTargets()).toEqual([
      { kind: 'on-prem', baseUrl: 'http://register-server.local:8080' },
    ]);
    expect(apiUrls('/api/health')).toEqual(['http://register-server.local:8080/api/health']);
  });

  it('uses the primary API target as the socket fallback', () => {
    vi.stubEnv('VITE_DEPLOYMENT_MODE', 'hybrid');
    vi.stubEnv('VITE_ON_PREM_API_BASE_URL', 'http://pos-box.local:8080');
    vi.stubEnv('VITE_CLOUD_API_BASE_URL', 'https://cloud.masepos.test');

    expect(getSocketBaseUrl()).toBe('http://pos-box.local:8080');
  });
});
