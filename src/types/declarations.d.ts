/* src/types/declarations.d.ts */

declare module 'base-64' {
  export function encode(input: string): string;
  export function decode(input: string): string;
}

declare module 'react-native-ble-peripheral' {
  const BlePeripheral: {
    setName(name: string): Promise<void>;
    addService(uuid: string, primary: boolean): Promise<void>;
    addCharacteristicToService(
      serviceUUID: string,
      uuid: string,
      permissions: number,
      properties: number
    ): Promise<void>;
    start(): Promise<string>;
    stop(): Promise<void>;
    sendNotificationToDevices(
      serviceUUID: string,
      charUUID: string,
      message: number[]
    ): Promise<void>;
    isAdvertising(): Promise<boolean>;
  };
  export default BlePeripheral;
}

