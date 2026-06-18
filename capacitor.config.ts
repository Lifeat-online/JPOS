import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.masepos.app',
  appName: 'MasePOS',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    backgroundColor: '#020617',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
