# UrnLabs AI Agents Mobile SDKs

Complete mobile SDK suite for integrating UrnLabs AI Agent Platform into mobile applications across all major platforms.

## 📱 Platform Support

| Platform | SDK | Version | Status |
|----------|-----|---------|--------|
| Android | Kotlin | 1.0.0 | ✅ Ready |
| iOS | Swift | 1.0.0 | ✅ Ready |
| Unity | C# | 1.0.0 | ✅ Ready |
| React Native | TypeScript | 1.0.0 | ✅ Ready |
| Flutter | Dart | 1.0.0 | ✅ Ready |

## 🚀 Quick Start

### Android (Kotlin)
```kotlin
// Initialize SDK
val config = SDKConfig(
    apiKey = "your_api_key",
    organizationId = "your_org_id"
)
val sdk = UrnLabsSDK.initialize(this, config)

// Execute workflow
val result = sdk.executeWorkflow("workflow_id", mapOf("param" to "value"))
```

### iOS (Swift)
```swift
// Initialize SDK
let config = SDKConfig(
    apiKey: "your_api_key",
    organizationId: "your_org_id"
)
let sdk = UrnLabsSDK.initialize(config: config)

// Execute workflow
let result = await sdk.executeWorkflow(
    workflowId: "workflow_id",
    parameters: ["param": "value"]
)
```

### Unity (C#)
```csharp
// Initialize SDK
var config = new SDKConfig
{
    ApiKey = "your_api_key",
    OrganizationId = "your_org_id"
};
var sdk = UrnLabsSDK.Initialize(config);

// Execute workflow
var result = await sdk.ExecuteWorkflow("workflow_id", new Dictionary<string, object>
{
    ["param"] = "value"
});
```

### React Native (TypeScript)
```typescript
// Initialize SDK
const config: SDKConfig = {
    apiKey: 'your_api_key',
    organizationId: 'your_org_id'
};
const sdk = UrnLabsSDK.initialize(config);

// Execute workflow
const result = await sdk.executeWorkflow('workflow_id', { param: 'value' });
```

### Flutter (Dart)
```dart
// Initialize SDK
final config = SDKConfig(
  apiKey: 'your_api_key',
  organizationId: 'your_org_id',
);
final sdk = UrnLabsSDK.initialize(config);

// Execute workflow
final result = await sdk.executeWorkflow('workflow_id', {'param': 'value'});
```

## 📖 Documentation

### Platform-Specific Guides
- [Android SDK Documentation](./android-kotlin/README.md)
- [iOS SDK Documentation](./ios-swift/README.md)
- [Unity SDK Documentation](./unity-csharp/README.md)
- [React Native SDK Documentation](./react-native/README.md)
- [Flutter SDK Documentation](./flutter-dart/README.md)

### Integration Guides
- [Getting Started Guide](./docs/getting-started.md)
- [Authentication Setup](./docs/authentication.md)
- [Workflow Execution](./docs/workflows.md)
- [Agent Communication](./docs/agents.md)
- [Offline Support](./docs/offline.md)
- [Performance Optimization](./docs/performance.md)

### API Reference
- [API Reference Documentation](./docs/api-reference.md)
- [Error Handling Guide](./docs/error-handling.md)
- [Migration Guide](./docs/migration.md)

## 🎯 Sample Applications

### Android Kotlin - Task Management App
Location: `./samples/android-task-manager/`

A complete task management application demonstrating:
- User authentication with biometric support
- Offline data synchronization
- Background workflow execution
- Real-time agent communication
- Push notifications

### iOS Swift - Productivity Suite
Location: `./samples/ios-productivity/`

A productivity app showcasing:
- Core Data integration
- CloudKit synchronization
- Siri Shortcuts integration
- Widget support
- Apple Watch companion

### Unity Game - AI-Powered Adventure
Location: `./samples/unity-ai-adventure/`

A game demonstrating:
- AI-driven NPCs with agent communication
- Dynamic quest generation through workflows
- Real-time multiplayer with agent coordination
- Analytics integration

### React Native - Customer Support
Location: `./samples/react-native-support/`

A customer support app featuring:
- Cross-platform compatibility
- Agent-powered chatbot
- Workflow automation for ticket routing
- Offline message queue

### Flutter - Business Dashboard
Location: `./samples/flutter-dashboard/`

A business dashboard app showing:
- Real-time data visualization
- Agent-driven insights
- Automated report generation
- Multi-tenant support

## 📦 Installation

### Android
Add to your `build.gradle.kts`:
```kotlin
dependencies {
    implementation("com.urnlabs:ai-agents-sdk:1.0.0")
}
```

### iOS
Add to your `Package.swift`:
```swift
dependencies: [
    .package(url: "https://github.com/urnlabs/ai-agents-sdk-ios.git", from: "1.0.0")
]
```

### Unity
Add via Unity Package Manager:
```
https://github.com/urnlabs/ai-agents-sdk-unity.git
```

### React Native
```bash
npm install @urnlabs/ai-agents-sdk
cd ios && pod install
```

### Flutter
```yaml
dependencies:
  urnlabs_ai_agents_sdk: ^1.0.0
```

## 🔧 Configuration

### Environment Setup
```typescript
interface SDKConfig {
  apiKey: string;
  organizationId: string;
  baseUrl?: string;
  environment?: 'development' | 'staging' | 'production';
  enableAnalytics?: boolean;
  enableCaching?: boolean;
  enableOfflineMode?: boolean;
  logLevel?: 'verbose' | 'debug' | 'info' | 'warn' | 'error';
}
```

### Advanced Configuration
```typescript
interface AdvancedConfig {
  networkTimeout: number;
  retryAttempts: number;
  cacheExpiration: number;
  backgroundSyncInterval: number;
  authTokenRefreshThreshold: number;
}
```

## 🔐 Security

### Authentication
- OAuth 2.0 / OpenID Connect support
- Biometric authentication (iOS Touch ID/Face ID, Android Fingerprint)
- JWT token management with automatic refresh
- Secure token storage using Keychain (iOS) and EncryptedSharedPreferences (Android)

### Data Protection
- TLS 1.3 for all network communications
- Certificate pinning for enhanced security
- Data encryption at rest using platform-specific secure storage
- GDPR and CCPA compliance ready

## 📊 Analytics & Monitoring

### Built-in Metrics
- Workflow execution performance
- Agent interaction analytics
- Network request tracking
- Error rate monitoring
- User engagement metrics

### Custom Analytics
```typescript
// Track custom events
sdk.analytics.track('user_action', {
  action: 'workflow_executed',
  workflowId: 'task_automation',
  duration: 2500
});

// Set user properties
sdk.analytics.setUserProperties({
  plan: 'premium',
  industry: 'healthcare'
});
```

## 🧪 Testing

### Unit Testing
Each SDK includes comprehensive unit test suites:
- Core functionality tests
- Network layer testing with mocks
- Authentication flow testing
- Error handling verification

### Integration Testing
- End-to-end workflow execution
- Agent communication testing
- Offline synchronization validation
- Performance benchmarking

### Example Test (Android)
```kotlin
@Test
fun `executeWorkflow should return success result`() = runTest {
    // Arrange
    val mockApiService = mockk<ApiService>()
    val sdk = UrnLabsSDK(context, config, apiService = mockApiService)

    every { mockApiService.executeWorkflow(any()) } returns flowOf(
        Result.success(WorkflowExecution(id = "test", status = "completed"))
    )

    // Act
    val result = sdk.executeWorkflow("test_workflow", emptyMap())

    // Assert
    assertTrue(result.isSuccess)
    assertEquals("completed", result.getOrNull()?.status)
}
```

## 🚀 Performance Optimization

### Best Practices
- **Lazy Loading**: SDKs are initialized only when needed
- **Connection Pooling**: Efficient network resource management
- **Data Compression**: Automatic request/response compression
- **Smart Caching**: Intelligent caching with TTL and cache invalidation
- **Background Processing**: Non-blocking operations using platform-specific threading

### Memory Management
- Automatic cleanup of unused resources
- Weak references to prevent memory leaks
- Platform-specific memory optimization (ARC for iOS, GC optimization for Android)

## 🌐 Offline Support

### Offline Capabilities
- Local data storage with automatic synchronization
- Offline workflow queue with retry mechanisms
- Conflict resolution for concurrent modifications
- Background sync when connectivity is restored

### Implementation Example
```typescript
// Configure offline mode
const config: SDKConfig = {
  enableOfflineMode: true,
  backgroundSyncInterval: 300000, // 5 minutes
  // ... other config
};

// Offline workflow execution
await sdk.executeWorkflow('offline_workflow', params, {
  allowOffline: true,
  priority: 'high'
});
```

## 🔄 Migration Guide

### From Version 0.x to 1.0
1. Update SDK dependency to 1.0.0
2. Replace deprecated initialization method
3. Update authentication configuration
4. Migrate to new async/await patterns

See [Migration Guide](./docs/migration.md) for detailed instructions.

## 🛠️ Troubleshooting

### Common Issues

#### Network Connectivity
```typescript
// Check connectivity before operations
if (await sdk.isConnected()) {
  await sdk.executeWorkflow(workflowId, params);
} else {
  // Handle offline scenario
  await sdk.queueWorkflowForLater(workflowId, params);
}
```

#### Authentication Failures
```typescript
sdk.on('authenticationFailed', (error) => {
  // Redirect to login screen
  navigation.navigate('Login');
});
```

#### Performance Issues
```typescript
// Enable debug logging
sdk.setLogLevel('debug');

// Monitor performance
sdk.on('workflowExecuted', (event) => {
  console.log(`Workflow ${event.workflowId} completed in ${event.duration}ms`);
});
```

### Debug Mode
Enable comprehensive logging for troubleshooting:
```typescript
const config: SDKConfig = {
  logLevel: 'debug',
  enableDebugMode: true,
  // ... other config
};
```

## 🤝 Support

### Getting Help
- 📖 [Documentation](https://docs.urnlabs.ai/sdk)
- 💬 [Community Discord](https://discord.gg/urnlabs)
- 📧 [Developer Support](mailto:sdk-support@urnlabs.ai)
- 🐛 [Bug Reports](https://github.com/urnlabs/mobile-sdks/issues)

### Enterprise Support
- 🏢 Priority technical support
- 🔧 Custom integration assistance
- 📞 Direct engineering contact
- 🎯 SLA guarantees

Contact: enterprise@urnlabs.ai

## 📜 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## 🔄 Version History

### v1.0.0 (Current)
- ✅ Initial release with full platform support
- ✅ Comprehensive workflow execution
- ✅ Real-time agent communication
- ✅ Offline support and synchronization
- ✅ Advanced authentication and security

### Roadmap
- 🔄 v1.1.0: Enhanced analytics and monitoring
- 🔄 v1.2.0: Advanced workflow patterns
- 🔄 v1.3.0: AI-powered optimization features

---

**Ready to build AI-powered mobile experiences? Get started with our [Quick Start Guide](./docs/getting-started.md)!**