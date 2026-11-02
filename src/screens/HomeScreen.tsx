/* src/screens/HomeScreen.tsx */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, Dimensions,
  TouchableOpacity, StatusBar, Alert,
} from 'react-native';
import { Device } from 'react-native-ble-plx';
import { UserProfile } from './ProfileSetupScreen';
import { ChatSession, getAllChatSessions } from '../utils/chatHistory';
import useBumpConnect from '../hooks/useBumpConnect';

const { width: SW } = Dimensions.get('window');

interface Props {
  profile: UserProfile;
  isScanning: boolean;
  devices: Device[];
  bumpEnabled: boolean;
  onStartScanning: () => void;
  onDevicePress: (device: Device) => void;
  onSettingsPress: () => void;
  onBumpConnect: () => void;
  getDeviceDisplayName: (device: Device) => string;
}

/* Animated radar ring */
const RadarRing = ({ delay, size }: { delay: number; size: number }) => {
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1, duration: 2500,
            easing: Easing.out(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0, duration: 2500,
            easing: Easing.in(Easing.ease), useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.3, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.radarRing,
        {
          width: size, height: size, borderRadius: size / 2,
          transform: [{ scale }], opacity,
        },
      ]}
    />
  );
};

export default function HomeScreen({
  profile, isScanning, devices, bumpEnabled, onStartScanning,
  onDevicePress, onSettingsPress, onBumpConnect, getDeviceDisplayName,
}: Props) {
  const screenOp = useRef(new Animated.Value(0)).current;
  const centerPulse = useRef(new Animated.Value(1)).current;
  const btnAnim = useRef(new Animated.Value(0)).current;
  const [recentChats, setRecentChats] = useState<ChatSession[]>([]);
  const bumpScaleAnim = useRef(new Animated.Value(0)).current;

  // Bump to connect
  const handleBump = useCallback(() => {
    // Flash the bump indicator
    Animated.sequence([
      Animated.spring(bumpScaleAnim, {
        toValue: 1, friction: 3, tension: 80, useNativeDriver: true,
      }),
      Animated.timing(bumpScaleAnim, {
        toValue: 0, duration: 1000, delay: 800, useNativeDriver: true,
      }),
    ]).start();
    onBumpConnect();
  }, [onBumpConnect]);

  const { bumpDetected } = useBumpConnect({
    enabled: bumpEnabled && isScanning,
    onBump: handleBump,
  });

  // Load recent chats
  useEffect(() => {
    getAllChatSessions().then(sessions => {
      setRecentChats(sessions.slice(0, 5));
    });
  }, []);

  useEffect(() => {
    Animated.timing(screenOp, {
      toValue: 1, duration: 500, useNativeDriver: true,
    }).start();

    Animated.spring(btnAnim, {
      toValue: 1, friction: 5, tension: 40, delay: 300, useNativeDriver: true,
    }).start();
  }, []);

  // Center icon pulse when scanning
  useEffect(() => {
    if (isScanning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(centerPulse, {
            toValue: 1.15, duration: 800,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(centerPulse, {
            toValue: 1, duration: 800,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      centerPulse.setValue(1);
    }
  }, [isScanning]);

  const formatTimeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Filter out any self-advertisements or nameless beacons
  const visibleDevices = devices.filter(d => {
    const name = (d.name || d.localName || '').trim();
    return name.length > 0 && name.toLowerCase() !== profile.name.trim().toLowerCase();
  });
  const sortedDevices = [...visibleDevices].sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100));

  return (
    <Animated.View style={[styles.root, { opacity: screenOp }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A1A" />
      <View style={styles.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.profileBadge}>
          <Text style={styles.profileAvatar}>{profile.avatar}</Text>
          <Text style={styles.profileName}>{profile.name}</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={onSettingsPress}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Radar Section */}
      <View style={styles.radarContainer}>
        {isScanning && (
          <>
            <RadarRing delay={0} size={260} />
            <RadarRing delay={800} size={260} />
            <RadarRing delay={1600} size={260} />
          </>
        )}
        {!isScanning && (
          <>
            <View style={[styles.staticRing, { width: 180, height: 180, borderRadius: 90 }]} />
            <View style={[styles.staticRing, { width: 240, height: 240, borderRadius: 120 }]} />
          </>
        )}
        <Animated.View
          style={[styles.radarCenter, { transform: [{ scale: centerPulse }] }]}
        >
          <Text style={styles.radarIcon}>{profile.avatar}</Text>
        </Animated.View>

        {/* Bump detected flash */}
        <Animated.View style={[
          styles.bumpBadge,
          {
            opacity: bumpScaleAnim,
            transform: [{ scale: bumpScaleAnim.interpolate({
              inputRange: [0, 1], outputRange: [0.5, 1],
            }) }],
          },
        ]}>
          <Text style={styles.bumpText}>🤜 BUMP!</Text>
        </Animated.View>

        {isScanning && (
          <View style={styles.deviceCountBadge}>
            <Text style={styles.deviceCountText}>
              {visibleDevices.length} {visibleDevices.length === 1 ? 'device' : 'devices'} nearby
            </Text>
          </View>
        )}
      </View>

      {/* Status */}
      <View style={styles.statusSection}>
        {isScanning ? (
          <Text style={styles.statusText}>🔍 Searching... bump phones to quick-connect!</Text>
        ) : (
          <Text style={styles.statusText}>Tap below to find nearby people</Text>
        )}
      </View>

      {/* Content area — either devices or recent chats */}
      <View style={styles.contentArea}>
        {/* Nearby devices (when scanning) */}
        {isScanning && visibleDevices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nearby ({visibleDevices.length})</Text>
            {sortedDevices.map(device => (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceCard}
                onPress={() => onDevicePress(device)}
                activeOpacity={0.7}
              >
                <Text style={styles.cardEmoji}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{getDeviceDisplayName(device)}</Text>
                  <Text style={styles.cardSub}>
                    {device.rssi ? `Signal: ${device.rssi} dBm • ` : ''}Tap to request chat
                  </Text>
                </View>
                <Text style={styles.cardChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent chats (when not scanning or no devices) */}
        {(!isScanning || visibleDevices.length === 0) && recentChats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Chats</Text>
            {recentChats.map(session => (
              <View key={session.deviceId} style={styles.recentCard}>
                <View style={styles.recentAvatar}>
                  <Text style={styles.recentAvatarText}>💬</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{session.deviceName}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {session.messages[session.messages.length - 1]?.text || 'No messages'}
                  </Text>
                </View>
                <Text style={styles.timeAgo}>{formatTimeAgo(session.lastActive)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Action Button */}
      <Animated.View style={[
        styles.btnContainer,
        {
          opacity: btnAnim,
          transform: [{ translateY: btnAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}>
        <TouchableOpacity
          style={[styles.actionBtn, isScanning && styles.actionBtnScanning]}
          onPress={onStartScanning}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>
            {isScanning ? '⏹ Stop Scanning' : '📡 Start Scanning'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>Both devices must open AirChat to connect</Text>
      </Animated.View>
    </Animated.View>
  );
}

const RADAR_SIZE = 220;

const styles = StyleSheet.create({
  root: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0A0A1A' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  profileBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  profileAvatar: { fontSize: 22 },
  profileName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingsBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
  },
  settingsIcon: { fontSize: 20 },

  // Radar
  radarContainer: {
    height: RADAR_SIZE + 40,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 6,
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: 'rgba(124,92,252,0.35)',
  },
  staticRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.12)',
  },
  radarCenter: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: 'rgba(124,92,252,0.15)',
    borderWidth: 2, borderColor: 'rgba(124,92,252,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  radarIcon: { fontSize: 32 },
  deviceCountBadge: {
    position: 'absolute', bottom: 0,
    backgroundColor: 'rgba(124,92,252,0.15)',
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(124,92,252,0.25)',
  },
  deviceCountText: { color: '#7C5CFC', fontSize: 13, fontWeight: '600' },
  bumpBadge: {
    position: 'absolute', top: 10,
    backgroundColor: 'rgba(0,201,167,0.2)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(0,201,167,0.4)',
  },
  bumpText: { color: '#00C9A7', fontSize: 18, fontWeight: '800' },

  // Status
  statusSection: { alignItems: 'center', marginTop: 4, marginBottom: 4 },
  statusText: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },

  // Content
  contentArea: { flex: 1, paddingHorizontal: 20 },
  section: { marginTop: 8 },
  sectionTitle: {
    color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },

  // Cards
  deviceCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  recentCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  recentAvatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(124,92,252,0.1)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  recentAvatarText: { fontSize: 18 },
  cardEmoji: { fontSize: 24, marginRight: 12 },
  cardName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cardSub: { color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 2 },
  cardChevron: { color: 'rgba(255,255,255,0.25)', fontSize: 24, fontWeight: '300' },
  timeAgo: { color: 'rgba(255,255,255,0.25)', fontSize: 12 },

  // Button
  btnContainer: { paddingHorizontal: 24, paddingBottom: 30, paddingTop: 8 },
  actionBtn: {
    backgroundColor: '#7C5CFC',
    paddingVertical: 18, borderRadius: 16, alignItems: 'center',
  },
  actionBtnScanning: {
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(255,107,107,0.3)',
  },
  actionBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  hint: {
    color: 'rgba(255,255,255,0.25)', fontSize: 12,
    textAlign: 'center', marginTop: 10,
  },
});
