/* src/hooks/useBumpConnect.ts */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Accelerometer, AccelerometerMeasurement } from 'expo-sensors';
import { Vibration } from 'react-native';

const BUMP_THRESHOLD = 3.5; // G-force threshold for bump detection
const COOLDOWN_MS = 2000; // Cooldown between bumps
const BUMP_WINDOW_MS = 500; // How quickly the acceleration must spike

interface UseBumpConnectOptions {
  enabled: boolean;
  onBump: () => void;
}

export default function useBumpConnect({ enabled, onBump }: UseBumpConnectOptions) {
  const [isListening, setIsListening] = useState(false);
  const [lastBumpTime, setLastBumpTime] = useState(0);
  const [bumpDetected, setBumpDetected] = useState(false);
  const prevMagnitude = useRef(1); // Resting = ~1g
  const subscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);

  useEffect(() => {
    if (!enabled) {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      setIsListening(false);
      return;
    }

    // Set update interval (~60 Hz)
    Accelerometer.setUpdateInterval(16);

    const subscription = Accelerometer.addListener((data: AccelerometerMeasurement) => {
      const { x, y, z } = data;
      // Calculate total magnitude (sqrt of sum of squares)
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      // Detect sudden spike (bump)
      const delta = Math.abs(magnitude - prevMagnitude.current);
      prevMagnitude.current = magnitude;

      const now = Date.now();
      if (delta > BUMP_THRESHOLD && (now - lastBumpTime) > COOLDOWN_MS) {
        setLastBumpTime(now);
        setBumpDetected(true);
        Vibration.vibrate([0, 100, 50, 100]);

        // Auto-reset bump indicator
        setTimeout(() => setBumpDetected(false), 1500);

        onBump();
      }
    });

    subscriptionRef.current = subscription;
    setIsListening(true);

    return () => {
      subscription.remove();
      subscriptionRef.current = null;
      setIsListening(false);
    };
  }, [enabled, onBump, lastBumpTime]);

  return {
    isListening,
    bumpDetected,
  };
}
