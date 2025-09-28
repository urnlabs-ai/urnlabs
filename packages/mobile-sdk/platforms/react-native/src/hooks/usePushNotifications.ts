/**
 * Push notifications hook for React Native
 * Supports Firebase Cloud Messaging and iOS push notifications
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert, Linking } from 'react-native';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import PushNotificationIOS from '@react-native-community/push-notification-ios';
import { useUrnlabsSDK } from './useUrnlabsSDK';

export interface NotificationPermission {
  hasPermission: boolean;
  authorizationStatus: number;
  isProvisional?: boolean;
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  actionUrl?: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationAction {
  id: string;
  title: string;
  options?: {
    foreground?: boolean;
    destructive?: boolean;
    authenticationRequired?: boolean;
  };
}

export interface NotificationChannel {
  id: string;
  name: string;
  description?: string;
  importance: 'low' | 'default' | 'high' | 'max';
  sound?: string;
  vibration?: boolean;
  lights?: boolean;
}

/**
 * Push notifications management hook
 */
export function usePushNotifications() {
  const { sdk } = useUrnlabsSDK();
  const [permission, setPermission] = useState<NotificationPermission>({
    hasPermission: false,
    authorizationStatus: -1
  });
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Request notification permissions
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'ios') {
        const authStatus = await messaging().requestPermission({
          alert: true,
          announcement: false,
          badge: true,
          carPlay: false,
          critical: false,
          provisional: false,
          sound: true,
        });

        const hasPermission = authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                             authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        setPermission({
          hasPermission,
          authorizationStatus: authStatus,
          isProvisional: authStatus === messaging.AuthorizationStatus.PROVISIONAL
        });

        return hasPermission;
      } else {
        // Android permissions are granted automatically
        setPermission({
          hasPermission: true,
          authorizationStatus: messaging.AuthorizationStatus.AUTHORIZED
        });

        return true;
      }
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  }, []);

  // Check current permission status
  const checkPermission = useCallback(async () => {
    try {
      const authStatus = await messaging().hasPermission();
      const hasPermission = authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                           authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      setPermission({
        hasPermission,
        authorizationStatus: authStatus,
        isProvisional: authStatus === messaging.AuthorizationStatus.PROVISIONAL
      });

      return hasPermission;
    } catch (error) {
      console.error('Failed to check notification permissions:', error);
      return false;
    }
  }, []);

  // Get FCM token
  const getFCMToken = useCallback(async (): Promise<string | null> => {
    try {
      const token = await messaging().getToken();
      setFcmToken(token);
      return token;
    } catch (error) {
      console.error('Failed to get FCM token:', error);
      return null;
    }
  }, []);

  // Register device with backend
  const registerDevice = useCallback(async () => {
    try {
      const token = await getFCMToken();
      if (!token) {
        throw new Error('No FCM token available');
      }

      await sdk.http.post('/api/devices/register', {
        token,
        platform: Platform.OS,
        userId: sdk.auth.getCurrentUser()?.id
      });

      return true;
    } catch (error) {
      console.error('Failed to register device:', error);
      return false;
    }
  }, [sdk, getFCMToken]);

  // Unregister device
  const unregisterDevice = useCallback(async () => {
    try {
      if (!fcmToken) {
        return true;
      }

      await sdk.http.post('/api/devices/unregister', {
        token: fcmToken
      });

      return true;
    } catch (error) {
      console.error('Failed to unregister device:', error);
      return false;
    }
  }, [sdk, fcmToken]);

  // Handle notification received while app is in foreground
  const handleForegroundMessage = useCallback((message: FirebaseMessagingTypes.RemoteMessage) => {
    const notification: PushNotification = {
      id: message.messageId || Date.now().toString(),
      title: message.notification?.title || 'Notification',
      body: message.notification?.body || '',
      data: message.data,
      imageUrl: message.notification?.android?.imageUrl || message.notification?.ios?.attachments?.[0]?.url,
      timestamp: Date.now(),
      read: false
    };

    setNotifications(prev => [notification, ...prev]);

    // Show local notification on iOS
    if (Platform.OS === 'ios') {
      PushNotificationIOS.addNotificationRequest({
        id: notification.id,
        title: notification.title,
        subtitle: '',
        body: notification.body,
        sound: 'default',
        badge: 1,
        userInfo: notification.data || {}
      });
    }
  }, []);

  // Handle notification opened (app launched from notification)
  const handleNotificationOpened = useCallback((message: FirebaseMessagingTypes.RemoteMessage) => {
    const notification: PushNotification = {
      id: message.messageId || Date.now().toString(),
      title: message.notification?.title || 'Notification',
      body: message.notification?.body || '',
      data: message.data,
      imageUrl: message.notification?.android?.imageUrl || message.notification?.ios?.attachments?.[0]?.url,
      timestamp: Date.now(),
      read: true
    };

    setNotifications(prev => {
      const existing = prev.find(n => n.id === notification.id);
      if (existing) {
        return prev.map(n => n.id === notification.id ? { ...n, read: true } : n);
      }
      return [notification, ...prev];
    });

    // Handle deep linking if actionUrl is provided
    if (notification.data?.actionUrl) {
      Linking.openURL(notification.data.actionUrl).catch(error =>
        console.error('Failed to open notification URL:', error)
      );
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  }, []);

  // Clear notification
  const clearNotification = useCallback((notificationId: string) => {
    setNotifications(prev =>
      prev.filter(n => n.id !== notificationId)
    );

    // Clear from system notification center on iOS
    if (Platform.OS === 'ios') {
      PushNotificationIOS.removeDeliveredNotifications([notificationId]);
    }
  }, []);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);

    // Clear from system notification center
    if (Platform.OS === 'ios') {
      PushNotificationIOS.removeAllDeliveredNotifications();
    }
  }, []);

  // Send test notification
  const sendTestNotification = useCallback(async () => {
    try {
      await sdk.http.post('/api/notifications/test', {
        token: fcmToken,
        title: 'Test Notification',
        body: 'This is a test notification from Urnlabs SDK'
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
      throw error;
    }
  }, [sdk, fcmToken]);

  // Set badge count (iOS only)
  const setBadgeCount = useCallback((count: number) => {
    if (Platform.OS === 'ios') {
      PushNotificationIOS.setApplicationIconBadgeNumber(count);
    }
  }, []);

  // Open app settings for notifications
  const openNotificationSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  // Initialize notifications
  useEffect(() => {
    if (isInitialized) return;

    const initializeNotifications = async () => {
      try {
        // Check initial permission
        await checkPermission();

        // Get initial FCM token
        await getFCMToken();

        // Set up message handlers
        const unsubscribeOnMessage = messaging().onMessage(handleForegroundMessage);

        // Handle notification opened app
        messaging().onNotificationOpenedApp(handleNotificationOpened);

        // Check if app was opened from a notification
        const initialNotification = await messaging().getInitialNotification();
        if (initialNotification) {
          handleNotificationOpened(initialNotification);
        }

        // Listen for token refresh
        const unsubscribeOnTokenRefresh = messaging().onTokenRefresh(token => {
          setFcmToken(token);
          // Re-register device with new token
          registerDevice();
        });

        setIsInitialized(true);

        // Cleanup function
        return () => {
          unsubscribeOnMessage();
          unsubscribeOnTokenRefresh();
        };
      } catch (error) {
        console.error('Failed to initialize notifications:', error);
      }
    };

    const cleanup = initializeNotifications();

    return () => {
      cleanup.then(cleanupFn => cleanupFn?.());
    };
  }, [isInitialized, checkPermission, getFCMToken, handleForegroundMessage, handleNotificationOpened, registerDevice]);

  // Auto-register device when authenticated and permission granted
  useEffect(() => {
    if (permission.hasPermission && fcmToken && sdk.auth.isAuthenticated) {
      registerDevice();
    }
  }, [permission.hasPermission, fcmToken, sdk.auth.isAuthenticated, registerDevice]);

  return {
    // Permission state
    permission,
    requestPermission,
    checkPermission,
    openNotificationSettings,

    // Token management
    fcmToken,
    getFCMToken,
    registerDevice,
    unregisterDevice,

    // Notifications
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,

    // Utilities
    sendTestNotification,
    setBadgeCount,
    isInitialized
  };
}