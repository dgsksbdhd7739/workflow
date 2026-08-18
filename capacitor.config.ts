import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mesut.workflow',
  appName: 'WorkFlow',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
    },
  },
};

export default config;
