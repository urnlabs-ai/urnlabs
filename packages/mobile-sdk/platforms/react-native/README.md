# Urnlabs React Native SDK

A comprehensive React Native SDK for integrating with the Urnlabs AI Agent Platform, providing powerful hooks, offline capabilities, and native mobile features.

## Features

- 🔐 **Authentication & Biometric Auth** - Secure login with Face ID, Touch ID, and device credentials
- 📱 **Push Notifications** - Firebase Cloud Messaging integration with rich notifications
- 💾 **Offline-First** - Intelligent caching, data synchronization, and conflict resolution
- 📁 **File Operations** - Upload/download with progress tracking and React Native FS integration
- 🔄 **Real-time Communication** - WebSocket-based live updates and messaging
- 🤖 **AI Workflows & Agents** - Complete workflow orchestration and agent management
- 🎯 **Background Tasks** - Background sync and long-running operations
- 📊 **Analytics & Monitoring** - Built-in telemetry and performance tracking
- 🔧 **TypeScript First** - Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install @urnlabs/mobile-sdk-react-native

# iOS additional setup
cd ios && pod install

# For push notifications
npm install @react-native-firebase/app @react-native-firebase/messaging

# For biometric authentication
npm install react-native-biometrics react-native-keychain

# For file operations
npm install react-native-fs react-native-document-picker react-native-image-picker

# For background tasks
npm install react-native-background-job

# For network detection
npm install @react-native-community/netinfo
```

## Quick Start

### 1. Setup the Provider

```typescript
import React from 'react';
import { UrnlabsProvider, ReactNativeSDKConfig } from '@urnlabs/mobile-sdk-react-native';

const config: ReactNativeSDKConfig = {
  apiUrl: 'https://api.urnlabs.com',
  websocketUrl: 'wss://ws.urnlabs.com',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  enableLogging: true,
  logLevel: 'info',
  enableOffline: true,
  platform: {
    enableBiometrics: true,
    enablePushNotifications: true,
    enableBackgroundSync: true,
    enableFileOperations: true,
    enableOfflineMode: true,
  },
  // ... additional configuration
};

const App: React.FC = () => {
  return (
    <UrnlabsProvider config={config}>
      <YourApp />
    </UrnlabsProvider>
  );
};
```

### 2. Use Authentication

```typescript
import { useAuth } from '@urnlabs/mobile-sdk-react-native';

const LoginScreen: React.FC = () => {
  const { isAuthenticated, login, logout, isLoading, error } = useAuth();

  const handleLogin = async () => {
    try {
      await login({ username: 'user@example.com', password: 'password' });
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <View>
      {!isAuthenticated ? (
        <Button title="Login" onPress={handleLogin} disabled={isLoading} />
      ) : (
        <Button title="Logout" onPress={logout} />
      )}
      {error && <Text>Error: {error}</Text>}
    </View>
  );
};
```

### 3. Implement Offline Data

```typescript
import { useOfflineData, useCachedQuery } from '@urnlabs/mobile-sdk-react-native';

const DataScreen: React.FC = () => {
  const { isOnline, isSyncing, pendingOperationsCount, syncData } = useOfflineData();

  const { data, isLoading, error, isCached } = useCachedQuery(
    'user-workflows',
    () => fetch('/api/workflows').then(res => res.json()),
    { ttl: 5 * 60 * 1000, staleWhileRevalidate: true }
  );

  return (
    <View>
      <Text>Status: {isOnline ? 'Online' : 'Offline'}</Text>
      <Text>Pending: {pendingOperationsCount} operations</Text>
      {isCached && <Text>📱 Showing cached data</Text>}
      <Button title="Sync Now" onPress={syncData} disabled={isSyncing} />
    </View>
  );
};
```

## Core Hooks

### Authentication Hook

```typescript
const {
  isAuthenticated,
  user,
  isLoading,
  error,
  login,
  logout,
  refreshTokens
} = useAuth();
```

### Offline Data Hook

```typescript
const {
  isOnline,
  isSyncing,
  pendingOperationsCount,
  lastSyncTime,
  syncError,
  syncData,
  queueOperation,
  offlineManager
} = useOfflineData({
  autoSync: true,
  syncOnAppForeground: true,
  syncOnNetworkReconnect: true,
  syncInterval: 5 * 60 * 1000 // 5 minutes
});
```

### File Operations Hook

```typescript
const {
  pickFile,
  pickImage,
  uploadFile,
  downloadFile,
  uploads,
  downloads,
  hasActiveUploads
} = useFileOperations();

// Pick and upload image
const handleImageUpload = async () => {
  const image = await pickImage({ source: 'gallery', quality: 0.8 });
  if (image) {
    const result = await uploadFile(image, {
      onProgress: (progress) => console.log(`Upload: ${progress}%`)
    });
  }
};
```

### Push Notifications Hook

```typescript
const {
  permission,
  fcmToken,
  notifications,
  unreadCount,
  requestPermission,
  registerDevice,
  markAsRead,
  clearAllNotifications
} = usePushNotifications();

// Request permission and register
useEffect(() => {
  requestPermission().then(granted => {
    if (granted) {
      registerDevice();
    }
  });
}, []);
```

### Biometric Authentication Hook

```typescript
const {
  isAvailable,
  biometryType,
  authenticate,
  biometricLogin,
  setupBiometricLogin,
  storeCredentials
} = useBiometricAuth();

// Setup biometric login
const enableBiometrics = async () => {
  const result = await authenticate({
    promptMessage: 'Enable biometric login'
  });

  if (result.success) {
    await setupBiometricLogin(currentPassword);
  }
};

// Login with biometrics
const loginWithBiometrics = async () => {
  const result = await biometricLogin({
    promptMessage: 'Login with biometrics'
  });

  if (result.success) {
    console.log('Logged in:', result.user);
  }
};
```

### Background Tasks Hook

```typescript
const {
  tasks,
  registerTask,
  backgroundSyncConfig,
  hasActiveTasks
} = useBackgroundTasks();

// Register background sync task
useEffect(() => {
  const taskId = registerTask(
    'Data Sync',
    async () => {
      await syncUserData();
    },
    {
      interval: 10 * 60 * 1000, // 10 minutes
      requiresNetwork: true,
      runOnAppBackground: true
    }
  );

  return () => cancelTask(taskId);
}, []);
```

### Workflow Management Hook

```typescript
const {
  workflows,
  currentWorkflow,
  isLoading,
  executeWorkflow,
  cancelWorkflow
} = useWorkflow();

// Execute a workflow
const runWorkflow = async () => {
  try {
    const result = await executeWorkflow('workflow-id', {
      input: 'Process this data'
    });
    console.log('Workflow result:', result);
  } catch (error) {
    console.error('Workflow failed:', error);
  }
};
```

### AI Agents Hook

```typescript
const { agents, isLoading, fetchAgents } = useAgents();

// List available agents
useEffect(() => {
  fetchAgents();
}, []);
```

### Real-time Communication Hook

```typescript
const {
  messages,
  isConnected,
  sendMessage,
  clearMessages
} = useRealtime('workflow-updates');

// Send message
const handleSendMessage = () => {
  sendMessage({
    type: 'user_action',
    payload: { action: 'start_workflow' }
  });
};
```

## Advanced Features

### Cached Queries with Offline Support

```typescript
const { data, isLoading, error, isCached, refetch } = useCachedQuery(
  'user-data',
  fetchUserData,
  {
    ttl: 60 * 60 * 1000, // 1 hour
    staleWhileRevalidate: true,
    retryOnReconnect: true
  }
);
```

### Offline Mutations

```typescript
const { mutate, isLoading, error } = useOfflineMutation(
  updateUserProfile,
  {
    endpoint: '/api/user/profile',
    optimisticUpdate: (variables) => ({ ...currentUser, ...variables }),
    onSuccess: (data) => console.log('Profile updated:', data),
    onError: (error) => console.error('Update failed:', error)
  }
);
```

### Advanced File Operations

```typescript
// Pick multiple files
const files = await pickFile({
  type: ['image/*', 'application/pdf'],
  allowMultiSelection: true
});

// Upload with progress
for (const file of files) {
  await uploadFile(file, {
    onProgress: (progress) => setUploadProgress(file.id, progress),
    quality: 0.7,
    maxWidth: 1920,
    maxHeight: 1080
  });
}

// Download with custom destination
const localPath = await downloadFile(
  'file-id',
  'https://api.urnlabs.com/files/document.pdf',
  {
    destination: `${RNFS.DocumentDirectoryPath}/downloads/document.pdf`,
    onProgress: (progress) => setDownloadProgress(progress)
  }
);
```

### Background Task Management

```typescript
// Register different types of background tasks
const syncTaskId = registerTask('sync', syncData, {
  interval: 5 * 60 * 1000,
  priority: 'high',
  requiresNetwork: true
});

const analyticsTaskId = registerTask('analytics', sendAnalytics, {
  interval: 30 * 60 * 1000,
  priority: 'low',
  runOnAppBackground: true
});

// Monitor task status
const runningTasks = getTasksByStatus('running');
const failedTasks = getTasksByStatus('failed');
```

## Configuration

### Complete SDK Configuration

```typescript
const config: ReactNativeSDKConfig = {
  // Core configuration
  apiUrl: 'https://api.urnlabs.com',
  websocketUrl: 'wss://ws.urnlabs.com',
  apiKey: 'your-api-key',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  enableLogging: true,
  logLevel: 'info',
  enableOffline: true,

  // Platform features
  platform: {
    enableBiometrics: true,
    enablePushNotifications: true,
    enableBackgroundSync: true,
    enableFileOperations: true,
    enableOfflineMode: true,
  },

  // Push notifications
  pushNotifications: {
    firebaseConfig: {
      apiKey: 'your-firebase-api-key',
      authDomain: 'your-app.firebaseapp.com',
      projectId: 'your-project-id',
      storageBucket: 'your-app.appspot.com',
      messagingSenderId: '123456789',
      appId: 'your-app-id'
    },
    enableForegroundNotifications: true,
    enableBackgroundNotifications: true,
    badgeCount: true,
  },

  // Biometric authentication
  biometrics: {
    promptMessage: 'Authenticate with biometrics',
    cancelButtonText: 'Cancel',
    fallbackButtonText: 'Use Passcode',
    allowDeviceCredentials: true,
  },

  // File operations
  fileOperations: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedFileTypes: ['image/*', 'application/pdf', 'text/*'],
    enableImagePicker: true,
    enableDocumentPicker: true,
    uploadTimeout: 300000, // 5 minutes
    downloadTimeout: 300000,
  },

  // Offline capabilities
  offline: {
    cacheSize: 200, // 200MB
    cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
    maxPendingOperations: 1000,
    syncStrategy: 'background',
    conflictResolution: 'remote_wins',
  },

  // Certificate pinning (optional)
  certificatePinning: {
    enabled: true,
    certificates: ['cert-hash-1', 'cert-hash-2']
  }
};
```

## Platform Support

### iOS Requirements
- iOS 12.0+
- Xcode 12+
- CocoaPods

### Android Requirements
- Android API 21+
- Kotlin support
- Java 8+

### Permissions

#### iOS (Info.plist)
```xml
<key>NSCameraUsageDescription</key>
<string>This app needs access to camera to take photos</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>This app needs access to photo library to select images</string>
<key>NSFaceIDUsageDescription</key>
<string>This app uses Face ID for secure authentication</string>
```

#### Android (android/app/src/main/AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
```

## Error Handling

```typescript
import { ReactNativeSDKError } from '@urnlabs/mobile-sdk-react-native';

// Global error handling
const handleSDKError = (error: ReactNativeSDKError) => {
  switch (error.code) {
    case 'BIOMETRIC_NOT_AVAILABLE':
      Alert.alert('Biometric authentication not available');
      break;
    case 'NETWORK_NOT_AVAILABLE':
      // Handle offline mode
      break;
    case 'STORAGE_QUOTA_EXCEEDED':
      // Clear cache or prompt user
      break;
    default:
      console.error('SDK Error:', error);
  }
};

// In provider
<UrnlabsProvider config={config} onError={handleSDKError}>
  <App />
</UrnlabsProvider>
```

## Best Practices

1. **Authentication**
   - Always check authentication status before making API calls
   - Implement biometric fallback for better UX
   - Store sensitive data in keychain with biometric protection

2. **Offline Support**
   - Design for offline-first experience
   - Use optimistic updates for better perceived performance
   - Handle conflicts gracefully

3. **File Operations**
   - Validate file types and sizes before upload
   - Show progress indicators for long operations
   - Implement retry logic for failed uploads

4. **Push Notifications**
   - Request permissions at appropriate time
   - Handle notification actions properly
   - Implement deep linking for notification taps

5. **Background Tasks**
   - Keep background tasks lightweight
   - Respect platform limitations
   - Use appropriate priorities

6. **Performance**
   - Implement proper caching strategies
   - Use image compression for uploads
   - Monitor memory usage with large files

## Troubleshooting

### Common Issues

1. **Build Errors**
   - Ensure all native dependencies are linked
   - Check iOS pods are installed
   - Verify Android permissions

2. **Authentication Issues**
   - Check API endpoints and credentials
   - Verify network connectivity
   - Check token expiration

3. **File Upload Issues**
   - Check file size limits
   - Verify file type restrictions
   - Check network timeout settings

4. **Push Notification Issues**
   - Verify Firebase configuration
   - Check device permissions
   - Test with development certificates

## API Reference

For complete API documentation, see:
- [Core SDK Types](../../src/core/types.ts)
- [React Native Types](./src/types/react-native.ts)
- [Hook Documentation](./docs/hooks.md)

## Example App

See the [example app](./examples/react-native-demo) for a complete implementation showcasing all SDK features.

## Support

- 📧 Email: support@urnlabs.com
- 📚 Documentation: https://docs.urnlabs.com
- 🐛 Issues: https://github.com/urnlabs/mobile-sdk/issues

## License

MIT License - see [LICENSE](../../LICENSE) for details.