import { NativeModules, Platform } from 'react-native';

const { ZeticMLange } = NativeModules;

export async function generate(prompt: string): Promise<string> {
  if (!ZeticMLange) {
    throw new Error(`ZeticMLange native module not available on ${Platform.OS}`);
  }
  return ZeticMLange.generate(prompt);
}

export async function healthCheck(): Promise<boolean> {
  if (!ZeticMLange) return false;
  try {
    return await ZeticMLange.healthCheck();
  } catch {
    return false;
  }
}
