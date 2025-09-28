# Urnlabs Mobile SDK

[![Flutter](https://img.shields.io/badge/Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white)](https://flutter.dev)
[![iOS](https://img.shields.io/badge/iOS-000000?style=for-the-badge&logo=ios&logoColor=white)](https://developer.apple.com/ios/)
[![Swift](https://img.shields.io/badge/Swift-FA7343?style=for-the-badge&logo=swift&logoColor=white)](https://swift.org)

The Urnlabs Mobile SDK provides native mobile integration for the Urnlabs AI Agent Platform, enabling developers to build powerful AI-driven mobile applications with authentication, workflow management, agent interactions, and file handling capabilities.

## Features

- 🔐 **Authentication** - Complete auth flow with MFA support
- 🤖 **AI Agents** - Chat and interact with AI agents
- ⚡ **Workflows** - Execute and monitor AI workflows
- 📁 **File Management** - Upload, download, and manage files
- 🔄 **Real-time Updates** - WebSocket integration for live updates
- 💾 **Offline Support** - Local storage and sync capabilities
- 🔒 **Security** - Certificate pinning and secure storage
- 📱 **Platform Native** - Optimized for each platform

## Platform Support

| Platform | Status | Implementation |
|----------|--------|----------------|
| **Flutter** | ✅ Complete | Dart with Provider pattern, SQLite storage |
| **iOS** | ✅ Complete | Swift with Combine framework, Core Data |
| **Android** | 🔄 Coming Soon | Kotlin with Jetpack Compose |
| **React Native** | ✅ Available | TypeScript with AsyncStorage |

## Quick Start

### Flutter

#### Installation

Add to your `pubspec.yaml`:

```yaml
dependencies:
  urnlabs_mobile_sdk:
    path: ../packages/mobile-sdk/platforms/flutter
```

#### Basic Usage

```dart
import 'package:urnlabs_mobile_sdk/urnlabs_mobile_sdk.dart';

// Initialize SDK
final config = SDKConfig.development(apiKey: 'your-api-key');
await UrnlabsSDK.initialize(config);

// Authentication
final authResult = await UrnlabsSDK.instance.auth.signIn(email, password);

// Execute Workflow
final workflows = await UrnlabsSDK.instance.workflows.getWorkflows();
final workflowRun = await UrnlabsSDK.instance.workflows.executeWorkflow(
  workflows.first.id,
  input: {'text': 'Hello, AI!'}
);

// Chat with Agent
final agents = await UrnlabsSDK.instance.agents.getAgents();
final conversation = await UrnlabsSDK.instance.agents.startConversation(
  agents.first.id,
  initialMessage: 'Hi there!'
);
```

### iOS

#### Installation

Add to your `Package.swift`:

```swift
dependencies: [
    .package(path: "../packages/mobile-sdk/platforms/ios")
]
```

#### Basic Usage

```swift
import UrnlabsSDK
import SwiftUI

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    Task {
                        let config = SDKConfig.development(apiKey: "your-api-key")
                        try await UrnlabsSDK.shared.initialize(config: config)
                    }
                }
        }
    }
}

// Authentication
let authService = UrnlabsSDK.shared.authService
let result = try await authService?.signIn(email: email, password: password)

// Execute Workflow
let workflowService = UrnlabsSDK.shared.workflowService
let workflows = try await workflowService?.getWorkflows()
let run = try await workflowService?.executeWorkflow(
    workflows?.first?.id ?? "",
    input: ["text": "Hello, AI!"]
)
```

## Architecture

### Flutter SDK Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Flutter App Layer                   │
├─────────────────────────────────────────────────────┤
│  Provider State Management │  UI Components          │
├─────────────────────────────────────────────────────┤
│                UrnlabsSDK Core                      │
├─────────────────┬───────────────┬───────────────────┤
│  Auth Service   │ Workflow Svc  │  Agent Service    │
│  File Service   │ WebSocket Svc │  Storage Adapter  │
├─────────────────┼───────────────┼───────────────────┤
│            HTTP Client (Dio)    │  SQLite Storage   │
├─────────────────┴───────────────┴───────────────────┤
│         Connectivity │  Local Database               │
└─────────────────────────────────────────────────────┘
```

### iOS SDK Architecture

```
┌─────────────────────────────────────────────────────┐
│              SwiftUI/UIKit App Layer                │
├─────────────────────────────────────────────────────┤
│  Combine Publishers    │  @StateObject/@Published   │
├─────────────────────────────────────────────────────┤
│               UrnlabsSDK Core                       │
├─────────────────┬───────────────┬───────────────────┤
│  Auth Service   │ Workflow Svc  │  Agent Service    │
│  File Service   │ WebSocket Svc │  Storage Adapter  │
├─────────────────┼───────────────┼───────────────────┤
│        URLSession + Combine     │  Core Data        │
├─────────────────┴───────────────┴───────────────────┤
│      Network Monitor │  Keychain │  Background Sync │
└─────────────────────────────────────────────────────┘
```

## Configuration

### Environment Configurations

#### Development
```dart
// Flutter
final config = SDKConfig.development(apiKey: 'dev-key');

// iOS
let config = SDKConfig.development(apiKey: "dev-key")
```

#### Staging
```dart
// Flutter
final config = SDKConfig.staging(apiKey: 'staging-key');

// iOS
let config = SDKConfig.staging(apiKey: "staging-key")
```

#### Production
```dart
// Flutter
final config = SDKConfig.production(apiKey: 'prod-key');

// iOS
let config = SDKConfig.production(apiKey: "prod-key")
```

### Custom Configuration

#### Flutter
```dart
final config = SDKConfig(
  baseUrl: 'https://custom-api.example.com',
  websocketUrl: 'wss://custom-ws.example.com',
  apiKey: 'your-api-key',
  timeout: Duration(seconds: 30),
  retryAttempts: 3,
  enableLogging: true,
  logLevel: LogLevel.debug,
  enableOffline: true,
  certificatePinning: ['cert-fingerprint'],
);
```

#### iOS
```swift
let config = SDKConfig(
    baseURL: URL(string: "https://custom-api.example.com")!,
    websocketURL: URL(string: "wss://custom-ws.example.com"),
    apiKey: "your-api-key",
    timeout: 30.0,
    retryAttempts: 3,
    enableLogging: true,
    logLevel: .debug,
    enableOffline: true,
    certificatePinning: CertificatePinningConfig(
        certificates: ["cert-fingerprint"]
    )
)
```

## Services

### Authentication Service

#### Sign In
```dart
// Flutter
final result = await UrnlabsSDK.instance.auth.signIn(email, password);
if (result.requiresMfa) {
  final mfaResult = await UrnlabsSDK.instance.auth.verifyMfa(mfaCode);
}

// iOS
let result = try await authService.signIn(email: email, password: password)
if result.requiresMfa {
    let mfaResult = try await authService.verifyMfa(code: mfaCode)
}
```

#### OAuth Sign In
```dart
// Flutter
final result = await UrnlabsSDK.instance.auth.signInWithOAuth('google', authCode);

// iOS
let result = try await authService.signInWithOAuth(provider: .google, code: authCode)
```

### Workflow Service

#### Execute Workflow
```dart
// Flutter
final workflowRun = await UrnlabsSDK.instance.workflows.executeWorkflow(
  workflowId,
  input: {'prompt': 'Generate a summary'},
  config: {'temperature': 0.7}
);

// Subscribe to updates
UrnlabsSDK.instance.workflows.subscribeToWorkflowRun(workflowRun.id)
  .listen((status) {
    print('Workflow status: ${status.status}');
  });

// iOS
let workflowRun = try await workflowService.executeWorkflow(
    workflowId,
    input: ["prompt": "Generate a summary"],
    config: ["temperature": 0.7]
)

// Subscribe to updates
workflowService.subscribeToWorkflowRun(workflowRun.id)
    .sink { status in
        print("Workflow status: \(status.status)")
    }
    .store(in: &cancellables)
```

### Agent Service

#### Start Conversation
```dart
// Flutter
final conversation = await UrnlabsSDK.instance.agents.startConversation(
  agentId,
  initialMessage: 'Hello!',
  context: {'user_preference': 'helpful'}
);

// Send message
final message = await UrnlabsSDK.instance.agents.sendMessage(
  conversation.id,
  'Can you help me with this task?'
);

// iOS
let conversation = try await agentService.startConversation(
    agentId,
    initialMessage: "Hello!",
    context: ["user_preference": "helpful"]
)

// Send message
let message = try await agentService.sendMessage(
    conversation.id,
    "Can you help me with this task?"
)
```

### File Service

#### Upload File
```dart
// Flutter
final file = File('path/to/file.pdf');
final uploadResult = await UrnlabsSDK.instance.files.uploadFile(
  file,
  filename: 'document.pdf',
  description: 'Important document'
);

// iOS
let fileData = Data(contentsOf: fileURL)
let uploadResult = try await fileService.uploadFile(
    fileData,
    fileName: "document.pdf",
    mimeType: "application/pdf",
    description: "Important document"
)
```

## Error Handling

### Flutter
```dart
try {
  final result = await UrnlabsSDK.instance.auth.signIn(email, password);
} on SDKError catch (e) {
  switch (e.code) {
    case 'UNAUTHORIZED':
      // Handle invalid credentials
      break;
    case 'NETWORK_UNAVAILABLE':
      // Handle network issues
      break;
    case 'MFA_REQUIRED':
      // Prompt for MFA
      break;
    default:
      // Handle other errors
      break;
  }
}
```

### iOS
```swift
do {
    let result = try await authService.signIn(email: email, password: password)
} catch let error as SDKError {
    switch error {
    case .unauthorized:
        // Handle invalid credentials
        break
    case .networkUnavailable:
        // Handle network issues
        break
    case .mfaRequired:
        // Prompt for MFA
        break
    default:
        // Handle other errors
        break
    }
}
```

## Offline Support

Both SDKs provide robust offline capabilities:

- **Local Storage**: Data cached locally for offline access
- **Queue Management**: Operations queued when offline, synced when online
- **Conflict Resolution**: Automatic handling of data conflicts
- **Background Sync**: iOS background app refresh and Flutter periodic sync

### Flutter Offline Configuration
```dart
// Configure offline behavior
final config = SDKConfig(
  enableOffline: true,
  // ... other config
);

// Check offline status
final isOffline = !UrnlabsSDK.instance.isOnline;

// Force offline mode for testing
UrnlabsSDK.instance.setOfflineMode(true);
```

### iOS Offline Configuration
```swift
// Configure offline behavior
let config = SDKConfig(
    enableOffline: true,
    backgroundSync: BackgroundSyncConfig(
        enabled: true,
        syncInterval: 300 // 5 minutes
    )
)

// Check offline status
let isOffline = !UrnlabsSDK.shared.isOnline

// Force offline mode for testing
UrnlabsSDK.shared.setOfflineMode(true)
```

## Security

### Certificate Pinning

#### Flutter
```dart
final config = SDKConfig(
  certificatePinning: [
    'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
  ],
);
```

#### iOS
```swift
let config = SDKConfig(
    certificatePinning: CertificatePinningConfig(
        certificates: [
            "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
        ]
    )
)
```

### Secure Storage

- **Flutter**: Uses `flutter_secure_storage` for sensitive data
- **iOS**: Uses Keychain Services for secure credential storage
- **Encryption**: All sensitive data encrypted at rest
- **Access Control**: Biometric protection available on supported devices

## Examples

Complete example applications are provided in the `/examples` directory:

- **Flutter Example**: `/examples/flutter/main.dart`
- **iOS Example**: `/examples/ios/ContentView.swift`

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📧 Email: support@urnlabs.com
- 📖 Documentation: [docs.urnlabs.com](https://docs.urnlabs.com)
- 🐛 Issues: [GitHub Issues](https://github.com/urnlabs/mobile-sdk/issues)
- 💬 Discord: [Urnlabs Community](https://discord.gg/urnlabs)

---

Made with ❤️ by the Urnlabs team