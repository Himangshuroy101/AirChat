/* src/screens/OnboardingScreen.tsx */
import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions,
  TouchableOpacity, FlatList, StatusBar, NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_KEY = 'airchat_has_onboarded';

interface OnboardingScreenProps {
  onComplete: () => void;
}

interface Slide {
  id: string;
  icon: string;
  title: string;
  description: string;
  accentColor: string;
  bgAccent: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    icon: '📡',
    title: 'Chat Without\nInternet',
    description:
      'AirChat uses Bluetooth to let you send messages to people nearby — no Wi-Fi, no cellular data, no internet required.',
    accentColor: '#7C5CFC',
    bgAccent: 'rgba(124, 92, 252, 0.08)',
  },
  {
    id: '2',
    icon: '🛡️',
    title: 'Secure &\nPrivate',
    description:
      'Your messages travel directly between devices. No servers, no data collection, no accounts needed. Truly private conversations.',
    accentColor: '#00C9A7',
    bgAccent: 'rgba(0, 201, 167, 0.08)',
  },
  {
    id: '3',
    icon: '🚀',
    title: 'Ready to\nConnect?',
    description:
      'Just open AirChat on two devices, enable Bluetooth, and start chatting. It\'s that simple.',
    accentColor: '#FF6B6B',
    bgAccent: 'rgba(255, 107, 107, 0.08)',
  },
];

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(0)).current;

  // Per-slide entrance animations
  const iconEntrance = useRef(new Animated.Value(0)).current;
  const titleEntrance = useRef(new Animated.Value(0)).current;
  const descEntrance = useRef(new Animated.Value(0)).current;
  const iconBounce = useRef(new Animated.Value(0.5)).current;
  const ringPulse = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  // Fade in on mount + trigger first slide entrance
  useEffect(() => {
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start(() => {
      playEntranceAnimation();
    });
  }, []);

  // Play entrance animation when slide changes
  useEffect(() => {
    playEntranceAnimation();
  }, [currentIndex]);

  const playEntranceAnimation = () => {
    // Reset values
    iconEntrance.setValue(0);
    titleEntrance.setValue(0);
    descEntrance.setValue(0);
    iconBounce.setValue(0.5);

    Animated.sequence([
      // Icon bounces in
      Animated.parallel([
        Animated.spring(iconBounce, {
          toValue: 1,
          friction: 4,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(iconEntrance, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Title slides up
      Animated.timing(titleEntrance, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Description slides up
      Animated.timing(descEntrance, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Ring pulse loop
    const ringAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringPulse, {
            toValue: 1.3,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.5,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringPulse, {
            toValue: 0.8,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    ringAnim.start();
  };

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch (e) {
      console.log('[ONBOARDING] Failed to save state:', e);
    }

    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      handleComplete();
    }
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false },
  );

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const BOTTOM_BAR_HEIGHT = 160;
  const SLIDE_HEIGHT = SCREEN_HEIGHT - BOTTOM_BAR_HEIGHT;

  const renderSlide = ({ item, index }: { item: Slide; index: number }) => {
    const isActive = index === currentIndex;

    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH, height: SLIDE_HEIGHT }]}>
        {/* Decorative background circle */}
        <View
          style={[
            styles.bgCircle,
            { backgroundColor: item.bgAccent },
          ]}
        />

        {/* Animated ring behind icon (only on active slide) */}
        {isActive && (
          <Animated.View
            style={[
              styles.pulsingRing,
              {
                borderColor: item.accentColor + '30',
                transform: [{ scale: ringPulse }],
                opacity: ringOpacity,
              },
            ]}
          />
        )}

        {/* Icon */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              borderColor: item.accentColor + '30',
              backgroundColor: item.bgAccent,
              transform: isActive
                ? [{ scale: iconBounce }]
                : [{ scale: 0.8 }],
              opacity: isActive ? iconEntrance : 0.4,
            },
          ]}
        >
          <Text style={styles.icon}>{item.icon}</Text>
        </Animated.View>

        {/* Title */}
        <Animated.Text
          style={[
            styles.title,
            isActive
              ? {
                  opacity: titleEntrance,
                  transform: [
                    {
                      translateY: titleEntrance.interpolate({
                        inputRange: [0, 1],
                        outputRange: [30, 0],
                      }),
                    },
                  ],
                }
              : { opacity: 0 },
          ]}
        >
          {item.title}
        </Animated.Text>

        {/* Description */}
        <Animated.Text
          style={[
            styles.description,
            isActive
              ? {
                  opacity: descEntrance,
                  transform: [
                    {
                      translateY: descEntrance.interpolate({
                        inputRange: [0, 1],
                        outputRange: [25, 0],
                      }),
                    },
                  ],
                }
              : { opacity: 0 },
          ]}
        >
          {item.description}
        </Animated.Text>
      </View>
    );
  };

  const currentSlide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A1A" />

      {/* Background */}
      <View style={styles.bg} />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleComplete}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        bounces={false}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        style={styles.flatList}
        extraData={currentIndex}
      />

      {/* Bottom section */}
      <View style={styles.bottom}>
        {/* Pagination dots */}
        <View style={styles.pagination}>
          {SLIDES.map((slide, index) => {
            const dotWidth = scrollX.interpolate({
              inputRange: [
                (index - 1) * SCREEN_WIDTH,
                index * SCREEN_WIDTH,
                (index + 1) * SCREEN_WIDTH,
              ],
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });

            const dotOpacity = scrollX.interpolate({
              inputRange: [
                (index - 1) * SCREEN_WIDTH,
                index * SCREEN_WIDTH,
                (index + 1) * SCREEN_WIDTH,
              ],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={slide.id}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: currentSlide.accentColor,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Action button */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            { backgroundColor: currentSlide.accentColor },
          ]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
          <Text style={styles.actionBtnIcon}>→</Text>
        </TouchableOpacity>
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
  skipBtn: {
    position: 'absolute',
    top: 55,
    right: 24,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontWeight: '600',
  },
  flatList: {
    flex: 1,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  bgCircle: {
    position: 'absolute',
    top: '15%',
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.85,
    borderRadius: SCREEN_WIDTH * 0.425,
    opacity: 0.4,
  },
  pulsingRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 56,
    borderWidth: 2,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    marginBottom: 40,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  // Bottom
  bottom: {
    paddingBottom: 50,
    paddingHorizontal: 30,
    alignItems: 'center',
    backgroundColor: '#0A0A1A',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  actionBtnIcon: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
});
