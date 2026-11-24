/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'edu.uci.inf133.drift',
  appName: 'Drift',
  webDir: 'www',
  plugins: {
    LocalNotifications: {
      // Tint for the Android notification icon; matches the app's primary (key) color.
      iconColor: '#4FD1C5',
    },
  },
};

export default config;
