/**
 * React Native AsyncStorage adapter for persistent storage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAdapter } from '@urnlabs/mobile-sdk-core';

export class ReactNativeStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'urnlabs_sdk_') {
    this.prefix = prefix;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const item = await AsyncStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Failed to get item from AsyncStorage:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to set item in AsyncStorage:', error);
      throw new Error('Storage operation failed');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('Failed to remove item from AsyncStorage:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixedKeys = keys.filter(key => key.startsWith(this.prefix));
      await AsyncStorage.multiRemove(prefixedKeys);
    } catch (error) {
      console.error('Failed to clear AsyncStorage:', error);
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      return keys
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.substring(this.prefix.length));
    } catch (error) {
      console.error('Failed to get keys from AsyncStorage:', error);
      return [];
    }
  }
}