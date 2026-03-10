import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { lightColors, darkColors } from '../theme';
import type { Colors } from '../theme';

export type ThemeMode = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  colors: Colors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const SERVICE = 'playconnect_theme';

const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  mode: 'system',
  setMode: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  // Load persisted preference
  useEffect(() => {
    Keychain.getGenericPassword({ service: SERVICE })
      .then((result) => {
        if (result && (result.password === 'light' || result.password === 'dark' || result.password === 'system')) {
          setModeState(result.password as ThemeMode);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    Keychain.setGenericPassword('theme', newMode, { service: SERVICE }).catch(() => {});
  }, []);

  const isDark = mode === 'system'
    ? systemScheme === 'dark'
    : mode === 'dark';

  const colors = isDark ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, isDark, mode, setMode }),
    [colors, isDark, mode, setMode],
  );

  // Don't render until preference is loaded to avoid flash
  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
