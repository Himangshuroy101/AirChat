/* src/utils/bleManager.ts */
import { BleManager } from 'react-native-ble-plx';

/**
 * Shared BleManager Singleton
 * 
 * According to react-native-ble-plx documentation, BleManager maintains
 * a native singleton adapter in Java/Obj-C. Only ONE instance must exist
 * in the application. Calling destroy() tears down the native client
 * and breaks all subsequent Bluetooth operations.
 */
export const bleManager = new BleManager();

