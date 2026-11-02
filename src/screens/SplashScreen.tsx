/* src/screens/SplashScreen.tsx */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions, StatusBar,
} from 'react-native';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onComplete: () => void;
}

/* Floating particle dot */
const Particle = ({ delay, x, size }: { delay: number; x: number; size: number }) => {
  const translateY = useRef(new Animated.Value(height + 50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -50,
            duration: 4000 + Math.random() * 3000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0.6,
              duration: 1000,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 3000 + Math.random() * 3000,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: x,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    />
  );
};

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  // Animation values
  const iconScale = useRef(new Animated.Value(0.3)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.5)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineTranslateY = useRef(new Animated.Value(30)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Stage 1: Icon appears with bounce
    Animated.sequence([
      Animated.delay(200),
      // Icon bounce in
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 4,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Glow ring pulse starts
      Animated.delay(100),
      // Title and tagline
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(taglineTranslateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // Hold for a moment
      Animated.delay(600),
      // Fade out entire screen
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 400,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
    });

    // Glow ring loop
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowScale, {
            toValue: 1.6,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(glowScale, {
            toValue: 0.8,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(glowOpacity, {
            toValue: 0.1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    glowAnim.start();

    return () => glowAnim.stop();
  }, []);

  // Generate particles
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    x: Math.random() * width,
    delay: Math.random() * 3000,
    size: 3 + Math.random() * 5,
  }));

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background gradient layers */}
      <View style={styles.bgLayer1} />
      <View style={styles.bgLayer2} />
      <View style={styles.bgLayer3} />

      {/* Particles */}
      {particles.map((p) => (
        <Particle key={p.id} x={p.x} delay={p.delay} size={p.size} />
      ))}

      {/* Center content */}
      <View style={styles.centerContent}>
        {/* Glow ring */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              transform: [{ scale: glowScale }],
              opacity: glowOpacity,
            },
          ]}
        />

        {/* App Icon */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              transform: [{ scale: iconScale }],
              opacity: iconOpacity,
            },
          ]}
        >
          <Text style={styles.icon}>📡</Text>
        </Animated.View>

        {/* App Name */}
        <Animated.Text
          style={[
            styles.appName,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          AirChat
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: taglineOpacity,
              transform: [{ translateY: taglineTranslateY }],
            },
          ]}
        >
          Connect Without Internet
        </Animated.Text>
      </View>

      {/* Bottom decoration */}
      <View style={styles.bottomDecor}>
        <View style={styles.decorLine} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  // Layered gradient using multiple views
  bgLayer1: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A1A',
  },
  bgLayer2: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A0A3E',
    opacity: 0.8,
  },
  bgLayer3: {
    position: 'absolute',
    top: -height * 0.3,
    left: -width * 0.3,
    width: width * 1.6,
    height: height * 0.8,
    borderRadius: height * 0.4,
    backgroundColor: '#2D1B69',
    opacity: 0.4,
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#7C5CFC',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#7C5CFC',
    backgroundColor: 'rgba(124, 92, 252, 0.08)',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 30,
    backgroundColor: 'rgba(124, 92, 252, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 252, 0.3)',
  },
  icon: {
    fontSize: 52,
  },
  appName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 24,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 8,
    letterSpacing: 1,
  },
  bottomDecor: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  decorLine: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(124, 92, 252, 0.3)',
  },
});
