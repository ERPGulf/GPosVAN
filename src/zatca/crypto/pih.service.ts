import * as SecureStore from 'expo-secure-store';

const PIH_KEY = 'zatca_previous_invoice_hash';

export class PIHService {
  static async getPreviousHash(): Promise<string | null> {
    try {
      const hash = await SecureStore.getItemAsync(PIH_KEY);
      return hash;
    } catch (err) {
      console.error('PIH read error', err);
      return null;
    }
  }

  static async storeHash(hash: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(PIH_KEY, hash);
    } catch (err) {
      console.error('PIH store error', err);
      throw err;
    }
  }

  static async resetChain(): Promise<void> {
    await SecureStore.deleteItemAsync(PIH_KEY);
  }
}
