import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ZatcaConfig } from '../types';

const ZATCA_CONFIG_KEY = '@zatca_config';

export async function getZatcaConfig(): Promise<ZatcaConfig | null> {
  const json = await AsyncStorage.getItem(ZATCA_CONFIG_KEY);
  if (!json) return null;
  return JSON.parse(json) as ZatcaConfig;
}

export async function setZatcaConfig(config: ZatcaConfig): Promise<void> {
  await AsyncStorage.setItem(ZATCA_CONFIG_KEY, JSON.stringify(config));
}
