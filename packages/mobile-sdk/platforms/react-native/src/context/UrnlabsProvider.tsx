/**
 * React Context Provider for Urnlabs SDK
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { UrnlabsReactNativeSDK } from '../UrnlabsSDK';
import { SDKConfig } from '@urnlabs/mobile-sdk-core';

interface UrnlabsContextType {
  sdk: UrnlabsReactNativeSDK;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

export const UrnlabsContext = createContext<UrnlabsContextType | null>(null);

interface UrnlabsProviderProps {
  children: ReactNode;
  config: Partial<SDKConfig>;
  autoInitialize?: boolean;
}

export function UrnlabsProvider({
  children,
  config,
  autoInitialize = true
}: UrnlabsProviderProps) {
  const [sdk] = useState(() => new UrnlabsReactNativeSDK(config));
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(autoInitialize);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (autoInitialize) {
      initializeSDK();
    }
  }, [autoInitialize]);

  useEffect(() => {
    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (sdk.wsClient && typeof sdk.wsClient.handleAppStateChange === 'function') {
        sdk.wsClient.handleAppStateChange(nextAppState);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [sdk]);

  const initializeSDK = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await sdk.initialize();
      setIsInitialized(true);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Failed to initialize Urnlabs SDK:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: UrnlabsContextType = {
    sdk,
    isInitialized,
    isLoading,
    error
  };

  return (
    <UrnlabsContext.Provider value={contextValue}>
      {children}
    </UrnlabsContext.Provider>
  );
}

/**
 * Hook to access the Urnlabs context
 */
export function useUrnlabs() {
  const context = useContext(UrnlabsContext);
  if (!context) {
    throw new Error('useUrnlabs must be used within UrnlabsProvider');
  }
  return context;
}