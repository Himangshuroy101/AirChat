/* src/screens/ProfileSetupScreen.tsx */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions,
  TouchableOpacity, TextInput, StatusBar, Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SW } = Dimensions.get('window');
const PROFILE_KEY = 'airchat_user_profile';

const AVATARS = ['😎', '🦊', '🐱', '🦁', '🐸', '🤖', '👻', '🎭', '🦄', '🐼', '🦋', '🔥'];

export interface UserProfile {
  name: string;
  avatar: string;
}

export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    const data = await AsyncStorage.getItem(PROFILE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

interface Props {
  onComplete: (profile: UserProfile) => void;
}

export default function ProfileSetupScreen({ onComplete }: Props) {
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [error, setError] = useState('');

  const screenOp = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const avatarAnim = useRef(new Animated.Value(0)).current;
  const inputAnim = useRef(new Animated.Value(0)).current;
  const btnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenOp, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();

    Animated.stagger(150, [
      Animated.spring(titleAnim, {
        toValue: 1, friction: 6, tension: 50, useNativeDriver: true,
      }),
      Animated.spring(avatarAnim, {
        toValue: 1, friction: 6, tension: 50, useNativeDriver: true,
      }),
      Animated.spring(inputAnim, {
        toValue: 1, friction: 6, tension: 50, useNativeDriver: true,
      }),
      Animated.spring(btnAnim, {
        toValue: 1, friction: 6, tension: 50, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleContinue = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (trimmed.length > 20) {
      setError('Name must be 20 characters or less');
      return;
    }

    const profile: UserProfile = { name: trimmed, avatar: selectedAvatar };
    await saveUserProfile(profile);

    Animated.timing(screenOp, {
      toValue: 0, duration: 300, useNativeDriver: true,
    }).start(() => onComplete(profile));
  };

  const makeStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
    ],
  });

  return (
    <Animated.View style={[styles.root, { opacity: screenOp }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A1A" />
      <View style={styles.bg} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.content}>

          {/* Title */}
          <Animated.View style={[styles.titleSection, makeStyle(titleAnim)]}>
            <Text style={styles.greeting}>Welcome to AirChat 👋</Text>
            <Text style={styles.subtitle}>Set up your profile so nearby{'\n'}people can recognize you</Text>
          </Animated.View>

          {/* Avatar Picker */}
          <Animated.View style={[styles.avatarSection, makeStyle(avatarAnim)]}>
            <View style={styles.selectedAvatarBox}>
              <Text style={styles.selectedAvatarEmoji}>{selectedAvatar}</Text>
            </View>
            <View style={styles.avatarGrid}>
              {AVATARS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.avatarOption,
                    selectedAvatar === emoji && styles.avatarOptionActive,
                  ]}
                  onPress={() => setSelectedAvatar(emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.avatarOptionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>

          {/* Name Input */}
          <Animated.View style={[styles.inputSection, makeStyle(inputAnim)]}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={(t) => { setName(t); setError(''); }}
              placeholder="Enter your name..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              maxLength={20}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleContinue}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.charCount}>{name.length}/20</Text>
          </Animated.View>

          {/* Continue Button */}
          <Animated.View style={[styles.btnSection, makeStyle(btnAnim)]}>
            <TouchableOpacity
              style={[styles.btn, name.trim().length < 2 && styles.btnDisabled]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.btnTxt}>Continue</Text>
              <Text style={styles.btnArrow}>→</Text>
            </TouchableOpacity>
          </Animated.View>

        </View>
      </TouchableWithoutFeedback>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0A1A' },
  content: {
    flex: 1, paddingHorizontal: 30,
    justifyContent: 'center',
  },

  // Title
  titleSection: { marginBottom: 32 },
  greeting: {
    fontSize: 30, fontWeight: '800', color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.5)',
    lineHeight: 24,
  },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  selectedAvatarBox: {
    width: 90, height: 90, borderRadius: 28,
    backgroundColor: 'rgba(124,92,252,0.12)',
    borderWidth: 2, borderColor: 'rgba(124,92,252,0.4)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
  },
  selectedAvatarEmoji: { fontSize: 48 },
  avatarGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'center', gap: 10,
  },
  avatarOption: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarOptionActive: {
    borderColor: '#7C5CFC',
    backgroundColor: 'rgba(124,92,252,0.15)',
  },
  avatarOptionEmoji: { fontSize: 24 },

  // Input
  inputSection: { marginBottom: 28 },
  label: {
    fontSize: 14, fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 8, textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 18, color: '#FFFFFF',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  error: {
    color: '#FF6B6B', fontSize: 13, marginTop: 6, fontWeight: '500',
  },
  charCount: {
    color: 'rgba(255,255,255,0.25)', fontSize: 12,
    textAlign: 'right', marginTop: 4,
  },

  // Button
  btnSection: {},
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#7C5CFC', paddingVertical: 18, borderRadius: 16, gap: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  btnArrow: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
