/* src/screens/BluetoothCheckScreen.tsx */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, TouchableOpacity,
  Platform, Linking, StatusBar, Dimensions, AppState, AppStateStatus,
} from 'react-native';
import * as Location from 'expo-location';
import { bleManager } from '../utils/bleManager';

const { width } = Dimensions.get('window');

interface BluetoothCheckScreenProps {
  onComplete: () => void;
}

type CheckState = 'checking' | 'ready' | 'bt_off' | 'loc_off' | 'all_off';

export default function BluetoothCheckScreen({ onComplete }: BluetoothCheckScreenProps) {
  const [checkState, setCheckState] = useState<CheckState>('checking');

  // Animations
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.5)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const checkingDotOpacity = useRef(new Animated.Value(0.3)).current;
  const hasCompletedRef = useRef(false);

  // Content entrance animation
  const animateContentIn = useCallback(() => {
    iconScale.setValue(0.5);
    iconOpacity.setValue(0);
    contentOpacity.setValue(0);
    contentTranslateY.setValue(30);

    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: 0,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentTranslateY, iconOpacity, iconScale]);

  // Checking dots animation
  useEffect(() => {
    if (checkState === 'checking') {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(checkingDotOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(checkingDotOpacity, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }
  }, [checkState, checkingDotOpacity]);

  // Fade in on mount
  useEffect(() => {
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [screenOpacity]);

  // Warning pulse animation
  useEffect(() => {
    if (checkState === 'bt_off' || checkState === 'loc_off' || checkState === 'all_off') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.5,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.4,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [checkState, pulseAnim, pulseOpacity]);

  // Check both Bluetooth and Location Services
  const performCheck = useCallback(async () => {
    let isBtOn = false;
    try {
      const state = await bleManager.state();
      isBtOn = state === 'PoweredOn';
    } catch {
      isBtOn = false;
    }

    let isLocOn = true;
    if (Platform.OS === 'android') {
      try {
        isLocOn = await Location.hasServicesEnabledAsync();
      } catch {
        isLocOn = false;
      }
    }

    console.log(`[BT_CHECK] BT: ${isBtOn}, Location: ${isLocOn}`);

    if (isBtOn && isLocOn) {
      if (hasCompletedRef.current) return;
      setCheckState('ready');
      animateContentIn();

      // Auto-advance
      setTimeout(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        Animated.timing(screenOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          onComplete();
        });
      }, 800);
    } else if (!isBtOn && !isLocOn) {
      setCheckState('all_off');
      animateContentIn();
    } else if (!isBtOn) {
      setCheckState('bt_off');
      animateContentIn();
    } else {
      setCheckState('loc_off');
      animateContentIn();
    }
  }, [animateContentIn, onComplete, screenOpacity]);

  // Initial check & BT state listener
  useEffect(() => {
    performCheck();

    const subscription = bleManager.onStateChange((state) => {
      console.log('[BT_CHECK] State change event:', state);
      performCheck();
    }, false);

    // Re-check when app returns to foreground from settings
    const appStateSub = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        performCheck();
      }
    });

    return () => {
      subscription.remove();
      appStateSub.remove();
    };
  }, [performCheck]);

  // Action handlers
  const handleEnableBluetooth = async () => {
    if (Platform.OS === 'android') {
      try {
        await bleManager.enable();
        setTimeout(performCheck, 1000);
      } catch (e) {
        Linking.openSettings();
      }
    } else {
      Linking.openURL('App-Prefs:Bluetooth');
    }
  };

  const handleEnableLocation = async () => {
    if (Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
        setTimeout(performCheck, 800);
      } catch (e) {
        Linking.openSettings();
      }
    } else {
      Linking.openSettings();
    }
  };

  const handleTryAgain = () => {
    setCheckState('checking');
    performCheck();
  };

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A1A" />
      <View style={styles.bg} />

      <View style={styles.content}>
        {/* Checking state */}
        {checkState === 'checking' && (
          <View style={styles.centerContent}>
            <View style={styles.checkingIconBox}>
              <Text style={styles.checkingIcon}>⚙️</Text>
            </View>
            <Animated.Text style={[styles.checkingText, { opacity: checkingDotOpacity }]}>
              Checking Bluetooth & Location...
            </Animated.Text>
          </View>
        )}

        {/* Both Ready */}
        {checkState === 'ready' && (
          <View style={styles.centerContent}>
            <Animated.View
              style={[
                styles.successIconBox,
                {
                  transform: [{ scale: iconScale }],
                  opacity: iconOpacity,
                },
              ]}
            >
              <Text style={styles.successIcon}>✅</Text>
            </Animated.View>
            <Animated.Text
              style={[
                styles.successTitle,
                {
                  opacity: contentOpacity,
                  transform: [{ translateY: contentTranslateY }],
                },
              ]}
            >
              All Systems Ready
            </Animated.Text>
            <Animated.Text
              style={[
                styles.successSubtitle,
                {
                  opacity: contentOpacity,
                  transform: [{ translateY: contentTranslateY }],
                },
              ]}
            >
              Bluetooth and Location are active!
            </Animated.Text>
          </View>
        )}

        {/* Bluetooth OFF */}
        {checkState === 'bt_off' && (
          <View style={styles.centerContent}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseOpacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.warningIconBox,
                {
                  transform: [{ scale: iconScale }],
                  opacity: iconOpacity,
                },
              ]}
            >
              <Text style={styles.warningIcon}>📴</Text>
            </Animated.View>
            <Animated.View
              style={{
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
                alignItems: 'center',
              }}
            >
              <Text style={styles.warningTitle}>Bluetooth is Off</Text>
              <Text style={styles.warningSubtitle}>
                AirChat requires Bluetooth to discover{'\n'}and chat with nearby people.
              </Text>
              <View style={styles.warningCard}>
                <Text style={styles.warningCardIcon}>⚠️</Text>
                <Text style={styles.warningCardText}>
                  Without Bluetooth, you won't be able to find or connect to nearby users.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.enableBtn}
                onPress={handleEnableBluetooth}
                activeOpacity={0.8}
              >
                <Text style={styles.enableBtnIcon}>ᛒ</Text>
                <Text style={styles.enableBtnText}>Enable Bluetooth</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tryAgainBtn}
                onPress={handleTryAgain}
                activeOpacity={0.7}
              >
                <Text style={styles.tryAgainText}>↻ Try Again</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Location OFF (Android BLE requirement) */}
        {checkState === 'loc_off' && (
          <View style={styles.centerContent}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseOpacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.warningIconBox,
                {
                  transform: [{ scale: iconScale }],
                  opacity: iconOpacity,
                },
              ]}
            >
              <Text style={styles.warningIcon}>📍</Text>
            </Animated.View>
            <Animated.View
              style={{
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
                alignItems: 'center',
              }}
            >
              <Text style={styles.warningTitle}>Location is Off</Text>
              <Text style={styles.warningSubtitle}>
                Android requires Location (GPS) to discover{'\n'}nearby Bluetooth devices.
              </Text>
              <View style={styles.infoCard}>
                <Text style={styles.infoCardIcon}>ℹ️</Text>
                <Text style={styles.infoCardText}>
                  AirChat does not track or store your location. Android requires this toggle enabled for BLE scanning to work.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.enableBtn, { backgroundColor: '#34C759' }]}
                onPress={handleEnableLocation}
                activeOpacity={0.8}
              >
                <Text style={styles.enableBtnIcon}>📍</Text>
                <Text style={styles.enableBtnText}>Turn On Location</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tryAgainBtn}
                onPress={handleTryAgain}
                activeOpacity={0.7}
              >
                <Text style={styles.tryAgainText}>↻ Try Again</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* Both Bluetooth AND Location OFF */}
        {checkState === 'all_off' && (
          <View style={styles.centerContent}>
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  opacity: pulseOpacity,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.warningIconBox,
                {
                  transform: [{ scale: iconScale }],
                  opacity: iconOpacity,
                },
              ]}
            >
              <Text style={styles.warningIcon}>⚠️</Text>
            </Animated.View>
            <Animated.View
              style={{
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
                alignItems: 'center',
              }}
            >
              <Text style={styles.warningTitle}>Setup Required</Text>
              <Text style={styles.warningSubtitle}>
                Both Bluetooth and Location Services{'\n'}must be turned on for AirChat.
              </Text>
              <TouchableOpacity
                style={styles.enableBtn}
                onPress={handleEnableBluetooth}
                activeOpacity={0.8}
              >
                <Text style={styles.enableBtnIcon}>ᛒ</Text>
                <Text style={styles.enableBtnText}>1. Enable Bluetooth</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.enableBtn, { backgroundColor: '#34C759', marginTop: -4 }]}
                onPress={handleEnableLocation}
                activeOpacity={0.8}
              >
                <Text style={styles.enableBtnIcon}>📍</Text>
                <Text style={styles.enableBtnText}>2. Enable Location</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tryAgainBtn}
                onPress={handleTryAgain}
                activeOpacity={0.7}
              >
                <Text style={styles.tryAgainText}>↻ Try Again</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A1A',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  centerContent: {
    alignItems: 'center',
  },

  // Checking
  checkingIconBox: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: 'rgba(124, 92, 252, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkingIcon: {
    fontSize: 48,
  },
  checkingText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },

  // Success
  successIconBox: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(52, 199, 89, 0.3)',
    marginBottom: 24,
  },
  successIcon: {
    fontSize: 56,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Warning
  pulseRing: {
    position: 'absolute',
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    backgroundColor: 'rgba(255, 107, 107, 0.05)',
  },
  warningIconBox: {
    width: 120,
    height: 120,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    marginBottom: 24,
  },
  warningIcon: {
    fontSize: 56,
  },
  warningTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  warningSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    maxWidth: width - 80,
  },
  warningCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningCardText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 20,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.2)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    maxWidth: width - 80,
  },
  infoCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  infoCardText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 19,
  },
  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 16,
    width: width - 80,
    gap: 10,
    marginBottom: 16,
  },
  enableBtnIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  enableBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  tryAgainBtn: {
    paddingVertical: 14,
    paddingHorizontal: 30,
  },
  tryAgainText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 16,
    fontWeight: '600',
  },
});
