/* src/screens/SettingsScreen.tsx */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
  TextInput, StatusBar, Alert, ScrollView, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, saveUserProfile } from './ProfileSetupScreen';
import { clearChatHistory } from '../utils/chatHistory';

const AVATARS = ['😎', '🦊', '🐱', '🦁', '🐸', '🤖', '👻', '🎭', '🦄', '🐼', '🦋', '🔥'];

interface Props {
  profile: UserProfile;
  onBack: () => void;
  onProfileUpdate: (profile: UserProfile) => void;
}

export default function SettingsScreen({ profile, onBack, onProfileUpdate }: Props) {
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [showAvatars, setShowAvatars] = useState(false);
  const screenOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenOp, {
      toValue: 1, duration: 300, useNativeDriver: true,
    }).start();
  }, []);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert('Error', 'Name must be at least 2 characters');
      return;
    }
    const updated: UserProfile = { name: trimmed, avatar };
    await saveUserProfile(updated);
    onProfileUpdate(updated);
    Alert.alert('Saved', 'Profile updated!');
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Chat History',
      'This will delete all saved conversations. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: async () => {
            await clearChatHistory();
            Alert.alert('Done', 'Chat history cleared.');
          },
        },
      ],
    );
  };

  const handleResetOnboarding = () => {
    Alert.alert(
      'Reset Onboarding',
      'You\'ll see the onboarding screens again on next app launch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', onPress: async () => {
            await AsyncStorage.removeItem('airchat_has_onboarded');
            Alert.alert('Done', 'Onboarding will show on next launch.');
          },
        },
      ],
    );
  };

  const goBack = () => {
    Animated.timing(screenOp, {
      toValue: 0, duration: 200, useNativeDriver: true,
    }).start(onBack);
  };

  return (
    <Animated.View style={[styles.root, { opacity: screenOp }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A1A" />
      <View style={styles.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile Section */}
        <Text style={styles.sectionLabel}>PROFILE</Text>
        <View style={styles.card}>
          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarRow}
            onPress={() => setShowAvatars(!showAvatars)}
          >
            <View style={styles.currentAvatar}>
              <Text style={styles.avatarEmoji}>{avatar}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Avatar</Text>
              <Text style={styles.rowSub}>Tap to change</Text>
            </View>
            <Text style={styles.chevron}>{showAvatars ? '▴' : '▾'}</Text>
          </TouchableOpacity>

          {showAvatars && (
            <View style={styles.avatarGrid}>
              {AVATARS.map(e => (
                <TouchableOpacity
                  key={e}
                  style={[styles.avatarOption, avatar === e && styles.avatarActive]}
                  onPress={() => { setAvatar(e); setShowAvatars(false); }}
                >
                  <Text style={styles.avatarOptEmoji}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.divider} />

          {/* Name */}
          <View style={styles.nameRow}>
            <Text style={styles.rowTitle}>Display Name</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              maxLength={20}
              placeholderTextColor="rgba(255,255,255,0.2)"
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save Changes</Text>
          </TouchableOpacity>
        </View>

        {/* Data Section */}
        <Text style={styles.sectionLabel}>DATA</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.menuItem} onPress={handleClearHistory}>
            <Text style={styles.menuIcon}>🗑️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Clear Chat History</Text>
              <Text style={styles.rowSub}>Delete all saved conversations</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleResetOnboarding}>
            <Text style={styles.menuIcon}>🔄</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Reset Onboarding</Text>
              <Text style={styles.rowSub}>See the intro screens again</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.card}>
          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>📡</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>AirChat</Text>
              <Text style={styles.rowSub}>Version 1.0.0</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.menuItem}>
            <Text style={styles.menuIcon}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Privacy</Text>
              <Text style={styles.rowSub}>No servers, no data collection. Messages stay between devices.</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>Made with 💜 for offline communication</Text>

      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0A1A' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { paddingVertical: 4, paddingRight: 8 },
  backText: { color: '#7C5CFC', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

  scroll: { flex: 1, paddingHorizontal: 20 },

  sectionLabel: {
    color: 'rgba(255,255,255,0.35)', fontSize: 13, fontWeight: '600',
    letterSpacing: 1, marginTop: 24, marginBottom: 10, marginLeft: 4,
  },

  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  avatarRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
  },
  currentAvatar: {
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: 'rgba(124,92,252,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(124,92,252,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarEmoji: { fontSize: 28 },
  chevron: { color: 'rgba(255,255,255,0.3)', fontSize: 16 },

  avatarGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, paddingBottom: 12, gap: 8,
    justifyContent: 'center',
  },
  avatarOption: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarActive: {
    borderColor: '#7C5CFC',
    backgroundColor: 'rgba(124,92,252,0.15)',
  },
  avatarOptEmoji: { fontSize: 22 },

  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
  },

  nameRow: { padding: 16 },
  nameInput: {
    marginTop: 8, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },

  saveBtn: {
    margin: 16, marginTop: 4, backgroundColor: '#7C5CFC',
    paddingVertical: 14, borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 14,
  },
  menuIcon: { fontSize: 22 },

  rowTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  rowSub: { color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 2 },

  footer: {
    color: 'rgba(255,255,255,0.2)', fontSize: 13,
    textAlign: 'center', marginTop: 30, marginBottom: 40,
  },
});
