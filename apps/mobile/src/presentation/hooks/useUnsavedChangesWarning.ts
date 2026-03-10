import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

/**
 * Warns users before leaving a screen with unsaved form changes.
 * Uses the `beforeRemove` navigation event to intercept back navigation.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  const navigation = useNavigation();

  useEffect(() => {
    if (!hasUnsavedChanges || typeof navigation.addListener !== 'function') return;

    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to leave?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });

    return unsubscribe;
  }, [hasUnsavedChanges, navigation]);
}
