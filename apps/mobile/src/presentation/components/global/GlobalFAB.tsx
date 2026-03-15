import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Pressable, StyleSheet, Animated, View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { AddNewOption } from './AddNewModal';
import { useFAB } from '../../context/FABContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, fontSizes, fontWeights, radius } from '../../theme';
import type { Colors } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

type MenuItemConfig = {
  key: AddNewOption;
  icon: string;
  label: string;
  ownerOnly?: boolean;
};

const MENU_ITEMS: MenuItemConfig[] = [
  { key: 'Event', icon: 'calendar-plus', label: 'Event' },
  { key: 'Enquiry', icon: 'account-question-outline', label: 'Enquiry' },
  { key: 'Expense', icon: 'calculator-variant-outline', label: 'Expense', ownerOnly: true },
  { key: 'Batch', icon: 'account-group-outline', label: 'Batch' },
  { key: 'Staff', icon: 'account-tie-outline', label: 'Staff', ownerOnly: true },
  { key: 'Student', icon: 'account-plus-outline', label: 'Student' },
];

const ITEM_HEIGHT = 52;
const ITEM_GAP = 8;

export function GlobalFAB() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isFABVisible } = useFAB();
  const [isOpen, setIsOpen] = useState(false);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const filteredItems = useMemo(
    () => MENU_ITEMS.filter((item) => !item.ownerOnly || isOwner),
    [isOwner],
  );

  // Animation values
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(filteredItems.map(() => new Animated.Value(0))).current;

  // Reset anims when items change
  useEffect(() => {
    if (!isOpen) {
      itemAnims.forEach((a) => a.setValue(0));
    }
  }, [isOpen, itemAnims]);

  const openMenu = useCallback(() => {
    setIsOpen(true);
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      ...itemAnims.map((anim, i) =>
        Animated.spring(anim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
          tension: 70,
          delay: i * 40,
        }),
      ),
    ]).start();
  }, [rotateAnim, overlayAnim, itemAnims]);

  const closeMenu = useCallback(() => {
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      ...itemAnims.map((anim) =>
        Animated.timing(anim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
      ),
    ]).start(() => setIsOpen(false));
  }, [rotateAnim, overlayAnim, itemAnims]);

  const toggleMenu = useCallback(() => {
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [isOpen, openMenu, closeMenu]);

  const handleSelect = useCallback(
    (option: AddNewOption) => {
      closeMenu();
      // Delay navigation slightly so close animation starts
      setTimeout(() => {
        switch (option) {
          case 'Student':
            navigation.navigate('Students', {
              screen: 'StudentForm',
              params: { mode: 'create' },
            });
            break;
          case 'Staff':
            navigation.navigate('More', {
              screen: 'StaffForm',
              params: { mode: 'create' },
            });
            break;
          case 'Batch':
            navigation.navigate('More', {
              screen: 'BatchForm',
              params: { mode: 'create' },
            });
            break;
          case 'Expense':
            navigation.navigate('More', { screen: 'ExpensesHome' });
            break;
          case 'Enquiry':
            navigation.navigate('More', { screen: 'AddEnquiry' });
            break;
          case 'Event':
            navigation.navigate('More', { screen: 'AddEvent' });
            break;
        }
      }, 150);
    },
    [navigation, closeMenu],
  );

  const rotateInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  if (!isFABVisible) return null;

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <Animated.View
          style={[
            styles.overlay,
            { opacity: overlayAnim },
          ]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
        </Animated.View>
      )}

      {/* Menu items stacked above FAB */}
      {isOpen &&
        filteredItems.map((item, index) => {
          const anim = itemAnims[index]!;
          const bottomOffset = 80 + 56 + 12 + index * (ITEM_HEIGHT + ITEM_GAP);
          const translateY = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [60, 0],
          });
          const scale = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 1],
          });

          return (
            <Animated.View
              key={item.key}
              style={[
                styles.menuItemContainer,
                {
                  bottom: bottomOffset,
                  opacity: anim,
                  transform: [{ translateY }, { scale }],
                },
              ]}
            >
              <Pressable
                style={styles.menuItem}
                onPress={() => handleSelect(item.key)}
                testID={`fab-${item.key.toLowerCase()}`}
                accessibilityLabel={`Add new ${item.label}`}
                accessibilityRole="button"
              >
                <Text style={styles.menuLabel}>{item.label}</Text>
                <View style={styles.menuIcon}>
                  {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
                  <Icon name={item.icon} size={22} color={colors.primary} />
                </View>
              </Pressable>
            </Animated.View>
          );
        })}

      {/* FAB button */}
      <Pressable
        style={[styles.fab, isOpen && styles.fabOpen]}
        onPress={toggleMenu}
        testID="global-fab"
        accessibilityLabel={isOpen ? 'Close menu' : 'Add new item'}
        accessibilityRole="button"
      >
        <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
          {/* @ts-expect-error react-native-vector-icons types incompatible with @types/react@19 */}
          <Icon name="plus" size={28} color={colors.white} />
        </Animated.View>
      </Pressable>
    </>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 90,
    },
    fab: {
      position: 'absolute',
      bottom: 80,
      right: 16,
      width: 56,
      height: 56,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.27,
      shadowRadius: 4.65,
      zIndex: 100,
    },
    fabOpen: {
      backgroundColor: colors.danger,
    },
    menuItemContainer: {
      position: 'absolute',
      right: 16,
      zIndex: 95,
      alignItems: 'flex-end',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      paddingLeft: spacing.base,
      paddingRight: spacing.xs,
      height: ITEM_HEIGHT,
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    menuLabel: {
      fontSize: fontSizes.base,
      fontWeight: fontWeights.semibold,
      color: colors.text,
      marginRight: spacing.md,
    },
    menuIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.full,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
