import { beforeEach, describe, expect, it } from 'vitest';

import {
  getWalletOnlineRequiredMessage,
  isBrowserOfflineNow,
  WALLET_ONLINE_REQUIRED_MESSAGE,
} from '../../src/utils/offlineGuards';

describe('offline wallet guards', () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  it('detects browser offline state for wallet actions', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    expect(isBrowserOfflineNow()).toBe(true);
    expect(getWalletOnlineRequiredMessage()).toBe(WALLET_ONLINE_REQUIRED_MESSAGE);
  });

  it('allows wallet action callers to clear the warning while online', () => {
    expect(isBrowserOfflineNow()).toBe(false);
    expect(getWalletOnlineRequiredMessage()).toBeNull();
    expect(getWalletOnlineRequiredMessage(false)).toBeNull();
  });
});
