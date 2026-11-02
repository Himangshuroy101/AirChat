/* src/components/RichMessageBubble.tsx */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking,
} from 'react-native';

interface Props {
  text: string;
  isMe: boolean;
  time: string;
  statusIcon?: string;
}

type MessageType = 'text' | 'contact' | 'location' | 'sos';

function detectType(text: string): MessageType {
  if (text.startsWith('📇 Contact Card')) return 'contact';
  if (text.startsWith('📍 My Location')) return 'location';
  if (text.startsWith('🆘')) return 'sos';
  return 'text';
}

function extractMapUrl(text: string): string | null {
  const match = text.match(/(https:\/\/maps\.google\.com\/\?q=[^\s]+)/);
  return match ? match[1] : null;
}

export default function RichMessageBubble({ text, isMe, time, statusIcon }: Props) {
  const type = detectType(text);

  if (type === 'contact') {
    return (
      <View style={[styles.cardBubble, isMe ? styles.cardMe : styles.cardTheirs]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(124,92,252,0.15)' }]}>
            <Text style={styles.cardIconText}>📇</Text>
          </View>
          <Text style={styles.cardTitle}>Contact Card</Text>
        </View>
        <View style={styles.cardBody}>
          {text.split('\n').slice(1).map((line, i) => (
            <Text key={i} style={styles.cardLine}>{line}</Text>
          ))}
        </View>
        <View style={styles.cardMeta}>
          <Text style={styles.metaTime}>{time}</Text>
          {isMe && statusIcon && <Text style={styles.metaStatus}> {statusIcon}</Text>}
        </View>
      </View>
    );
  }

  if (type === 'location') {
    const mapUrl = extractMapUrl(text);
    return (
      <View style={[styles.cardBubble, isMe ? styles.cardMe : styles.cardTheirs]}>
        <View style={styles.cardHeader}>
          <View style={[styles.cardIcon, { backgroundColor: 'rgba(0,201,167,0.15)' }]}>
            <Text style={styles.cardIconText}>📍</Text>
          </View>
          <Text style={styles.cardTitle}>Shared Location</Text>
        </View>
        {/* Map preview placeholder */}
        <View style={styles.mapPreview}>
          <Text style={styles.mapEmoji}>🗺️</Text>
          <Text style={styles.mapLabel}>GPS Location Shared</Text>
        </View>
        {mapUrl && (
          <TouchableOpacity
            style={styles.mapBtn}
            onPress={() => Linking.openURL(mapUrl)}
          >
            <Text style={styles.mapBtnText}>Open in Maps →</Text>
          </TouchableOpacity>
        )}
        <View style={styles.cardMeta}>
          <Text style={styles.metaTime}>{time}</Text>
          {isMe && statusIcon && <Text style={styles.metaStatus}> {statusIcon}</Text>}
        </View>
      </View>
    );
  }

  if (type === 'sos') {
    return (
      <View style={[styles.sosBubble]}>
        <Text style={styles.sosIcon}>🆘</Text>
        <Text style={styles.sosText}>{text.replace('🆘 ', '')}</Text>
        <View style={styles.cardMeta}>
          <Text style={[styles.metaTime, { color: 'rgba(255,200,200,0.6)' }]}>{time}</Text>
          {isMe && statusIcon && <Text style={styles.metaStatus}> {statusIcon}</Text>}
        </View>
      </View>
    );
  }

  // Default text bubble
  return (
    <View style={[styles.textBubble, isMe ? styles.textMe : styles.textTheirs]}>
      <Text style={[styles.msgText, isMe ? styles.textMeColor : styles.textTheirsColor]}>
        {text}
      </Text>
      <View style={styles.cardMeta}>
        <Text style={[styles.metaTime, !isMe && { color: 'rgba(255,255,255,0.3)' }]}>{time}</Text>
        {isMe && statusIcon && <Text style={styles.metaStatus}> {statusIcon}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Text bubble
  textBubble: { maxWidth: '78%', padding: 12, borderRadius: 18 },
  textMe: { backgroundColor: '#7C5CFC', borderBottomRightRadius: 4 },
  textTheirs: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  msgText: { fontSize: 16, lineHeight: 22 },
  textMeColor: { color: '#fff' },
  textTheirsColor: { color: '#fff' },

  // Card bubble
  cardBubble: {
    maxWidth: '82%', borderRadius: 18, overflow: 'hidden',
  },
  cardMe: {
    backgroundColor: 'rgba(124,92,252,0.15)',
    borderWidth: 1, borderColor: 'rgba(124,92,252,0.2)',
  },
  cardTheirs: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, paddingBottom: 8, gap: 10,
  },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  cardIconText: { fontSize: 18 },
  cardTitle: {
    color: '#fff', fontSize: 15, fontWeight: '700',
  },
  cardBody: {
    paddingHorizontal: 12, paddingBottom: 8,
  },
  cardLine: {
    color: 'rgba(255,255,255,0.7)', fontSize: 14,
    lineHeight: 22,
  },

  // Map
  mapPreview: {
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: 'rgba(0,201,167,0.08)',
    borderRadius: 12, padding: 16,
    alignItems: 'center',
  },
  mapEmoji: { fontSize: 32, marginBottom: 6 },
  mapLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  mapBtn: {
    marginHorizontal: 12, marginBottom: 8,
    backgroundColor: 'rgba(0,201,167,0.15)',
    borderRadius: 10, paddingVertical: 10,
    alignItems: 'center',
  },
  mapBtnText: { color: '#00C9A7', fontSize: 14, fontWeight: '700' },

  // SOS
  sosBubble: {
    maxWidth: '82%', borderRadius: 18, padding: 14,
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(255,59,48,0.3)',
    alignItems: 'center',
  },
  sosIcon: { fontSize: 32, marginBottom: 8 },
  sosText: {
    color: '#FF6B6B', fontSize: 16, fontWeight: '700',
    textAlign: 'center', lineHeight: 22,
  },

  // Meta
  cardMeta: {
    flexDirection: 'row', justifyContent: 'flex-end',
    paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4,
  },
  metaTime: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  metaStatus: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
});
