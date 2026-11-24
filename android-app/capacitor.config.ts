import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ethvelle.app',
  appName: 'Ethvelle',
  webDir: 'www',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
    backgroundColor: '#080B12'
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost'
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com']
    }
  }
};

export default config;
