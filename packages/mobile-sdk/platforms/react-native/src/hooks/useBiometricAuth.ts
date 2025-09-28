/**
 * Biometric authentication hook for React Native
 * Supports Face ID, Touch ID, and Android biometric authentication
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import Keychain from 'react-native-keychain';
import { useUrnlabsSDK } from './useUrnlabsSDK';

export interface BiometricCapabilities {
  isAvailable: boolean;
  biometryType: BiometryTypes | null;
  error?: string;
}

export interface BiometricAuthResult {
  success: boolean;
  signature?: string;
  error?: string;
  userCancel?: boolean;
  userFallback?: boolean;
  systemCancel?: boolean;
  passcodeFallback?: boolean;
}

export interface KeychainCredentials {
  username: string;
  password: string;
  service?: string;
}

/**
 * Biometric authentication management hook
 */
export function useBiometricAuth() {
  const { sdk } = useUrnlabsSDK();
  const [capabilities, setCapabilities] = useState<BiometricCapabilities>({
    isAvailable: false,
    biometryType: null
  });
  const [isLoading, setIsLoading] = useState(false);
  const [rnBiometrics] = useState(() => new ReactNativeBiometrics({
    allowDeviceCredentials: true
  }));

  // Check biometric capabilities
  const checkCapabilities = useCallback(async () => {
    try {
      const { available, biometryType, error } = await rnBiometrics.isSensorAvailable();

      setCapabilities({
        isAvailable: available,
        biometryType,
        error
      });

      return { available, biometryType, error };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to check biometric capabilities';
      setCapabilities({
        isAvailable: false,
        biometryType: null,
        error: errorMessage
      });

      return { available: false, biometryType: null, error: errorMessage };
    }
  }, [rnBiometrics]);

  // Create biometric keys
  const createKeys = useCallback(async (): Promise<boolean> => {
    try {
      const { keysExist } = await rnBiometrics.biometricKeysExist();

      if (!keysExist) {
        const { publicKey } = await rnBiometrics.createKeys();
        console.log('Biometric keys created:', publicKey);
        return true;
      }

      return true;
    } catch (error) {
      console.error('Failed to create biometric keys:', error);
      return false;
    }
  }, [rnBiometrics]);

  // Delete biometric keys
  const deleteKeys = useCallback(async (): Promise<boolean> => {
    try {
      const { keysDeleted } = await rnBiometrics.deleteKeys();
      return keysDeleted;
    } catch (error) {
      console.error('Failed to delete biometric keys:', error);
      return false;
    }
  }, [rnBiometrics]);

  // Authenticate with biometrics
  const authenticate = useCallback(async (options: {
    promptMessage?: string;
    cancelButtonText?: string;
    fallbackButtonText?: string;
    disableDeviceFallback?: boolean;
  } = {}): Promise<BiometricAuthResult> => {
    if (!capabilities.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication not available'
      };
    }

    setIsLoading(true);

    try {
      const promptOptions = {
        promptMessage: options.promptMessage || 'Authenticate with biometrics',
        cancelButtonText: options.cancelButtonText || 'Cancel',
        fallbackButtonText: options.fallbackButtonText || 'Use Passcode',
        disableDeviceFallback: options.disableDeviceFallback || false
      };

      const { success, signature, error } = await rnBiometrics.simplePrompt(promptOptions);

      const result: BiometricAuthResult = {
        success,
        signature,
        error,
        userCancel: error?.includes('User canceled') || error?.includes('UserCancel'),
        userFallback: error?.includes('UserFallback'),
        systemCancel: error?.includes('SystemCancel'),
        passcodeFallback: error?.includes('PasscodeFallback')
      };

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Biometric authentication failed';

      return {
        success: false,
        error: errorMessage,
        userCancel: errorMessage.includes('User canceled') || errorMessage.includes('UserCancel')
      };
    } finally {
      setIsLoading(false);
    }
  }, [capabilities.isAvailable, rnBiometrics]);

  // Authenticate and sign payload
  const authenticateAndSign = useCallback(async (
    payload: string,
    options: {
      promptMessage?: string;
      cancelButtonText?: string;
    } = {}
  ): Promise<BiometricAuthResult> => {
    if (!capabilities.isAvailable) {
      return {
        success: false,
        error: 'Biometric authentication not available'
      };
    }

    setIsLoading(true);

    try {
      const promptOptions = {
        promptMessage: options.promptMessage || 'Sign with biometrics',
        cancelButtonText: options.cancelButtonText || 'Cancel',
        payload
      };

      const { success, signature, error } = await rnBiometrics.createSignature(promptOptions);

      return {
        success,
        signature,
        error,
        userCancel: error?.includes('User canceled') || error?.includes('UserCancel')
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Biometric signing failed';

      return {
        success: false,
        error: errorMessage,
        userCancel: errorMessage.includes('User canceled') || errorMessage.includes('UserCancel')
      };
    } finally {
      setIsLoading(false);
    }
  }, [capabilities.isAvailable, rnBiometrics]);

  // Store credentials in keychain with biometric protection
  const storeCredentials = useCallback(async (
    username: string,
    password: string,
    service: string = 'UrnlabsSDK'
  ): Promise<boolean> => {
    try {
      const options: Keychain.Options = {
        service,
        accessGroup: undefined,
        rules: Keychain.RULES.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
        storage: Keychain.STORAGE_TYPE.KC_KEYCHAIN
      };

      await Keychain.setInternetCredentials(service, username, password, options);
      return true;
    } catch (error) {
      console.error('Failed to store credentials:', error);
      return false;
    }
  }, []);

  // Retrieve credentials from keychain with biometric authentication
  const retrieveCredentials = useCallback(async (
    service: string = 'UrnlabsSDK',
    promptMessage?: string
  ): Promise<KeychainCredentials | null> => {
    try {
      const options: Keychain.Options = {
        service,
        authenticationPrompt: {
          title: 'Authentication Required',
          subtitle: promptMessage || 'Please authenticate to access your credentials',
          description: 'Use your biometric or device passcode',
          fallbackLabel: 'Use Passcode',
          negative: 'Cancel'
        }
      };

      const credentials = await Keychain.getInternetCredentials(service, options);

      if (credentials && credentials.username && credentials.password) {
        return {
          username: credentials.username,
          password: credentials.password,
          service
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to retrieve credentials:', error);
      return null;
    }
  }, []);

  // Remove credentials from keychain
  const removeCredentials = useCallback(async (service: string = 'UrnlabsSDK'): Promise<boolean> => {
    try {
      await Keychain.resetInternetCredentials(service);
      return true;
    } catch (error) {
      console.error('Failed to remove credentials:', error);
      return false;
    }
  }, []);

  // Check if credentials exist in keychain
  const hasStoredCredentials = useCallback(async (service: string = 'UrnlabsSDK'): Promise<boolean> => {
    try {
      const credentials = await Keychain.getInternetCredentials(service);
      return !!(credentials && credentials.username && credentials.password);
    } catch (error) {
      return false;
    }
  }, []);

  // Biometric login with stored credentials
  const biometricLogin = useCallback(async (options: {
    service?: string;
    promptMessage?: string;
    fallbackToPassword?: boolean;
  } = {}): Promise<{ success: boolean; error?: string; user?: any }> => {
    const service = options.service || 'UrnlabsSDK';

    try {
      // Check if credentials are stored
      const hasCredentials = await hasStoredCredentials(service);
      if (!hasCredentials) {
        return {
          success: false,
          error: 'No stored credentials found'
        };
      }

      // Retrieve credentials with biometric authentication
      const credentials = await retrieveCredentials(service, options.promptMessage);
      if (!credentials) {
        return {
          success: false,
          error: 'Failed to retrieve credentials'
        };
      }

      // Login with retrieved credentials
      const user = await sdk.auth.login({
        username: credentials.username,
        password: credentials.password
      });

      return {
        success: true,
        user
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Biometric login failed';

      return {
        success: false,
        error: errorMessage
      };
    }
  }, [sdk.auth, hasStoredCredentials, retrieveCredentials]);

  // Setup biometric login for current user
  const setupBiometricLogin = useCallback(async (
    password: string,
    service: string = 'UrnlabsSDK'
  ): Promise<boolean> => {
    try {
      const user = sdk.auth.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user');
      }

      // Store credentials with biometric protection
      const success = await storeCredentials(user.username, password, service);
      if (success) {
        // Create biometric keys if they don't exist
        await createKeys();
      }

      return success;
    } catch (error) {
      console.error('Failed to setup biometric login:', error);
      return false;
    }
  }, [sdk.auth, storeCredentials, createKeys]);

  // Disable biometric login
  const disableBiometricLogin = useCallback(async (service: string = 'UrnlabsSDK'): Promise<boolean> => {
    try {
      await removeCredentials(service);
      await deleteKeys();
      return true;
    } catch (error) {
      console.error('Failed to disable biometric login:', error);
      return false;
    }
  }, [removeCredentials, deleteKeys]);

  // Initialize capabilities on mount
  useEffect(() => {
    checkCapabilities();
  }, [checkCapabilities]);

  return {
    // Capabilities
    capabilities,
    checkCapabilities,
    isLoading,

    // Biometric authentication
    authenticate,
    authenticateAndSign,
    createKeys,
    deleteKeys,

    // Keychain operations
    storeCredentials,
    retrieveCredentials,
    removeCredentials,
    hasStoredCredentials,

    // Convenience methods
    biometricLogin,
    setupBiometricLogin,
    disableBiometricLogin,

    // Computed properties
    isAvailable: capabilities.isAvailable,
    biometryType: capabilities.biometryType,
    supportsFaceID: capabilities.biometryType === ReactNativeBiometrics.FaceID,
    supportsTouchID: capabilities.biometryType === ReactNativeBiometrics.TouchID,
    supportsFingerprint: capabilities.biometryType === ReactNativeBiometrics.Biometrics
  };
}