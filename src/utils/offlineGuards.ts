export const WALLET_ONLINE_REQUIRED_MESSAGE =
  'Wallet actions require an online connection so balances, cash movements, payouts, and refunds stay accurate.';

export function isBrowserOfflineNow() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function getWalletOnlineRequiredMessage(offline = isBrowserOfflineNow()) {
  return offline ? WALLET_ONLINE_REQUIRED_MESSAGE : null;
}
