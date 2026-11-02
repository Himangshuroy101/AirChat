/* src/hooks/useBLE.ts */
import * as ExpoDevice from "expo-device";
import * as Location from "expo-location";
import { decode as rawAtob, encode as rawBtoa } from 'base-64';
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { PermissionsAndroid, Platform, Alert, DeviceEventEmitter, Vibration, Linking } from "react-native";
import { Device, Subscription } from "react-native-ble-plx";
import BlePeripheral from 'react-native-ble-peripheral';
import { bleManager } from "../utils/bleManager";
import {
  generateKeyPair,
  computeSharedKey,
  encryptPayload,
  decryptPayload,
  isEncryptedPacket,
} from "../utils/crypto";

// ---------- ROBUST LOSSLESS UTF-8 & BASE64 CODEC ----------
// Handles emojis, surrogate pairs, Hindi, Arabic, Chinese, and non-ASCII cleanly

// Encode string to UTF-8 byte array (values 0-255)
export function encodeUtf8(str: string): number[] {
  const encoded = encodeURIComponent(str);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const c = encoded.charAt(i);
    if (c === '%') {
      bytes.push(parseInt(encoded.substring(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0));
    }
  }
  return bytes;
}

// Decode UTF-8 byte array (handles signed -128..127 or unsigned 0..255 integers) to string
export function decodeUtf8(bytes: number[]): string {
  let encoded = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xFF; // Normalizes signed byte to unsigned 0..255
    encoded += '%' + ('0' + b.toString(16)).slice(-2);
  }
  try {
    return decodeURIComponent(encoded);
  } catch (e) {
    // Fallback: Latin-1 character mapping
    return bytes.map(b => String.fromCharCode(b & 0xFF)).join('');
  }
}

// Convert UTF-8 byte array to Base64 (for react-native-ble-plx write)
export function utf8BytesToBase64(bytes: number[]): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] & 0xFF);
  }
  return rawBtoa(binary);
}

// Convert Base64 (from react-native-ble-plx monitor) to UTF-8 byte array
export function base64ToUtf8Bytes(b64: string): number[] {
  try {
    const binary = rawAtob(b64);
    const bytes: number[] = new Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xFF;
    }
    return bytes;
  } catch (e) {
    return [];
  }
}

// 16-bit compatible UUIDs — compress to 4 bytes in BLE advertising
const SERVICE_UUID = '0000FFE0-0000-1000-8000-00805F9B34FB';
const CHAR_UUID    = '0000FFE1-0000-1000-8000-00805F9B34FB';

const DEFAULT_MTU = 20;
const CHUNK_DELAY_MS = 40;

export interface Message {
  id: string;
  sender: 'Me' | 'Partner';
  text: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered';
}

export type ConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected';
export type RequestStatus = 'NONE' | 'RECEIVED' | 'ACCEPTED';

export interface PeerProfile {
  name: string;
  avatar: string;
}

interface ChunkAssembly {
  total: number;
  received: Map<number, string>;
  lastUpdated: number;
}

function useBLE() {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("NONE");
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<PeerProfile | null>(null);

  const mtuRef = useRef<number>(DEFAULT_MTU);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isDisconnectingRef = useRef(false);
  const connectedDeviceRef = useRef<Device | null>(null);
  const monitorSubRef = useRef<Subscription | null>(null);
  const assembliesRef = useRef<Map<string, ChunkAssembly>>(new Map());

  // E2EE Keys
  const sessionKeyRef = useRef<Uint8Array | null>(null);
  const myEphemeralKeysRef = useRef<{ privateKey: Uint8Array; publicKeyHex: string } | null>(null);
  const peerPublicKeyRef = useRef<string | null>(null);
  const myUsernameRef = useRef<string>('');

  // Refs for callbacks to prevent cyclic dependencies
  const sendRawRef = useRef<((text: string, target?: Device | null) => Promise<void>) | null>(null);
  const disconnectRef = useRef<((options?: { notifyPeer?: boolean; isPassive?: boolean }) => Promise<void>) | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    connectedDeviceRef.current = connectedDevice;
  }, [connectedDevice]);

  // Cleanup BleManager subscriptions on unmount
  useEffect(() => {
    return () => {
      monitorSubRef.current?.remove();
      try {
        bleManager.stopDeviceScan();
      } catch (e) { /* ignore */ }
    };
  }, []);

  // ---------- LOCATION SERVICES CHECK ----------
  const ensureLocationServicesEnabled = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (enabled) return true;

      console.log('[SYSTEM] Location services disabled. Prompting to enable...');
      try {
        await Location.enableNetworkProviderAsync();
        const recheck = await Location.hasServicesEnabledAsync();
        if (recheck) {
          console.log('[SYSTEM] Location services successfully enabled!');
          return true;
        }
      } catch (promptErr) {
        console.log('[SYSTEM] enableNetworkProviderAsync declined or failed:', promptErr);
      }

      Alert.alert(
        "Location (GPS) Required",
        "Android requires Location Services (GPS) to be turned ON to scan for nearby Bluetooth devices. Please enable Location in your device settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    } catch (e) {
      console.log('[SYSTEM] Could not check location services:', e);
      return true;
    }
  };

  // ---------- PERMISSIONS ----------
  const requestPermissions = async (): Promise<boolean> => {
    console.log("[SYSTEM] Requesting Permissions...");
    if (Platform.OS === "android") {
      let granted = false;
      if ((ExpoDevice.platformApiLevel ?? -1) < 31) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          { title: "Location", message: "Required for Bluetooth scanning", buttonPositive: "OK" }
        );
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        granted = (
          result["android.permission.BLUETOOTH_SCAN"] === PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.BLUETOOTH_CONNECT"] === PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.BLUETOOTH_ADVERTISE"] === PermissionsAndroid.RESULTS.GRANTED &&
          result["android.permission.ACCESS_FINE_LOCATION"] === PermissionsAndroid.RESULTS.GRANTED
        );
      }

      if (!granted) return false;

      // Verify that the Android system Location (GPS) toggle is turned ON
      const locationReady = await ensureLocationServicesEnabled();
      return locationReady;
    }
    return true;
  };

  // ---------- HELPERS ----------
  const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

  // ---------- MESSAGE PROTOCOL HANDLER ----------
  const handleIncomingMessage = useCallback((message: string) => {
    console.log("[RECEIVE] 📨 Decoded Message:", message);

    if (message.startsWith("REQ:CHAT")) {
      console.log("[RECEIVE] 🔔 Chat request received!");
      // Stop scanner on Peripheral so Bluetooth hardware can focus on GATT connection
      try {
        bleManager.stopDeviceScan();
      } catch (e) { /* ignore */ }

      // Format: REQ:CHAT:<pubKey>:<encodedName>:<encodedAvatar>
      const parts = message.split(":");
      if (parts.length >= 3 && parts[2]) {
        const peerPub = parts[2].trim();
        peerPublicKeyRef.current = peerPub;
        console.log("[E2EE] 🔑 Received peer public key with chat request");
        // Pre-generate our ephemeral keypair and compute session key
        try {
          const myKeys = generateKeyPair();
          myEphemeralKeysRef.current = myKeys;
          const shared = computeSharedKey(myKeys.privateKey, peerPub);
          sessionKeyRef.current = shared;
          setIsEncrypted(true);
          console.log("[E2EE] 🔒 Computed shared session key on Peripheral!");
        } catch (err) {
          console.log("[E2EE] ❌ Failed to compute shared key:", err);
        }
      } else {
        sessionKeyRef.current = null;
        setIsEncrypted(false);
      }

      // Extract peer profile info if provided
      let peerName = "Nearby Peer";
      let peerAvatar = "👤";
      if (parts.length >= 4 && parts[3]) {
        try {
          peerName = decodeURIComponent(parts[3]) || peerName;
        } catch (e) {
          peerName = parts[3];
        }
      }
      if (parts.length >= 5 && parts[4]) {
        try {
          peerAvatar = decodeURIComponent(parts[4]) || peerAvatar;
        } catch (e) {
          peerAvatar = parts[4];
        }
      }

      setPartnerProfile({ name: peerName, avatar: peerAvatar });
      setRequestStatus("RECEIVED");
      setConnectionState('connected');
      Vibration.vibrate(500);
    } else if (message.startsWith("RES:ACCEPTED")) {
      console.log("[RECEIVE] ✅ Chat request accepted!");
      // Format: RES:ACCEPTED:<pubKey>:<encodedName>:<encodedAvatar>
      const parts = message.split(":");
      if (parts.length >= 3 && parts[2]) {
        const peerPub = parts[2].trim();
        peerPublicKeyRef.current = peerPub;
        if (myEphemeralKeysRef.current) {
          try {
            const shared = computeSharedKey(myEphemeralKeysRef.current.privateKey, peerPub);
            sessionKeyRef.current = shared;
            setIsEncrypted(true);
            console.log("[E2EE] 🔒 Central computed shared session key! E2EE is active.");
          } catch (err) {
            console.log("[E2EE] ❌ Central failed to compute shared key:", err);
          }
        }
      }

      // Extract peer profile info if provided
      if (parts.length >= 4 && parts[3]) {
        let peerName = "";
        let peerAvatar = "👤";
        try {
          peerName = decodeURIComponent(parts[3]);
        } catch (e) {
          peerName = parts[3];
        }
        if (parts.length >= 5 && parts[4]) {
          try {
            peerAvatar = decodeURIComponent(parts[4]) || peerAvatar;
          } catch (e) {
            peerAvatar = parts[4];
          }
        }
        if (peerName) {
          setPartnerProfile(prev => ({
            name: peerName,
            avatar: peerAvatar || prev?.avatar || '👤',
          }));
        }
      }
      setRequestStatus("ACCEPTED");
    } else if (message.startsWith("ACK:")) {
      const ackId = message.substring(4);
      setMessages(prev => prev.map(m => m.id === ackId ? { ...m, status: 'delivered' as const } : m));
    } else if (message === "SYS:TYPING") {
      setPartnerTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
    } else if (message === "SYS:DISCONNECT") {
      console.log("[RECEIVE] 🚪 Peer ended the chat!");
      Alert.alert("Chat Ended", "The other person has ended the chat.");
      disconnectRef.current?.({ notifyPeer: false, isPassive: true });
    } else {
      const newMsg: Message = {
        id: generateId(),
        sender: 'Partner',
        text: message,
        timestamp: Date.now(),
        status: 'delivered',
      };
      setMessages(prev => [...prev, newMsg]);
      Vibration.vibrate(200);

      // Transmit ACK back
      if (sendRawRef.current) {
        sendRawRef.current("ACK:" + newMsg.id);
      }
    }
  }, []);

  // ---------- CHUNK REASSEMBLY, DECRYPTION & DISPATCH ----------
  const processIncomingRaw = useCallback((raw: string) => {
    let completePayload = raw;

    // Check if packet is a chunk: C:<chunkId>:<seq>:<total>:<payload>
    if (raw.startsWith('C:')) {
      const secondColon = raw.indexOf(':', 2);
      if (secondColon !== -1) {
        const thirdColon = raw.indexOf(':', secondColon + 1);
        if (thirdColon !== -1) {
          const fourthColon = raw.indexOf(':', thirdColon + 1);
          if (fourthColon !== -1) {
            const chunkId = raw.substring(2, secondColon);
            const seq = parseInt(raw.substring(secondColon + 1, thirdColon), 10);
            const total = parseInt(raw.substring(thirdColon + 1, fourthColon), 10);
            const payload = raw.substring(fourthColon + 1);

            let asm = assembliesRef.current.get(chunkId);
            if (!asm) {
              asm = { total, received: new Map(), lastUpdated: Date.now() };
              assembliesRef.current.set(chunkId, asm);
            }
            asm.received.set(seq, payload);
            asm.lastUpdated = Date.now();

            // Prune stale assemblies older than 30s
            const now = Date.now();
            for (const [id, a] of assembliesRef.current.entries()) {
              if (now - a.lastUpdated > 30000) assembliesRef.current.delete(id);
            }

            if (asm.received.size === total) {
              let full = '';
              for (let i = 0; i < total; i++) {
                full += asm.received.get(i) || '';
              }
              assembliesRef.current.delete(chunkId);
              console.log(`[CHUNK] ✅ Successfully reassembled ${total} chunks for id ${chunkId}`);
              completePayload = full;
            } else {
              // Waiting for more chunks
              return;
            }
          }
        }
      }
    }

    // Check if payload is encrypted with ChaCha20-Poly1305
    if (isEncryptedPacket(completePayload)) {
      if (sessionKeyRef.current) {
        const decryptedBytes = decryptPayload(completePayload, sessionKeyRef.current);
        if (decryptedBytes) {
          const plainText = decodeUtf8(Array.from(decryptedBytes));
          console.log("[E2EE] 🔓 Successfully decrypted message:", plainText.substring(0, 50));
          handleIncomingMessage(plainText);
          return;
        } else {
          console.log("[E2EE] ❌ Packet dropped: authentication tag mismatch or corrupted data");
          return;
        }
      } else {
        console.log("[E2EE] ⚠️ Received encrypted packet before session key was derived");
        return;
      }
    }

    // Direct single unencrypted packet
    handleIncomingMessage(completePayload);
  }, [handleIncomingMessage]);

  // ---------- LOW-LEVEL PACKET SENDER ----------
  const sendSinglePacket = useCallback(async (packetText: string, targetDevice?: Device | null): Promise<boolean> => {
    const activeDevice = targetDevice || connectedDeviceRef.current;
    const bytes = encodeUtf8(packetText);

    if (activeDevice) {
      const b64 = utf8BytesToBase64(bytes);
      // Attempt write with response first for reliable GATT delivery and acknowledgment
      try {
        await activeDevice.writeCharacteristicWithResponseForService(
          SERVICE_UUID, CHAR_UUID, b64
        );
        return true;
      } catch (errWithResp) {
        console.log(`[SEND_PACKET] writeWithResponse failed, retrying without response:`, errWithResp);
        try {
          await activeDevice.writeCharacteristicWithoutResponseForService(
            SERVICE_UUID, CHAR_UUID, b64
          );
          return true;
        } catch (errWithoutResp) {
          console.log(`[SEND_PACKET] writeWithoutResponse also failed:`, errWithoutResp);
          throw errWithoutResp;
        }
      }
    } else {
      // Send as peripheral notification to connected central
      try {
        await BlePeripheral.sendNotificationToDevices(SERVICE_UUID, CHAR_UUID, bytes);
        return true;
      } catch (e) {
        console.log(`[SEND_PACKET] Peripheral notification failed:`, e);
        throw e;
      }
    }
  }, []);

  // ---------- SEND WITH ENCRYPTION & AUTOMATIC CHUNKING ----------
  const sendRawToDevice = useCallback(async (text: string, targetDevice?: Device | null) => {
    // Determine whether to encrypt: Handshake & disconnect protocols are in the clear, all else is encrypted
    const isHandshake = text.startsWith("REQ:CHAT") || text.startsWith("RES:ACCEPTED") || text === "SYS:DISCONNECT";
    let payloadToSend = text;

    if (!isHandshake && sessionKeyRef.current) {
      const utf8Bytes = new Uint8Array(encodeUtf8(text));
      payloadToSend = encryptPayload(utf8Bytes, sessionKeyRef.current);
      console.log(`[E2EE] 🔐 Encrypted payload (${utf8Bytes.length} bytes -> ${payloadToSend.length} chars)`);
    }

    const payloadBytes = encodeUtf8(payloadToSend);

    // If payload fits in a single packet (or if handshake fits in negotiated MTU), transmit directly
    if (payloadBytes.length <= mtuRef.current) {
      await sendSinglePacket(payloadToSend, targetDevice);
      return;
    }

    // Fragment into chunks split along code points so total chunk packet <= mtuRef.current
    // Header format C:<chunkId>:<seq>:<total>: is ~14-16 bytes.
    const maxChunkPayload = Math.max(1, mtuRef.current - 16);
    const chunkId = Math.random().toString(36).substring(2, 6);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const char of Array.from(payloadToSend)) {
      const testChunk = currentChunk + char;
      if (encodeUtf8(testChunk).length > maxChunkPayload) {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = char;
      } else {
        currentChunk = testChunk;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const total = chunks.length;
    console.log(`[CHUNK] Splitting payload (${payloadBytes.length} bytes, MTU ${mtuRef.current}) into ${total} chunks`);

    for (let i = 0; i < total; i++) {
      const packet = `C:${chunkId}:${i}:${total}:${chunks[i]}`;
      await sendSinglePacket(packet, targetDevice);
      if (i < total - 1) {
        await new Promise(res => setTimeout(res, CHUNK_DELAY_MS));
      }
    }
  }, [sendSinglePacket]);

  // Keep sendRawRef updated
  useEffect(() => {
    sendRawRef.current = sendRawToDevice;
  }, [sendRawToDevice]);

  // ---------- HOST LOGIC (BLE Peripheral) ----------
  const startHost = async (deviceName: string) => {
    console.log("[HOST] 1. Initializing Server as:", deviceName);
    try {
      await BlePeripheral.setName(deviceName);
      console.log("[HOST] 2. Name set. Adding Service...");
      await BlePeripheral.addService(SERVICE_UUID, true);
      console.log("[HOST] 3. Service added. Adding Characteristic...");
      // Permissions: PERMISSION_READ(1) | PERMISSION_WRITE(16) = 17
      // Properties:  READ(2) | WRITE_NO_RESPONSE(4) | WRITE(8) | NOTIFY(16) = 30
      await BlePeripheral.addCharacteristicToService(
        SERVICE_UUID, CHAR_UUID, 1 | 16, 2 | 4 | 8 | 16
      );
      console.log("[HOST] 4. Characteristic added. Starting Broadcast...");
      await BlePeripheral.start();
      console.log("[HOST] ✅ SERVER IS LIVE AND LISTENING!");
    } catch (e) {
      console.log("[HOST] ❌ START ERROR:", e);
    }
  };

  // ---------- PERIPHERAL onWrite LISTENER ----------
  useEffect(() => {
    const handleIncomingWrite = (data: any) => {
      console.log("[HOST] 📥 RAW onWrite EVENT:", JSON.stringify(data));

      let message = "";
      const payload = data?.data || data?.value || data;

      if (Array.isArray(payload)) {
        // Native byte array decoded using lossless UTF-8
        message = decodeUtf8(payload);
      } else if (typeof payload === 'string') {
        try {
          message = decodeUtf8(base64ToUtf8Bytes(payload));
        } catch {
          message = payload;
        }
      }

      if (message) {
        processIncomingRaw(message);
      }
    };

    const handlePeripheralDisconnect = (data: any) => {
      console.log("[HOST] ⚠️ Client disconnected from GATT server:", JSON.stringify(data));
      if (!isDisconnectingRef.current && (connectedDeviceRef.current || requestStatus === 'ACCEPTED')) {
        Alert.alert("Connection Lost", "Nearby connection was lost.");
        disconnectRef.current?.({ notifyPeer: false, isPassive: true });
      }
    };

    const legacySub = DeviceEventEmitter.addListener('onWrite', handleIncomingWrite);
    const discSub = DeviceEventEmitter.addListener('onDisconnected', handlePeripheralDisconnect);

    return () => {
      legacySub.remove();
      discSub.remove();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [processIncomingRaw]);

  // ---------- BLUETOOTH READY CHECK ----------
  const waitForBluetoothReady = (): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        const currentState = await bleManager.state();
        console.log(`[SYSTEM] Current Bluetooth state: ${currentState}`);
        if (currentState === 'PoweredOn') {
          resolve();
          return;
        }
        if (currentState === 'PoweredOff' && Platform.OS === 'android') {
          try {
            console.log('[SYSTEM] Attempting to enable Bluetooth...');
            await bleManager.enable();
          } catch (enableErr) {
            console.log('[SYSTEM] Auto-enable failed or cancelled:', enableErr);
          }
        }
      } catch (e) {
        console.log('[SYSTEM] Could not check BT state:', e);
      }

      const sub = bleManager.onStateChange((state) => {
        console.log(`[SYSTEM] Bluetooth state changed: ${state}`);
        if (state === 'PoweredOn') {
          sub.remove();
          resolve();
        }
      }, true);

      setTimeout(() => {
        sub.remove();
        reject(new Error('Bluetooth not ready. Please make sure Bluetooth and Location (GPS) are turned ON in system settings.'));
      }, 10000);
    });
  };

  // ---------- START MONITORING (Central receives notifications) ----------
  const startMonitoring = (device: Device) => {
    console.log("[MONITOR] 🔔 Starting characteristic monitor for notifications...");
    monitorSubRef.current?.remove();

    monitorSubRef.current = device.monitorCharacteristicForService(
      SERVICE_UUID,
      CHAR_UUID,
      (error, characteristic) => {
        if (error) {
          console.log("[MONITOR] ❌ Error:", error.message);
          return;
        }
        if (characteristic?.value) {
          try {
            const bytes = base64ToUtf8Bytes(characteristic.value);
            const decoded = decodeUtf8(bytes);
            console.log("[MONITOR] 📨 Received notification:", decoded.substring(0, 50));
            processIncomingRaw(decoded);
          } catch (e) {
            console.log("[MONITOR] Decode error:", e);
          }
        }
      }
    );

    console.log("[MONITOR] ✅ Monitoring active!");
  };

  // ---------- DISCOVERY ----------
  const startDiscovery = async (myUsername: string) => {
    const trimmedUsername = (myUsername || "AirChat User").trim();
    console.log("[SYSTEM] Starting Discovery Process as:", trimmedUsername);
    myUsernameRef.current = trimmedUsername;
    setAllDevices([]);
    setConnectionState('scanning');
    isDisconnectingRef.current = false;

    // 1. Verify Android system location services (GPS) is enabled
    if (Platform.OS === 'android') {
      const locationOk = await ensureLocationServicesEnabled();
      if (!locationOk) {
        setConnectionState('idle');
        return;
      }
    }

    // 2. Verify Bluetooth adapter is powered on
    try {
      await waitForBluetoothReady();
      console.log("[SYSTEM] Bluetooth is ready!");
    } catch (e) {
      console.log("[SYSTEM] ❌ Bluetooth not ready:", e);
      Alert.alert("Bluetooth Off", "Please turn on Bluetooth and try again.");
      setConnectionState('idle');
      return;
    }

    try {
      bleManager.stopDeviceScan();
    } catch (e) { /* ignore */ }

    await startHost(trimmedUsername);
    await new Promise(resolve => setTimeout(resolve, 500));

    bleManager.startDeviceScan([SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
      if (error) {
        console.log("[CLIENT] Scan error:", error.message);
        return;
      }
      if (device) {
        const devName = (device.name || device.localName || '').trim();
        // Ignore unnamed beacons until complete name is discovered
        if (!devName) return;

        // Ignore ourselves (prevent advertising loopback)
        if (devName.toLowerCase() === myUsernameRef.current.toLowerCase()) {
          return;
        }

        setAllDevices((prevState) => {
          // Deduplicate by BOTH device.id AND name (handles Android RPA MAC rotation)
          const index = prevState.findIndex(
            d => d.id === device.id || ((d.name || d.localName || '').trim().toLowerCase() === devName.toLowerCase())
          );
          if (index >= 0) {
            // Update device with fresh RSSI and newest MAC
            const updated = [...prevState];
            updated[index] = device;
            return updated;
          }
          console.log(`[CLIENT] Found Device: ${device.id} - ${devName} (RSSI: ${device.rssi})`);
          return [...prevState, device];
        });
      }
    });
  };

  const stopDiscovery = () => {
    try {
      bleManager.stopDeviceScan();
    } catch (e) { /* ignore */ }
    setConnectionState('idle');
    console.log("[SYSTEM] Discovery Stopped.");
  };

  // ---------- CONNECT ----------
  const connectToDevice = async (device: Device): Promise<Device | null> => {
    console.log(`[CLIENT] 1. Attempting to connect to: ${device.id} (${device.name || device.localName})`);
    setConnectionState('connecting');

    try {
      try {
        bleManager.stopDeviceScan();
      } catch (e) { /* ignore */ }

      const connected = await bleManager.connectToDevice(device.id, {
        autoConnect: false,
      });

      console.log(`[CLIENT] 2. Hardware Connected! Negotiating MTU...`);

      let negotiatedMtu = DEFAULT_MTU;
      if (Platform.OS === 'android') {
        try {
          const devWithMtu = await connected.requestMTU(512);
          if (devWithMtu?.mtu && devWithMtu.mtu > 23) {
            negotiatedMtu = devWithMtu.mtu;
            console.log(`[CLIENT] MTU negotiated: ${negotiatedMtu}`);
          }
        } catch (mtuErr) {
          console.log(`[CLIENT] MTU request non-fatal error:`, mtuErr);
        }
      }
      mtuRef.current = Math.max(20, negotiatedMtu - 3);

      console.log(`[CLIENT] 3. Waiting 1.5s for GATT to stabilize...`);
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log(`[CLIENT] 4. Discovering Services...`);
      await connected.discoverAllServicesAndCharacteristics();
      console.log(`[CLIENT] ✅ CONNECTION FULLY READY! Usable MTU: ${mtuRef.current}`);

      startMonitoring(connected);
      setConnectedDevice(connected);
      setConnectionState('connected');
      reconnectAttemptsRef.current = 0;

      bleManager.onDeviceDisconnected(device.id, (error) => {
        console.log(`[CLIENT] ⚠️ Disconnected:`, error?.message || 'Clean');
        try {
          monitorSubRef.current?.remove();
        } catch (e) {}
        monitorSubRef.current = null;
        setConnectedDevice(null);
        setConnectionState('disconnected');
        sessionKeyRef.current = null;
        setIsEncrypted(false);
        setRequestStatus("NONE");

        if (!isDisconnectingRef.current) {
          Alert.alert("Connection Lost", "Nearby connection was lost.");
          disconnectRef.current?.({ notifyPeer: false, isPassive: true });
        }
      });

      return connected;
    } catch (e) {
      console.log(`[CLIENT] ❌ CONNECTION FAILED:`, e);
      setConnectionState('idle');
      Alert.alert("Connection Failed", String(e));
      return null;
    }
  };

  // ---------- AUTO-RECONNECT ----------
  const attemptReconnect = async (device: Device) => {
    const MAX_RETRIES = 3;
    const BACKOFF_BASE = 2000;

    if (reconnectAttemptsRef.current >= MAX_RETRIES) {
      Alert.alert("Disconnected", "Connection lost. Scan again to reconnect.");
      setConnectionState('disconnected');
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = BACKOFF_BASE * Math.pow(2, reconnectAttemptsRef.current - 1);
    console.log(`[CLIENT] Reconnect ${reconnectAttemptsRef.current}/${MAX_RETRIES} in ${delay}ms...`);
    setConnectionState('connecting');

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const connected = await bleManager.connectToDevice(device.id, { autoConnect: false, requestMTU: 512 });
      await new Promise(resolve => setTimeout(resolve, 1500));
      await connected.discoverAllServicesAndCharacteristics();

      const deviceMtu = connected.mtu;
      if (deviceMtu && deviceMtu > 23) mtuRef.current = deviceMtu - 3;

      startMonitoring(connected);
      setConnectedDevice(connected);
      setConnectionState('connected');
      reconnectAttemptsRef.current = 0;
      console.log("[CLIENT] ✅ Reconnected!");

      bleManager.onDeviceDisconnected(device.id, () => {
        monitorSubRef.current?.remove();
        setConnectedDevice(null);
        setConnectionState('disconnected');
        sessionKeyRef.current = null;
        setIsEncrypted(false);
        if (!isDisconnectingRef.current) {
          attemptReconnect(device);
        }
      });
    } catch (e) {
      console.log(`[CLIENT] ❌ Reconnect failed:`, e);
      attemptReconnect(device);
    }
  };

  // ---------- DISCONNECT ----------
  const disconnect = useCallback(async (options?: { notifyPeer?: boolean; isPassive?: boolean }) => {
    const notifyPeer = options?.notifyPeer ?? true;
    console.log(`[CLIENT] 🔌 Disconnect initiated (notifyPeer: ${notifyPeer})`);
    isDisconnectingRef.current = true;
    reconnectAttemptsRef.current = 999;

    // 1. Transmit SYS:DISCONNECT to peer before tearing down BLE connection if we are initiator
    if (notifyPeer) {
      try {
        if (connectedDeviceRef.current || sessionKeyRef.current || requestStatus === 'ACCEPTED') {
          console.log('[CLIENT] Transmitting SYS:DISCONNECT to peer...');
          await sendRawToDevice("SYS:DISCONNECT");
          // Allow GATT radio a brief moment to transmit packet over the air
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (e) {
        console.log('[DISCONNECT] SYS:DISCONNECT transmission error (safe if peer left):', e);
      }
    }

    try {
      monitorSubRef.current?.remove();
    } catch (e) {
      console.log('[CLIENT] Monitor unbind (safe):', e);
    }
    monitorSubRef.current = null;

    const deviceToDisconnect = connectedDeviceRef.current;
    setConnectedDevice(null);
    connectedDeviceRef.current = null;
    setConnectionState('idle');
    setMessages([]);
    setRequestStatus("NONE");
    setAllDevices([]);
    setPartnerTyping(false);
    assembliesRef.current.clear();
    sessionKeyRef.current = null;
    myEphemeralKeysRef.current = null;
    peerPublicKeyRef.current = null;
    setIsEncrypted(false);
    setPartnerProfile(null);

    if (deviceToDisconnect) {
      try {
        await bleManager.cancelDeviceConnection(deviceToDisconnect.id);
        console.log('[CLIENT] ✅ Device disconnected cleanly');
      } catch (e) {
        console.log("[CLIENT] Disconnect error (safe to ignore):", e);
      }
    }

    try {
      await BlePeripheral.stop();
    } catch (e) {
      console.log('[HOST] Stop error (safe to ignore):', e);
    }

    // Extended 3s guard window ensures native disconnect callbacks do not trigger redundant alerts
    setTimeout(() => {
      isDisconnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
    }, 3000);
  }, [requestStatus, sendRawToDevice]);

  // Keep disconnectRef updated
  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  // ---------- SEND MESSAGE (user-facing) ----------
  const sendMessage = async (text: string, targetDevice?: Device) => {
    const isProtocol = text.startsWith("REQ:") || text.startsWith("RES:");

    let msgId = '';
    if (!isProtocol) {
      msgId = generateId();
      setMessages(prev => [...prev, {
        id: msgId, sender: 'Me', text, timestamp: Date.now(), status: 'sending',
      }]);
    }

    try {
      await sendRawToDevice(text, targetDevice);

      if (msgId) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'sent' as const } : m));
      }
      console.log(`[SEND] ✅ Message sent successfully`);
    } catch (e) {
      console.log(`[SEND] ❌ Failed:`, e);
      if (!isProtocol) {
        Alert.alert("Failed to Send", String(e));
      }
      throw e;
    }
  };

  // ---------- HANDSHAKE ACTIONS ----------
  // Central sends request with its public key and user profile
  const sendChatRequest = useCallback(async (targetDevice: Device, myProfile?: { name: string; avatar: string }) => {
    const keys = generateKeyPair();
    myEphemeralKeysRef.current = keys;
    console.log("[E2EE] 🔑 Generated ephemeral keypair for Central");

    const defaultPartnerName = (targetDevice.name || targetDevice.localName || 'Nearby Peer').trim();
    setPartnerProfile({ name: defaultPartnerName, avatar: '👤' });

    const nameEnc = encodeURIComponent(myProfile?.name || myUsernameRef.current || 'AirChat User');
    const avatarEnc = encodeURIComponent(myProfile?.avatar || '😎');

    await sendMessage(`REQ:CHAT:${keys.publicKeyHex}:${nameEnc}:${avatarEnc}`, targetDevice);
  }, []);

  // Peripheral accepts request and replies with its public key and user profile
  const acceptChatRequest = useCallback(async (myProfile?: { name: string; avatar: string }) => {
    const nameEnc = encodeURIComponent(myProfile?.name || myUsernameRef.current || 'AirChat User');
    const avatarEnc = encodeURIComponent(myProfile?.avatar || '😎');

    let acceptMsg = `RES:ACCEPTED::${nameEnc}:${avatarEnc}`;
    if (myEphemeralKeysRef.current) {
      acceptMsg = `RES:ACCEPTED:${myEphemeralKeysRef.current.publicKeyHex}:${nameEnc}:${avatarEnc}`;
      console.log("[E2EE] 🔑 Sending Peripheral public key & profile in acceptance response");
    }
    await sendMessage(acceptMsg);
    setRequestStatus("ACCEPTED");
  }, []);

  // ---------- TYPING INDICATOR ----------
  const sendTypingIndicator = useCallback(() => {
    sendRawToDevice("SYS:TYPING");
  }, [sendRawToDevice]);

  // ---------- DISPLAY NAME ----------
  const getDeviceDisplayName = (device: Device): string => {
    return (device.name || device.localName || "Unknown Nearby User").trim();
  };

  return {
    requestPermissions,
    ensureLocationServicesEnabled,
    startDiscovery,
    stopDiscovery,
    connectToDevice,
    disconnect,
    sendMessage,
    sendChatRequest,
    acceptChatRequest,
    sendTypingIndicator,
    getDeviceDisplayName,
    allDevices,
    connectedDevice,
    connectionState,
    requestStatus,
    setRequestStatus,
    messages,
    partnerTyping,
    isEncrypted,
    partnerProfile,
  };
}

export default useBLE;
