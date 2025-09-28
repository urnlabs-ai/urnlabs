# UrnLabs Mobile SDK API Reference

Complete API reference for all UrnLabs Mobile SDKs across platforms.

## Table of Contents

- [Core SDK Classes](#core-sdk-classes)
- [Configuration](#configuration)
- [Workflow Management](#workflow-management)
- [Agent Communication](#agent-communication)
- [Authentication](#authentication)
- [Monitoring & Analytics](#monitoring--analytics)
- [Error Handling](#error-handling)
- [Platform-Specific APIs](#platform-specific-apis)

## Core SDK Classes

### UrnLabsSDK

The main SDK class providing access to all UrnLabs AI Agent Platform features.

#### Initialization

**Android (Kotlin)**
```kotlin
class UrnLabsSDK private constructor(context: Context, config: SDKConfig) {
    companion object {
        fun initialize(context: Context, config: SDKConfig): UrnLabsSDK
        fun getInstance(): UrnLabsSDK
        fun isInitialized(): Boolean
    }
}
```

**iOS (Swift)**
```swift
class UrnLabsSDK {
    static func initialize(config: SDKConfig) -> UrnLabsSDK
    static var shared: UrnLabsSDK { get }
    static var isInitialized: Bool { get }
}
```

**Unity (C#)**
```csharp
public class UrnLabsSDK : MonoBehaviour {
    public static UrnLabsSDK Initialize(SDKConfig config)
    public static UrnLabsSDK Instance { get; }
    public static bool IsInitialized { get; }
}
```

#### Core Methods

##### `executeWorkflow()`
Execute a workflow with parameters and priority.

**Signature**
```typescript
executeWorkflow(
    workflowId: string,
    parameters: Record<string, any>,
    priority?: WorkflowPriority
): Promise<WorkflowExecution>
```

**Parameters**
- `workflowId`: Unique identifier for the workflow
- `parameters`: Key-value pairs for workflow input
- `priority`: Execution priority (`low`, `medium`, `high`, `critical`)

**Returns**
- `Promise<WorkflowExecution>`: Workflow execution result

**Example**
```typescript
const result = await sdk.executeWorkflow('user_onboarding', {
    userId: '12345',
    userEmail: 'user@example.com',
    features: ['analytics', 'notifications']
}, 'high');

console.log(`Workflow ${result.id} completed with status: ${result.status}`);
```

##### `getWorkflowStatus()`
Get the current status of a workflow execution.

**Signature**
```typescript
getWorkflowStatus(executionId: string): Promise<WorkflowExecution>
```

**Parameters**
- `executionId`: Unique identifier for the workflow execution

**Returns**
- `Promise<WorkflowExecution>`: Current execution state

##### `cancelWorkflow()`
Cancel a running workflow execution.

**Signature**
```typescript
cancelWorkflow(executionId: string): Promise<void>
```

##### `getAvailableWorkflows()`
Retrieve list of available workflows for the organization.

**Signature**
```typescript
getAvailableWorkflows(): Promise<Workflow[]>
```

**Returns**
- `Promise<Workflow[]>`: Array of available workflows

##### `getWorkflowHistory()`
Get workflow execution history with pagination.

**Signature**
```typescript
getWorkflowHistory(limit?: number, offset?: number): Promise<WorkflowExecution[]>
```

**Parameters**
- `limit`: Maximum number of records (default: 50)
- `offset`: Number of records to skip (default: 0)

## Configuration

### SDKConfig

Primary configuration interface for SDK initialization.

```typescript
interface SDKConfig {
    apiKey: string;                    // Required: API key for authentication
    organizationId: string;            // Required: Organization identifier
    baseUrl?: string;                  // Optional: API base URL (default: https://api.urnlabs.ai)
    environment?: Environment;         // Optional: Environment setting
    enableAnalytics?: boolean;         // Optional: Enable analytics (default: true)
    enableCaching?: boolean;           // Optional: Enable response caching (default: true)
    cacheExpirationHours?: number;     // Optional: Cache TTL in hours (default: 24)
    requestTimeoutSeconds?: number;    // Optional: Network timeout (default: 30)
    maxRetryAttempts?: number;         // Optional: Retry attempts (default: 3)
    enableOfflineMode?: boolean;       // Optional: Offline support (default: true)
    enableBackgroundSync?: boolean;    // Optional: Background sync (default: true)
    logLevel?: LogLevel;               // Optional: Logging level (default: INFO)
}
```

### Environment

```typescript
enum Environment {
    DEVELOPMENT = 'development',
    STAGING = 'staging',
    PRODUCTION = 'production'
}
```

### LogLevel

```typescript
enum LogLevel {
    VERBOSE = 'verbose',
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}
```

## Workflow Management

### WorkflowExecution

Represents a workflow execution instance.

```typescript
interface WorkflowExecution {
    id: string;                        // Unique execution identifier
    workflowId: string;               // Workflow template identifier
    status: WorkflowStatus;           // Current execution status
    parameters: Record<string, any>;  // Input parameters
    result?: any;                     // Execution result (if completed)
    error?: string;                   // Error message (if failed)
    createdAt: Date;                  // Creation timestamp
    startedAt?: Date;                 // Execution start time
    completedAt?: Date;               // Completion timestamp
    duration?: number;                // Execution duration in milliseconds
    progress: number;                 // Execution progress (0-100)
    steps: WorkflowStep[];            // Individual workflow steps
}
```

### WorkflowStatus

```typescript
enum WorkflowStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled',
    PAUSED = 'paused'
}
```

### WorkflowPriority

```typescript
enum WorkflowPriority {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical'
}
```

### Workflow

Represents a workflow template.

```typescript
interface Workflow {
    id: string;                       // Unique workflow identifier
    name: string;                     // Human-readable name
    description: string;              // Workflow description
    version: string;                  // Version number
    parameters: WorkflowParameter[];  // Required parameters
    tags: string[];                   // Workflow tags
    estimatedDuration: number;        // Estimated duration in seconds
    isActive: boolean;                // Whether workflow is active
}
```

### WorkflowParameter

```typescript
interface WorkflowParameter {
    name: string;                     // Parameter name
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;                // Whether parameter is required
    description: string;              // Parameter description
    defaultValue?: any;               // Default value
    validation?: {                    // Validation rules
        min?: number;
        max?: number;
        pattern?: string;
        enum?: any[];
    };
}
```

## Agent Communication

### Agent Management

##### `createAgent()`
Create a custom agent with specified configuration.

**Signature**
```typescript
createAgent(agentConfig: AgentConfig): Promise<Agent>
```

**Parameters**
- `agentConfig`: Configuration for the new agent

##### `getAvailableAgents()`
Get list of available agents.

**Signature**
```typescript
getAvailableAgents(): Promise<Agent[]>
```

##### `sendMessageToAgent()`
Send a message to an agent and receive response.

**Signature**
```typescript
sendMessageToAgent(
    agentId: string,
    message: string,
    context?: Record<string, any>
): Promise<AgentResponse>
```

**Parameters**
- `agentId`: Target agent identifier
- `message`: Message content
- `context`: Optional context data

**Example**
```typescript
const response = await sdk.sendMessageToAgent('support-agent',
    'Help me troubleshoot login issues',
    { userId: '12345', platform: 'mobile' }
);

console.log(response.message); // Agent's response
```

##### `getAgentConversation()`
Retrieve conversation history with an agent.

**Signature**
```typescript
getAgentConversation(agentId: string, limit?: number): Promise<AgentMessage[]>
```

### Agent Types

#### Agent

```typescript
interface Agent {
    id: string;                       // Unique agent identifier
    name: string;                     // Agent name
    description: string;              // Agent description
    type: AgentType;                  // Agent type
    capabilities: string[];           // Agent capabilities
    isActive: boolean;                // Whether agent is active
    configuration: Record<string, any>; // Agent-specific configuration
}
```

#### AgentConfig

```typescript
interface AgentConfig {
    name: string;                     // Agent name
    type: AgentType;                  // Agent type
    description?: string;             // Optional description
    capabilities: string[];           // Required capabilities
    configuration: Record<string, any>; // Agent configuration
    instructions?: string;            // Custom instructions
}
```

#### AgentResponse

```typescript
interface AgentResponse {
    id: string;                       // Response identifier
    agentId: string;                  // Source agent identifier
    message: string;                  // Response message
    type: 'text' | 'action' | 'data'; // Response type
    data?: any;                       // Additional response data
    actions?: AgentAction[];          // Suggested actions
    timestamp: Date;                  // Response timestamp
    confidence: number;               // Response confidence (0-1)
}
```

#### AgentMessage

```typescript
interface AgentMessage {
    id: string;                       // Message identifier
    agentId: string;                  // Agent identifier
    role: 'user' | 'agent';          // Message sender
    message: string;                  // Message content
    type: 'text' | 'action' | 'system'; // Message type
    timestamp: Date;                  // Message timestamp
    metadata?: Record<string, any>;   // Additional metadata
}
```

#### AgentType

```typescript
enum AgentType {
    CONVERSATIONAL = 'conversational',
    WORKFLOW = 'workflow',
    ANALYTICS = 'analytics',
    INTEGRATION = 'integration',
    CUSTOM = 'custom'
}
```

## Authentication

### User Authentication

##### `setAuthToken()`
Set authentication token for API requests.

**Signature**
```typescript
setAuthToken(token: string): void
```

##### `clearAuth()`
Clear authentication and logout user.

**Signature**
```typescript
clearAuth(): void
```

##### `updateUserProfile()`
Update user profile information.

**Signature**
```typescript
updateUserProfile(profile: UserProfile): Promise<void>
```

##### `getUserProfile()`
Get current user profile.

**Signature**
```typescript
getUserProfile(): Promise<UserProfile>
```

### User Types

#### UserProfile

```typescript
interface UserProfile {
    id: string;                       // User identifier
    email: string;                    // User email
    name: string;                     // User full name
    organizationId: string;           // Organization identifier
    role: string;                     // User role
    permissions: string[];            // User permissions
    preferences: Record<string, any>; // User preferences
    lastLoginAt?: Date;               // Last login timestamp
    createdAt: Date;                  // Account creation timestamp
}
```

## Monitoring & Analytics

### SDK Metrics

##### `getMetrics()`
Get SDK performance and usage metrics.

**Signature**
```typescript
getMetrics(): SDKMetrics
```

#### SDKMetrics

```typescript
interface SDKMetrics {
    workflowExecutions: number;       // Total workflow executions
    agentInteractions: number;        // Total agent interactions
    networkRequests: number;          // Total network requests
    connectionUptime: number;         // Connection uptime in seconds
    lastSyncTime: number;             // Last sync timestamp
    cacheHitRate: number;            // Cache hit rate percentage
    averageResponseTime: number;      // Average API response time
    errorRate: number;               // Error rate percentage
}
```

### Debug and Logging

##### `setDebugMode()`
Enable or disable debug logging.

**Signature**
```typescript
setDebugMode(enabled: boolean): void
```

##### `setLogLevel()`
Set logging level for SDK operations.

**Signature**
```typescript
setLogLevel(level: LogLevel): void
```

## Error Handling

### Error Types

#### SDKException

Base exception class for SDK errors.

```typescript
class SDKException extends Error {
    code: string;                     // Error code
    details?: Record<string, any>;    // Additional error details
    cause?: Error;                    // Original error cause

    constructor(message: string, code: string, details?: Record<string, any>)
}
```

#### Common Error Codes

```typescript
enum ErrorCode {
    // Authentication errors
    AUTHENTICATION_FAILED = 'AUTH_001',
    TOKEN_EXPIRED = 'AUTH_002',
    UNAUTHORIZED = 'AUTH_003',

    // Network errors
    NETWORK_ERROR = 'NET_001',
    TIMEOUT = 'NET_002',
    CONNECTION_FAILED = 'NET_003',

    // Workflow errors
    WORKFLOW_NOT_FOUND = 'WF_001',
    WORKFLOW_EXECUTION_FAILED = 'WF_002',
    INVALID_PARAMETERS = 'WF_003',

    // Agent errors
    AGENT_NOT_FOUND = 'AG_001',
    AGENT_UNAVAILABLE = 'AG_002',
    MESSAGE_FAILED = 'AG_003',

    // Configuration errors
    INVALID_CONFIG = 'CFG_001',
    MISSING_API_KEY = 'CFG_002',
    INVALID_ORGANIZATION = 'CFG_003'
}
```

### Error Handling Best Practices

```typescript
try {
    const result = await sdk.executeWorkflow('my_workflow', parameters);
    // Handle success
} catch (error) {
    if (error instanceof SDKException) {
        switch (error.code) {
            case ErrorCode.AUTHENTICATION_FAILED:
                // Redirect to login
                break;
            case ErrorCode.NETWORK_ERROR:
                // Show offline message
                break;
            case ErrorCode.WORKFLOW_NOT_FOUND:
                // Show workflow error
                break;
            default:
                // Generic error handling
                break;
        }
    } else {
        // Handle unexpected errors
        console.error('Unexpected error:', error);
    }
}
```

## Event Listeners

### Connection Events

```typescript
sdk.on('connectionStateChanged', (state: ConnectionState) => {
    console.log('Connection state:', state);
});

sdk.on('connectionError', (error: Error) => {
    console.error('Connection error:', error);
});
```

### Workflow Events

```typescript
sdk.on('workflowStarted', (execution: WorkflowExecution) => {
    console.log('Workflow started:', execution.id);
});

sdk.on('workflowProgress', (execution: WorkflowExecution, progress: number) => {
    console.log(`Workflow ${execution.id} progress: ${progress}%`);
});

sdk.on('workflowCompleted', (execution: WorkflowExecution) => {
    console.log('Workflow completed:', execution.id);
});

sdk.on('workflowFailed', (execution: WorkflowExecution, error: Error) => {
    console.error('Workflow failed:', execution.id, error);
});
```

### Agent Events

```typescript
sdk.on('agentMessageReceived', (agentId: string, message: AgentMessage) => {
    console.log('Message from agent:', agentId, message.message);
});

sdk.on('agentTypingStarted', (agentId: string) => {
    console.log('Agent typing:', agentId);
});

sdk.on('agentTypingStopped', (agentId: string) => {
    console.log('Agent stopped typing:', agentId);
});
```

## Platform-Specific APIs

### Android-Specific Features

#### Lifecycle Integration

```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var sdk: UrnLabsSDK

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        sdk = UrnLabsSDK.getInstance()

        // Observe SDK state
        sdk.isInitialized.observe(this) { initialized ->
            if (initialized) {
                // SDK ready
            }
        }

        sdk.connectionState.observe(this) { state ->
            // Handle connection state changes
        }
    }
}
```

#### Background Processing

```kotlin
// Background workflow execution
sdk.executeWorkflowInBackground("background_task", parameters) { result ->
    // Handle completion on main thread
    runOnUiThread {
        // Update UI
    }
}
```

### iOS-Specific Features

#### Combine Integration

```swift
import Combine

class ViewController: UIViewController {
    private var cancellables = Set<AnyCancellable>()
    private let sdk = UrnLabsSDK.shared

    override func viewDidLoad() {
        super.viewDidLoad()

        // Observe connection state
        sdk.connectionStatePublisher
            .receive(on: DispatchQueue.main)
            .sink { state in
                // Update UI based on connection state
            }
            .store(in: &cancellables)
    }
}
```

#### CloudKit Integration

```swift
// Sync with CloudKit
await sdk.syncWithCloudKit(container: "your_container_id")
```

### Unity-Specific Features

#### MonoBehaviour Integration

```csharp
public class GameManager : MonoBehaviour {
    private UrnLabsSDK sdk;

    async void Start() {
        sdk = UrnLabsSDK.Instance;

        // Wait for SDK initialization
        await sdk.WaitForInitialization();

        // Execute game workflow
        var result = await sdk.ExecuteWorkflow("game_start", new Dictionary<string, object>
        {
            ["playerId"] = "12345",
            ["level"] = 1
        });
    }

    void OnApplicationPause(bool pauseStatus) {
        if (pauseStatus) {
            sdk.PauseBackgroundSync();
        } else {
            sdk.ResumeBackgroundSync();
        }
    }
}
```

#### Coroutine Support

```csharp
// Using Unity Coroutines
StartCoroutine(ExecuteWorkflowCoroutine());

IEnumerator ExecuteWorkflowCoroutine() {
    var task = sdk.ExecuteWorkflow("my_workflow", parameters);
    yield return new WaitUntil(() => task.IsCompleted);

    if (task.IsCompletedSuccessfully) {
        var result = task.Result;
        // Handle success
    } else {
        // Handle error
    }
}
```

## Migration Guide

### From SDK v0.x to v1.0

#### Breaking Changes

1. **Initialization Method Change**
   ```typescript
   // Old (v0.x)
   UrnLabsSDK.init(apiKey, orgId);

   // New (v1.0)
   UrnLabsSDK.initialize({
       apiKey: 'your_api_key',
       organizationId: 'your_org_id'
   });
   ```

2. **Async/Await Pattern**
   ```typescript
   // Old (v0.x)
   sdk.executeWorkflow(workflowId, params, (result) => {
       // Handle result
   });

   // New (v1.0)
   const result = await sdk.executeWorkflow(workflowId, params);
   ```

3. **Error Handling**
   ```typescript
   // Old (v0.x)
   sdk.onError((error) => {
       // Handle error
   });

   // New (v1.0)
   try {
       await sdk.executeWorkflow(workflowId, params);
   } catch (error) {
       // Handle error
   }
   ```

#### Migration Steps

1. Update SDK dependency to v1.0.0
2. Replace initialization calls
3. Convert callback-based code to async/await
4. Update error handling patterns
5. Test thoroughly in staging environment

## Support and Resources

### Documentation Links
- [Getting Started Guide](./getting-started.md)
- [Authentication Setup](./authentication.md)
- [Error Handling Guide](./error-handling.md)
- [Performance Guide](./performance.md)

### Support Channels
- 📖 [Full Documentation](https://docs.urnlabs.ai/sdk)
- 💬 [Developer Community](https://discord.gg/urnlabs)
- 📧 [Technical Support](mailto:sdk-support@urnlabs.ai)
- 🐛 [Bug Reports](https://github.com/urnlabs/mobile-sdks/issues)

---

*This API reference covers all major SDK functionality across platforms. For platform-specific details, refer to individual platform documentation.*