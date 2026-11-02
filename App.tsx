/* App.tsx */
import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet, Text, TouchableOpacity, View, FlatList, Modal, TextInput,
  Alert, KeyboardAvoidingView, Platform, Vibration, ActivityIndicator,
} from "react-native";
import useBLE, { Message } from "./src/hooks/useBLE";
import { SafeAreaView } from "react-native-safe-area-context";
import SplashScreen from "./src/screens/SplashScreen";
import OnboardingScreen, { hasCompletedOnboarding } from "./src/screens/OnboardingScreen";
import BluetoothCheckScreen from "./src/screens/BluetoothCheckScreen";
import ProfileSetupScreen, { getUserProfile, UserProfile } from "./src/screens/ProfileSetupScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ChatScreen from "./src/screens/ChatScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { saveChatSession, StoredMessage } from "./src/utils/chatHistory";

type ScreenType = "splash" | "onboarding" | "profile_setup" | "bluetooth_check" | "home" | "chat" | "settings";

// Haptic patterns
const HAPTIC = {
  messageSent: [0, 30],
  messageReceived: [0, 80, 60, 80],
  chatRequest: [0, 200, 100, 200, 100, 200],
  connected: [0, 100, 50, 100],
  error: [0, 300],
};

export default function App() {
  const {
    requestPermissions, startDiscovery, stopDiscovery, connectToDevice, disconnect,
    sendMessage, sendChatRequest, acceptChatRequest, sendTypingIndicator, getDeviceDisplayName,
    allDevices, connectedDevice, connectionState, requestStatus, setRequestStatus,
    messages, partnerTyping, isEncrypted, partnerProfile,
  } = useBLE();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [screen, setScreen] = useState<ScreenType>("splash");
  const [isScanning, setIsScanning] = useState(false);
  const [outgoingPeer, setOutgoingPeer] = useState<{ id: string; name: string } | null>(null);
  const [outgoingStatus, setOutgoingStatus] = useState<'connecting' | 'waiting' | null>(null);
  const prevMessageCount = useRef(0);

  // --- Haptic feedback on new messages ---
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender === 'Partner') {
        Vibration.vibrate(HAPTIC.messageReceived);
      }
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  // --- Save chat history when messages change ---
  useEffect(() => {
    if (messages.length > 0 && connectedDevice) {
      const sessionMessages: StoredMessage[] = messages.map(m => ({
        id: m.id, sender: m.sender, text: m.text,
        timestamp: m.timestamp, status: m.status,
      }));
      saveChatSession({
        deviceId: connectedDevice.id,
        deviceName: partnerProfile?.name || getDeviceDisplayName(connectedDevice),
        messages: sessionMessages,
        lastActive: Date.now(),
      });
    }
  }, [messages, connectedDevice, partnerProfile]);

  // --- Navigate to chat when request accepted ---
  useEffect(() => {
    if (requestStatus === "ACCEPTED") {
      setOutgoingStatus(null);
      setOutgoingPeer(null);
      Vibration.vibrate(HAPTIC.connected);
      setScreen("chat");
    }
  }, [requestStatus]);

  // --- Dismiss outgoing modal only if explicitly disconnected before acceptance ---
  useEffect(() => {
    if (outgoingStatus && connectionState === 'disconnected') {
      setOutgoingStatus(null);
      setOutgoingPeer(null);
    }
  }, [connectionState, outgoingStatus]);

  // --- Navigate back to home when chat ends or connection drops ---
  useEffect(() => {
    if (screen === "chat" && (requestStatus !== "ACCEPTED" || connectionState === 'disconnected')) {
      setScreen("home");
    }
  }, [screen, requestStatus, connectionState]);

  // --- Handle splash completion ---
  const handleSplashComplete = async () => {
    const onboarded = await hasCompletedOnboarding();
    if (onboarded) {
      const savedProfile = await getUserProfile();
      if (savedProfile) {
        setProfile(savedProfile);
        setScreen("bluetooth_check");
      } else {
        setScreen("profile_setup");
      }
    } else {
      setScreen("onboarding");
    }
  };

  const handleOnboardingComplete = () => setScreen("profile_setup");

  const handleProfileComplete = (p: UserProfile) => {
    setProfile(p);
    setScreen("bluetooth_check");
  };

  const handleBluetoothCheckComplete = () => setScreen("home");

  // --- Scanning ---
  const handleStartScanning = async () => {
    if (isScanning) {
      stopDiscovery();
      setIsScanning(false);
      return;
    }
    const granted = await requestPermissions();
    if (granted) {
      setIsScanning(true);
      startDiscovery(profile?.name || "AirChat User");
    } else {
      Alert.alert("Permission Denied", "Bluetooth permissions are required.");
    }
  };

  // --- Connect ---
  const handleConnect = async (device: any) => {
    if (connectionState === 'connecting' || connectionState === 'connected' || outgoingStatus !== null) {
      return;
    }
    const peerName = getDeviceDisplayName(device);
    setIsScanning(false);
    setOutgoingPeer({ id: device.id, name: peerName });
    setOutgoingStatus('connecting');

    try {
      const connected = await connectToDevice(device);
      if (!connected) {
        setOutgoingStatus(null);
        setOutgoingPeer(null);
        Vibration.vibrate(HAPTIC.error);
        Alert.alert("Connection Failed", `Could not connect to ${peerName}. Please tap to try again.`);
        return;
      }

      // Step 2: Connected! Send chat request
      setOutgoingStatus('waiting');
      await sendChatRequest(connected, {
        name: profile?.name || 'AirChat User',
        avatar: profile?.avatar || '😎',
      });
      console.log(`[CONNECT] Request delivered to ${peerName}, waiting for acceptance...`);
    } catch (sendErr) {
      console.log("[CONNECT] Error during connection or request delivery:", sendErr);
      setOutgoingStatus(null);
      setOutgoingPeer(null);
      Vibration.vibrate(HAPTIC.error);
      Alert.alert("Request Failed", `Could not deliver chat request to ${peerName}. Please make sure both phones have AirChat open and try again.`);
    }
  };

  // --- Cancel Outgoing Request ---
  const handleCancelOutgoing = async () => {
    setOutgoingStatus(null);
    setOutgoingPeer(null);
    await disconnect();
  };

  // --- Accept Request ---
  const handleAcceptRequest = () => {
    Vibration.vibrate(HAPTIC.connected);
    setIsScanning(false);
    acceptChatRequest({
      name: profile?.name || 'AirChat User',
      avatar: profile?.avatar || '😎',
    });
    setScreen("chat");
  };

  // --- Chat callbacks ---
  const handleChatSend = (text: string) => {
    sendMessage(text);
  };

  const handleChatTyping = () => {
    sendTypingIndicator();
  };

  // --- Disconnect ---
  const handleDisconnect = () => {
    Alert.alert("Disconnect", "Are you sure you want to end this chat?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect", style: "destructive", onPress: () => {
          disconnect();
          setIsScanning(false);
          setScreen("home");
        },
      },
    ]);
  };

  // --- Settings ---
  const handleSettings = () => setScreen("settings");

  const handleSettingsBack = () => setScreen("home");

  const handleProfileUpdate = (p: UserProfile) => setProfile(p);

  // --- Bump to connect ---
  const handleBumpConnect = () => {
    if (connectionState === 'connecting' || connectionState === 'connected') {
      return;
    }
    if (allDevices.length > 0) {
      // Auto-connect to the strongest signal (closest) device on bump
      const sorted = [...allDevices].sort((a, b) => (b.rssi ?? -100) - (a.rssi ?? -100));
      handleConnect(sorted[0]);
    } else {
      Alert.alert('No devices found', 'Bump detected! But no nearby devices were found yet. Keep scanning.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>

      {/* ============ SPLASH ============ */}
      {screen === "splash" && (
        <SplashScreen onComplete={handleSplashComplete} />
      )}

      {/* ============ ONBOARDING ============ */}
      {screen === "onboarding" && (
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      )}

      {/* ============ PROFILE SETUP ============ */}
      {screen === "profile_setup" && (
        <ProfileSetupScreen onComplete={handleProfileComplete} />
      )}

      {/* ============ BLUETOOTH CHECK ============ */}
      {screen === "bluetooth_check" && (
        <BluetoothCheckScreen onComplete={handleBluetoothCheckComplete} />
      )}

      {/* ============ HOME (Radar + Recent Chats) ============ */}
      {screen === "home" && profile && (
        <HomeScreen
          profile={profile}
          isScanning={isScanning}
          devices={allDevices}
          bumpEnabled={true}
          onStartScanning={handleStartScanning}
          onDevicePress={handleConnect}
          onSettingsPress={handleSettings}
          onBumpConnect={handleBumpConnect}
          getDeviceDisplayName={getDeviceDisplayName}
        />
      )}

      {/* ============ SETTINGS ============ */}
      {screen === "settings" && profile && (
        <SettingsScreen
          profile={profile}
          onBack={handleSettingsBack}
          onProfileUpdate={handleProfileUpdate}
        />
      )}

      {/* ============ CHAT ============ */}
      {screen === "chat" && (
        <ChatScreen
          messages={messages}
          partnerTyping={partnerTyping}
          connectionState={connectionState}
          partnerName={partnerProfile?.name || outgoingPeer?.name || (connectedDevice ? getDeviceDisplayName(connectedDevice) : 'Nearby Peer')}
          partnerAvatar={partnerProfile?.avatar || '👤'}
          userName={profile?.name || 'User'}
          userAvatar={profile?.avatar || '😎'}
          isEncrypted={isEncrypted}
          onSend={handleChatSend}
          onTyping={handleChatTyping}
          onDisconnect={handleDisconnect}
        />
      )}

      {/* ============ MODAL: OUTGOING CONNECTING / WAITING ============ */}
      <Modal visible={outgoingStatus !== null} transparent animationType="fade">
        <View style={styles.modalCenter}>
          <View style={styles.modalBox}>
            <View style={styles.modalGlow} />

            <View style={styles.outgoingIconBox}>
              <Text style={styles.modalIcon}>
                {outgoingStatus === 'connecting' ? '📡' : '⏳'}
              </Text>
              <ActivityIndicator
                size="large"
                color="#7C5CFC"
                style={styles.outgoingSpinner}
              />
            </View>

            <Text style={styles.modalTitle} numberOfLines={1}>
              {outgoingStatus === 'connecting' ? 'Connecting...' : 'Request Sent'}
            </Text>

            <Text style={styles.modalSubtitle}>
              {outgoingStatus === 'connecting'
                ? `Connecting to ${outgoingPeer?.name || 'device'}...`
                : `Waiting for ${outgoingPeer?.name || 'them'} to accept...`}
            </Text>

            <TouchableOpacity
              style={styles.cancelOutgoingBtn}
              onPress={handleCancelOutgoing}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelOutgoingBtnText}>✕ Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ============ MODAL: CHAT REQUEST ============ */}
      <Modal visible={requestStatus === "RECEIVED"} transparent animationType="fade">
        <View style={styles.modalCenter}>
          <View style={styles.modalBox}>
            <View style={styles.modalGlow} />
            <Text style={styles.modalIcon}>{partnerProfile?.avatar || '🔔'}</Text>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {partnerProfile?.name ? partnerProfile.name : 'Chat Request!'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {partnerProfile?.name
                ? `${partnerProfile.name} wants to chat with you`
                : 'Someone nearby wants to chat with you'}
            </Text>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAcceptRequest}>
              <Text style={styles.acceptBtnText}>✓ Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={() => {
                setRequestStatus("NONE");
                disconnect();
              }}
            >
              <Text style={styles.rejectBtnText}>✕ Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A1A" },

  // --- Modal (Dark) ---
  modalCenter: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalBox: {
    width: 300, backgroundColor: "#1A1A2E", padding: 30,
    borderRadius: 24, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(124,92,252,0.15)',
    overflow: 'hidden',
  },
  modalGlow: {
    position: 'absolute', top: -40, width: 200, height: 200,
    borderRadius: 100, backgroundColor: 'rgba(124,92,252,0.08)',
  },
  modalIcon: { fontSize: 56, marginBottom: 6 },
  modalTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  modalSubtitle: {
    fontSize: 15, color: 'rgba(255,255,255,0.5)',
    textAlign: 'center', marginBottom: 20, lineHeight: 22,
  },
  outgoingIconBox: {
    alignItems: 'center',
    marginBottom: 4,
  },
  outgoingSpinner: {
    marginVertical: 8,
  },
  cancelOutgoingBtn: {
    marginTop: 6,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.35)',
    backgroundColor: 'rgba(255, 59, 48, 0.08)',
    width: '100%',
    alignItems: 'center',
  },
  cancelOutgoingBtnText: {
    color: '#FF6B6B',
    fontWeight: '700',
    fontSize: 16,
  },
  acceptBtn: {
    backgroundColor: '#34C759', paddingVertical: 16, width: '100%',
    alignItems: 'center', borderRadius: 14,
  },
  acceptBtnText: { color: 'white', fontWeight: '700', fontSize: 17 },
  rejectBtn: { marginTop: 14, paddingVertical: 10 },
  rejectBtnText: { color: '#FF3B30', fontWeight: '600', fontSize: 16 },
});