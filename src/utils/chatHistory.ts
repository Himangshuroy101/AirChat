/* src/utils/chatHistory.ts */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_HISTORY_KEY = 'airchat_chat_history';

export interface StoredMessage {
  id: string;
  sender: 'Me' | 'Partner';
  text: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered';
}

export interface ChatSession {
  deviceId: string;
  deviceName: string;
  messages: StoredMessage[];
  lastActive: number;
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  try {
    const existing = await getAllChatSessions();
    // Update or add session
    const idx = existing.findIndex(s => s.deviceId === session.deviceId);
    if (idx >= 0) {
      existing[idx] = session;
    } else {
      existing.push(session);
    }
    // Keep only last 10 sessions
    const trimmed = existing.sort((a, b) => b.lastActive - a.lastActive).slice(0, 10);
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.log('[CHAT_HISTORY] Save error:', e);
  }
}

export async function getAllChatSessions(): Promise<ChatSession[]> {
  try {
    const data = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function getChatSession(deviceId: string): Promise<ChatSession | null> {
  const sessions = await getAllChatSessions();
  return sessions.find(s => s.deviceId === deviceId) || null;
}

export async function clearChatHistory(): Promise<void> {
  await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
}
