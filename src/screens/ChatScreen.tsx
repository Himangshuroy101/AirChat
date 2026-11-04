/* src/screens/ChatScreen.tsx */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions,
  TouchableOpacity, FlatList, TextInput, KeyboardAvoidingView,
  Platform, Vibration, Modal, Alert, Keyboard,
} from 'react-native';
import { Message } from '../hooks/useBLE';
import RichMessageBubble from '../components/RichMessageBubble';
import QuickSharePanel from '../components/QuickSharePanel';

const { width: SW } = Dimensions.get('window');

const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

interface Props {
  messages: Message[];
  partnerTyping: boolean;
  connectionState: string;
  partnerName: string;
  partnerAvatar: string;
  userName?: string;
  userAvatar?: string;
  isEncrypted?: boolean;
  onSend: (text: string) => void;
  onTyping: () => void;
  onDisconnect: () => void;
}

/* Animated message wrapper */
const AnimatedMessage = ({ children, index }: { children: React.ReactNode; index: number }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1, friction: 7, tension: 40,
      delay: Math.min(index * 30, 200),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{
      opacity: slideAnim,
      transform: [{
        translateY: slideAnim.interpolate({
          inputRange: [0, 1], outputRange: [20, 0],
        }),
      }],
    }}>
      {children}
    </Animated.View>
  );
};

export default function ChatScreen({
  messages, partnerTyping, connectionState,
  partnerName, partnerAvatar,
  userName, userAvatar, isEncrypted = false, onSend, onTyping, onDisconnect,
}: Props) {
  const [inputText, setInputText] = useState('');
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [showSharePanel, setShowSharePanel] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendBtnScale = useRef(new Animated.Value(1)).current;

  const handleSecurityInfo = () => {
    Alert.alert(
      "🔒 End-to-End Encrypted",
      "Messages, contact cards, and live GPS locations in this offline chat are secured with Curve25519 (X25519) key exchange and ChaCha20-Poly1305 AEAD encryption.\n\nNo nearby device, radio sniffer, or third party can intercept or tamper with your conversation.",
      [{ text: "OK" }]
    );
  };

  // Auto-scroll when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  // Auto-scroll when keyboard opens
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => sub.remove();
  }, []);

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(onTyping, 300);
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    Animated.sequence([
      Animated.timing(sendBtnScale, {
        toValue: 0.8, duration: 80, useNativeDriver: true,
      }),
      Animated.spring(sendBtnScale, {
        toValue: 1, friction: 3, tension: 100, useNativeDriver: true,
      }),
    ]).start();
    Vibration.vibrate([0, 30]);
    onSend(inputText.trim());
    setInputText('');
  };

  const handleReaction = (msgId: string, emoji: string) => {
    setReactions(prev => ({ ...prev, [msgId]: emoji }));
    setSelectedMsgId(null);
    Vibration.vibrate([0, 40]);
  };

  const getStatusColor = (): string => {
    switch (connectionState) {
      case 'connected': return '#34C759';
      case 'connecting': return '#FF9500';
      default: return '#FF3B30';
    }
  };

  const getStatusText = (): string => {
    switch (connectionState) {
      case 'connected': return '● Connected';
      case 'connecting': return '● Connecting...';
      case 'disconnected': return '● Reconnecting...';
      default: return '● Offline';
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' +
      d.getMinutes().toString().padStart(2, '0');
  };

  const getStatusIcon = (status: Message['status']) => {
    switch (status) {
      case 'sending': return '⏳';
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender === 'Me';
    const reaction = reactions[item.id];

    return (
      <AnimatedMessage index={index}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => setSelectedMsgId(item.id)}
          delayLongPress={400}
          style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}
        >
          <RichMessageBubble
            text={item.text}
            isMe={isMe}
            time={formatTime(item.timestamp)}
            statusIcon={isMe ? getStatusIcon(item.status) : undefined}
          />
          {reaction && (
            <View style={[styles.reactionBubble, isMe ? styles.reactionRight : styles.reactionLeft]}>
              <Text style={styles.reactionEmoji}>{reaction}</Text>
            </View>
          )}
        </TouchableOpacity>
      </AnimatedMessage>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      {/* Background pattern */}
      <View style={styles.bgPattern}>
        {Array.from({ length: 40 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bgDot,
              {
                left: (i % 8) * (SW / 7),
                top: Math.floor(i / 8) * 80 + 20,
              },
            ]}
          />
        ))}
      </View>

      {/* Header */}
      <View style={styles.chatHeader}>
        <View style={styles.headerLeft}>
          {/* Partner Avatar with Online/Status Badge */}
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>{partnerAvatar || '👤'}</Text>
            </View>
            <View style={[styles.onlineDot, { backgroundColor: getStatusColor() }]} />
          </View>

          {/* Partner Identity & Status Subtitle */}
          <View style={styles.headerDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.partnerNameText} numberOfLines={1}>
                {partnerName || 'Nearby Peer'}
              </Text>
              {isEncrypted && (
                <TouchableOpacity
                  onPress={handleSecurityInfo}
                  style={styles.e2eeBadge}
                  activeOpacity={0.7}
                >
                  <Text style={styles.e2eeBadgeText}>🔒 E2EE</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text
              style={[
                styles.statusSubtitle,
                { color: partnerTyping ? '#7C5CFC' : getStatusColor() },
              ]}
              numberOfLines={1}
            >
              {connectionState === 'connected'
                ? (partnerTyping ? '✏️ typing...' : '● Active nearby')
                : getStatusText()
              }
            </Text>
          </View>
        </View>

        {/* End / Disconnect Button */}
        <TouchableOpacity
          style={styles.disconnectBtn}
          onPress={onDisconnect}
          activeOpacity={0.7}
        >
          <Text style={styles.disconnectText}>✕ End</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesList}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatIcon}>{partnerAvatar || '👋'}</Text>
            <Text style={styles.emptyChatTitle}>Connected to {partnerName || 'Peer'}!</Text>
            <Text style={styles.emptyChatText}>Say hello or tap ＋ to share</Text>
            {isEncrypted && (
              <TouchableOpacity
                style={styles.emptySecurityNotice}
                onPress={handleSecurityInfo}
                activeOpacity={0.8}
              >
                <Text style={styles.emptySecurityIcon}>🛡️</Text>
                <Text style={styles.emptySecurityText}>
                  Messages are end-to-end encrypted with Curve25519 & ChaCha20-Poly1305.
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Typing indicator */}
      {partnerTyping && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>{partnerName || 'Partner'} is typing...</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputArea}>
        {/* Share button */}
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => setShowSharePanel(true)}
        >
          <Text style={styles.shareBtnText}>＋</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={handleTextChange}
          placeholder="Type a message..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          multiline
          maxLength={500}
        />
        <Animated.View style={{ transform: [{ scale: sendBtnScale }] }}>
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim()}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Quick Share Panel */}
      {showSharePanel && (
        <QuickSharePanel
          userName={userName || 'User'}
          userAvatar={userAvatar || '😎'}
          onSend={onSend}
          onClose={() => setShowSharePanel(false)}
        />
      )}

      {/* Reaction picker modal */}
      <Modal visible={selectedMsgId !== null} transparent animationType="fade">
        <TouchableOpacity
          style={styles.reactionOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMsgId(null)}
        >
          <View style={styles.reactionPicker}>
            {REACTIONS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionOption}
                onPress={() => selectedMsgId && handleReaction(selectedMsgId, emoji)}
              >
                <Text style={styles.reactionOptionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D1A' },

  bgPattern: { ...StyleSheet.absoluteFillObject },
  bgDot: {
    position: 'absolute', width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(124,92,252,0.04)',
  },

  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(124,92,252,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(124,92,252,0.3)',
  },
  avatarEmoji: {
    fontSize: 22,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0D0D1A',
  },
  headerDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  partnerNameText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: SW * 0.42,
  },
  e2eeBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.3)',
  },
  e2eeBadgeText: {
    color: '#34C759',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  statusSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  disconnectBtn: {
    backgroundColor: 'rgba(255,59,48,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  disconnectText: {
    color: '#FF3B30',
    fontWeight: '700',
    fontSize: 13,
  },

  messagesContainer: {
    flex: 1,
  },
  messagesList: { padding: 12, flexGrow: 1 },
  msgRow: { marginVertical: 4 },
  msgRowRight: { alignItems: 'flex-end' },
  msgRowLeft: { alignItems: 'flex-start' },

  reactionBubble: {
    position: 'absolute', bottom: -8,
    backgroundColor: '#1A1A2E', borderRadius: 12,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  reactionRight: { right: 8 },
  reactionLeft: { left: 8 },
  reactionEmoji: { fontSize: 14 },

  typingBar: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  typingText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },

  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyChatIcon: { fontSize: 56, marginBottom: 12 },
  emptyChatTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6 },
  emptyChatText: { fontSize: 14, color: 'rgba(255,255,255,0.35)' },
  emptySecurityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    backgroundColor: 'rgba(52, 199, 89, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.2)',
    maxWidth: 280,
  },
  emptySecurityIcon: { fontSize: 16 },
  emptySecurityText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },

  inputArea: {
    flexDirection: 'row', padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
    alignItems: 'flex-end',
  },
  shareBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(124,92,252,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8, borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.25)',
  },
  shareBtnText: { color: '#7C5CFC', fontSize: 22, fontWeight: '600' },
  input: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 22,
    paddingHorizontal: 18, paddingVertical: 12, fontSize: 16, maxHeight: 100,
    backgroundColor: 'rgba(255,255,255,0.06)', color: '#FFFFFF',
  },
  sendBtn: {
    backgroundColor: '#7C5CFC', width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  sendBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sendBtnText: { color: 'white', fontSize: 18, fontWeight: '700' },

  reactionOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  reactionPicker: {
    flexDirection: 'row', gap: 4,
    backgroundColor: '#1A1A2E', borderRadius: 20, padding: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionOption: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  reactionOptionEmoji: { fontSize: 28 },
});
