type AppEnv = 'development' | 'staging' | 'production';

type EnvConfig = {
  API_BASE_URL: string;
  APP_ENV: AppEnv;
};

import { Platform } from 'react-native';

const isWeb = typeof document !== 'undefined';

// Android emulator uses 10.0.2.2 to reach host machine; iOS simulator uses localhost
const devApiHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const ENV_MAP: Record<AppEnv, EnvConfig> = {
  development: {
    API_BASE_URL: isWeb ? '' : `http://${devApiHost}:3001`,
    APP_ENV: 'development',
  },
  staging: {
    API_BASE_URL: 'https://staging-api.playconnect.in',
    APP_ENV: 'staging',
  },
  production: {
    API_BASE_URL: 'https://playconnect-8g17.onrender.com',
    APP_ENV: 'production',
  },
};

// Default to development; overridden by build flavor at build time
const CURRENT_ENV: AppEnv = (__DEV__ ? 'development' : 'production') as AppEnv;

export const env: EnvConfig = ENV_MAP[CURRENT_ENV] ?? ENV_MAP.development;

declare const __DEV__: boolean;
