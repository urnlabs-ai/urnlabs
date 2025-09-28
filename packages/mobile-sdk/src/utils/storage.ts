/**
 * Storage adapters and utilities for different platforms
 */

import { StorageAdapter } from '../core/types';

/**
 * Memory-based storage adapter (for testing or platforms without persistent storage)
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private storage = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.storage.get(key);
    return value !== undefined ? value : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.storage.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }

  async keys(): Promise<string[]> {
    return Array.from(this.storage.keys());
  }
}

/**
 * LocalStorage adapter (for web environments)
 */
export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'urnlabs_sdk_') {
    this.prefix = prefix;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Failed to get item from localStorage:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to set item in localStorage:', error);
      throw new Error('Storage quota exceeded or localStorage unavailable');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key);
    } catch (error) {
      console.error('Failed to remove item from localStorage:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(this.prefix)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
    }
  }

  async keys(): Promise<string[]> {
    try {
      const keys = Object.keys(localStorage);
      return keys
        .filter(key => key.startsWith(this.prefix))
        .map(key => key.substring(this.prefix.length));
    } catch (error) {
      console.error('Failed to get keys from localStorage:', error);
      return [];
    }
  }
}

/**
 * Encrypted storage adapter wrapper
 */
export class EncryptedStorageAdapter implements StorageAdapter {
  private baseAdapter: StorageAdapter;
  private encryptionKey: string;

  constructor(baseAdapter: StorageAdapter, encryptionKey: string) {
    this.baseAdapter = baseAdapter;
    this.encryptionKey = encryptionKey;
  }

  async get<T>(key: string): Promise<T | null> {
    const encryptedValue = await this.baseAdapter.get<string>(key);
    if (!encryptedValue) {
      return null;
    }

    try {
      const decryptedValue = this.decrypt(encryptedValue);
      return JSON.parse(decryptedValue);
    } catch (error) {
      console.error('Failed to decrypt storage value:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      const encryptedValue = this.encrypt(serializedValue);
      await this.baseAdapter.set(key, encryptedValue);
    } catch (error) {
      console.error('Failed to encrypt storage value:', error);
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    return this.baseAdapter.remove(key);
  }

  async clear(): Promise<void> {
    return this.baseAdapter.clear();
  }

  async keys(): Promise<string[]> {
    return this.baseAdapter.keys();
  }

  private encrypt(text: string): string {
    // Simple XOR encryption (for demonstration - use proper encryption in production)
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
      );
    }
    return btoa(result);
  }

  private decrypt(encryptedText: string): string {
    // Simple XOR decryption
    const text = atob(encryptedText);
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length)
      );
    }
    return result;
  }
}

/**
 * Create memory storage adapter
 */
export function createMemoryStorage(): StorageAdapter {
  return new MemoryStorageAdapter();
}

/**
 * Create localStorage adapter (web environments)
 */
export function createLocalStorage(prefix?: string): StorageAdapter {
  if (typeof localStorage === 'undefined') {
    console.warn('localStorage not available, falling back to memory storage');
    return createMemoryStorage();
  }
  return new LocalStorageAdapter(prefix);
}

/**
 * Create encrypted storage adapter
 */
export function createEncryptedStorage(baseAdapter: StorageAdapter, encryptionKey: string): StorageAdapter {
  return new EncryptedStorageAdapter(baseAdapter, encryptionKey);
}

/**
 * Auto-detect best storage adapter for current environment
 */
export function createAutoStorage(prefix?: string): StorageAdapter {
  // Try localStorage first
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('__test__', 'test');
      localStorage.removeItem('__test__');
      return createLocalStorage(prefix);
    } catch (error) {
      console.warn('localStorage test failed, falling back to memory storage');
    }
  }

  // Fall back to memory storage
  return createMemoryStorage();
}