/* src/components/QuickSharePanel.tsx */
import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import * as Location from 'expo-location';

interface Props {
  userName: string;
  userAvatar: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

export default function QuickSharePanel({ userName, userAvatar, onSend, onClose }: Props) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState<'menu' | 'contact' | 'location'>('menu');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loadingLocation, setLoadingLocation] = useState(false);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1, friction: 7, tension: 50, useNativeDriver: true,
    }).start();
  }, []);

  const close = () => {
    Animated.timing(slideAnim, {
      toValue: 0, duration: 200, useNativeDriver: true,
    }).start(onClose);
  };

  const handleShareContact = () => {
    const parts = [`📇 Contact Card`, `Name: ${userName}`];
    if (phone.trim()) parts.push(`Phone: ${phone.trim()}`);
    if (email.trim()) parts.push(`Email: ${email.trim()}`);
    onSend(parts.join('\n'));
    close();
  };

  const handleShareLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed to share your location.');
        setLoadingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = loc.coords.latitude.toFixed(6);
      const lng = loc.coords.longitude.toFixed(6);
      const msg = `📍 My Location\nhttps://maps.google.com/?q=${lat},${lng}\n(${lat}, ${lng})`;
      onSend(msg);
      close();
    } catch (e) {
      Alert.alert('Error', 'Could not get your location. Please try again.');
    }
    setLoadingLocation(false);
  };

  const handleSosMessage = () => {
    onSend('🆘 I need help! Please come to my location.');
    close();
  };

  const panelStyle = {
    opacity: slideAnim,
    transform: [{
      translateY: slideAnim.interpolate({
        inputRange: [0, 1], outputRange: [200, 0],
      }),
    }],
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={close} activeOpacity={1} />
      <Animated.View style={[styles.panel, panelStyle]}>

        {/* Handle bar */}
        <View style={styles.handleBar} />

        {mode === 'menu' && (
          <>
            <Text style={styles.title}>Quick Share</Text>

            <View style={styles.grid}>
              <TouchableOpacity style={styles.shareItem} onPress={() => setMode('contact')}>
                <View style={[styles.shareIcon, { backgroundColor: 'rgba(124,92,252,0.12)' }]}>
                  <Text style={styles.shareEmoji}>📇</Text>
                </View>
                <Text style={styles.shareLabel}>Contact</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareItem} onPress={handleShareLocation}>
                <View style={[styles.shareIcon, { backgroundColor: 'rgba(0,201,167,0.12)' }]}>
                  {loadingLocation ? (
                    <ActivityIndicator size="small" color="#00C9A7" />
                  ) : (
                    <Text style={styles.shareEmoji}>📍</Text>
                  )}
                </View>
                <Text style={styles.shareLabel}>Location</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareItem} onPress={handleSosMessage}>
                <View style={[styles.shareIcon, { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                  <Text style={styles.shareEmoji}>🆘</Text>
                </View>
                <Text style={styles.shareLabel}>SOS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.shareItem}
                onPress={() => { onSend('👋 Hey, nice to meet you!'); close(); }}
              >
                <View style={[styles.shareIcon, { backgroundColor: 'rgba(255,165,0,0.12)' }]}>
                  <Text style={styles.shareEmoji}>👋</Text>
                </View>
                <Text style={styles.shareLabel}>Greet</Text>
              </TouchableOpacity>
            </View>

            {/* Quick phrases */}
            <Text style={styles.sectionLabel}>QUICK PHRASES</Text>
            <View style={styles.phrases}>
              {['Yes ✓', 'No ✗', 'OMW! 🏃', "Can't talk rn", 'Call me 📞', 'Thanks! 🙏'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={styles.phraseChip}
                  onPress={() => { onSend(p); close(); }}
                >
                  <Text style={styles.phraseText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {mode === 'contact' && (
          <>
            <View style={styles.contactHeader}>
              <TouchableOpacity onPress={() => setMode('menu')}>
                <Text style={styles.backArrow}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Share Contact</Text>
              <View style={{ width: 50 }} />
            </View>

            <View style={styles.contactPreview}>
              <Text style={styles.contactAvatar}>{userAvatar}</Text>
              <Text style={styles.contactName}>{userName}</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter email"
                placeholderTextColor="rgba(255,255,255,0.2)"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity style={styles.sendBtn} onPress={handleShareContact}>
              <Text style={styles.sendBtnText}>Send Contact Card</Text>
            </TouchableOpacity>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end', zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    backgroundColor: '#161628',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderBottomWidth: 0,
  },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 16,
  },
  title: {
    color: '#fff', fontSize: 20, fontWeight: '700',
    marginBottom: 20,
  },

  // Grid
  grid: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 24,
  },
  shareItem: { alignItems: 'center', flex: 1 },
  shareIcon: {
    width: 56, height: 56, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  shareEmoji: { fontSize: 26 },
  shareLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },

  // Phrases
  sectionLabel: {
    color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600',
    letterSpacing: 1, marginBottom: 10,
  },
  phrases: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  phraseChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  phraseText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },

  // Contact mode
  contactHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  backArrow: { color: '#7C5CFC', fontSize: 16, fontWeight: '600' },
  contactPreview: {
    alignItems: 'center', marginBottom: 20,
  },
  contactAvatar: { fontSize: 48, marginBottom: 8 },
  contactName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, color: '#fff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  sendBtn: {
    backgroundColor: '#7C5CFC', paddingVertical: 16,
    borderRadius: 14, alignItems: 'center', marginTop: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
