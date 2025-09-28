# Android Task Manager Sample App

A complete task management application demonstrating UrnLabs AI Agents SDK integration with Android best practices.

## Features Demonstrated

### 🔐 Authentication & Security
- Biometric authentication (Fingerprint/Face unlock)
- Secure token storage using EncryptedSharedPreferences
- JWT token refresh handling
- OAuth 2.0 integration

### 📱 Core Android Integration
- MVVM architecture with LiveData and ViewModels
- Room database for local storage
- WorkManager for background tasks
- Navigation Component for app navigation
- Material Design 3 UI components

### 🤖 AI Agent Features
- Workflow execution for task automation
- Agent-powered task suggestions
- Smart categorization using AI
- Automated priority assignment
- Real-time agent chat support

### 🌐 Connectivity & Sync
- Offline-first architecture
- Background synchronization
- Conflict resolution
- Network state handling
- Push notifications for updates

## Technical Architecture

### Project Structure
```
app/
├── src/main/java/com/urnlabs/taskmanager/
│   ├── data/
│   │   ├── database/
│   │   │   ├── TaskDao.kt
│   │   │   ├── TaskDatabase.kt
│   │   │   └── entities/
│   │   ├── repository/
│   │   │   ├── TaskRepository.kt
│   │   │   └── AuthRepository.kt
│   │   └── network/
│   ├── ui/
│   │   ├── auth/
│   │   ├── tasks/
│   │   ├── agent/
│   │   └── settings/
│   ├── viewmodel/
│   ├── utils/
│   └── TaskManagerApplication.kt
├── src/main/res/
├── build.gradle.kts
└── proguard-rules.pro
```

### Key Dependencies
```kotlin
dependencies {
    // UrnLabs SDK
    implementation("com.urnlabs:ai-agents-sdk:1.0.0")

    // Android Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")

    // UI
    implementation("androidx.compose.ui:ui:1.5.4")
    implementation("androidx.compose.material3:material3:1.1.2")
    implementation("androidx.navigation:navigation-compose:2.7.5")

    // Architecture
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.hilt:hilt-navigation-compose:1.1.0")
    implementation("com.google.dagger:hilt-android:2.48")

    // Storage
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")

    // Background Processing
    implementation("androidx.work:work-runtime-ktx:2.9.0")

    // Security
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.biometric:biometric:1.1.0")
}
```

## Application Code

### Application Class

```kotlin
// TaskManagerApplication.kt
@HiltAndroidApp
class TaskManagerApplication : Application() {
    lateinit var urnLabsSDK: UrnLabsSDK
        private set

    override fun onCreate() {
        super.onCreate()

        initializeUrnLabsSDK()
    }

    private fun initializeUrnLabsSDK() {
        val config = SDKConfig(
            apiKey = BuildConfig.URNLABS_API_KEY,
            organizationId = BuildConfig.URNLABS_ORG_ID,
            environment = if (BuildConfig.DEBUG) Environment.DEVELOPMENT else Environment.PRODUCTION,
            enableAnalytics = true,
            enableCaching = true,
            enableOfflineMode = true,
            logLevel = if (BuildConfig.DEBUG) LogLevel.DEBUG else LogLevel.INFO
        )

        urnLabsSDK = UrnLabsSDK.initialize(this, config)

        // Set up global event listeners
        setupSDKEventListeners()
    }

    private fun setupSDKEventListeners() {
        urnLabsSDK.setWorkflowExecutionListener(object : WorkflowExecutionListener {
            override fun onWorkflowStarted(execution: WorkflowExecution) {
                Log.d("TaskManager", "Workflow started: ${execution.id}")
            }

            override fun onWorkflowProgress(execution: WorkflowExecution, progress: Float) {
                // Update UI with progress
            }

            override fun onWorkflowCompleted(execution: WorkflowExecution) {
                Log.d("TaskManager", "Workflow completed: ${execution.id}")
            }

            override fun onWorkflowFailed(execution: WorkflowExecution, error: Throwable) {
                Log.e("TaskManager", "Workflow failed: ${execution.id}", error)
            }
        })
    }
}
```

### MainActivity with Authentication

```kotlin
// MainActivity.kt
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val authViewModel: AuthViewModel by viewModels()
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setupBiometricAuthentication()

        setContent {
            TaskManagerTheme {
                val isAuthenticated by authViewModel.isAuthenticated.observeAsState(false)

                if (isAuthenticated) {
                    TaskManagerApp()
                } else {
                    LoginScreen(
                        onLogin = { email, password ->
                            authViewModel.login(email, password)
                        },
                        onBiometricLogin = { showBiometricPrompt() }
                    )
                }
            }
        }
    }

    private fun setupBiometricAuthentication() {
        val executor = ContextCompat.getMainExecutor(this)
        biometricPrompt = BiometricPrompt(this as FragmentActivity, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)
                    Toast.makeText(applicationContext, "Authentication error: $errString", Toast.LENGTH_SHORT).show()
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)
                    authViewModel.authenticateWithBiometrics()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Toast.makeText(applicationContext, "Authentication failed", Toast.LENGTH_SHORT).show()
                }
            })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Biometric Authentication")
            .setSubtitle("Log in using your biometric credential")
            .setNegativeButtonText("Use account password")
            .build()
    }

    private fun showBiometricPrompt() {
        biometricPrompt.authenticate(promptInfo)
    }
}
```

### Task Repository with SDK Integration

```kotlin
// TaskRepository.kt
@Singleton
class TaskRepository @Inject constructor(
    private val taskDao: TaskDao,
    private val urnLabsSDK: UrnLabsSDK,
    private val networkConnectivityManager: NetworkConnectivityManager
) {

    fun getAllTasks(): Flow<List<Task>> = taskDao.getAllTasks()

    suspend fun createTask(task: Task): Result<Task> {
        return try {
            // Save locally first
            val localId = taskDao.insertTask(task)
            val savedTask = task.copy(id = localId)

            // Sync with UrnLabs if online
            if (networkConnectivityManager.isConnected()) {
                syncTaskWithAI(savedTask)
            } else {
                // Queue for later sync
                queueTaskForSync(savedTask)
            }

            Result.success(savedTask)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun syncTaskWithAI(task: Task) {
        try {
            // Use AI agent to enhance task
            val enhancedTask = urnLabsSDK.executeWorkflow(
                workflowId = "enhance_task",
                parameters = mapOf(
                    "title" to task.title,
                    "description" to task.description,
                    "category" to task.category
                ),
                priority = WorkflowPriority.MEDIUM
            )

            // Update task with AI suggestions
            val updatedTask = task.copy(
                aiSuggestions = enhancedTask.result?.get("suggestions") as? List<String>,
                estimatedDuration = enhancedTask.result?.get("estimatedDuration") as? Int,
                priority = Priority.fromString(enhancedTask.result?.get("priority") as? String)
            )

            taskDao.updateTask(updatedTask)
        } catch (e: Exception) {
            Log.e("TaskRepository", "Failed to enhance task with AI", e)
        }
    }

    suspend fun generateTaskSuggestions(context: String): List<String> {
        return try {
            val response = urnLabsSDK.sendMessageToAgent(
                agentId = "task-suggestion-agent",
                message = "Suggest tasks based on: $context",
                context = mapOf("userActivity" to context)
            )

            response.data?.get("suggestions") as? List<String> ?: emptyList()
        } catch (e: Exception) {
            Log.e("TaskRepository", "Failed to get task suggestions", e)
            emptyList()
        }
    }

    private fun queueTaskForSync(task: Task) {
        // Use WorkManager for background sync
        val syncRequest = OneTimeWorkRequestBuilder<TaskSyncWorker>()
            .setInputData(workDataOf("taskId" to task.id))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .build()

        WorkManager.getInstance().enqueue(syncRequest)
    }
}
```

### ViewModel with LiveData

```kotlin
// TaskViewModel.kt
@HiltViewModel
class TaskViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
    private val urnLabsSDK: UrnLabsSDK
) : ViewModel() {

    private val _tasks = MutableLiveData<List<Task>>()
    val tasks: LiveData<List<Task>> = _tasks

    private val _isLoading = MutableLiveData<Boolean>()
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    private val _aiSuggestions = MutableLiveData<List<String>>()
    val aiSuggestions: LiveData<List<String>> = _aiSuggestions

    init {
        loadTasks()
        generateAISuggestions()
    }

    private fun loadTasks() {
        viewModelScope.launch {
            taskRepository.getAllTasks()
                .catch { e -> _error.postValue(e.message) }
                .collect { taskList -> _tasks.postValue(taskList) }
        }
    }

    fun createTask(title: String, description: String, category: String) {
        viewModelScope.launch {
            _isLoading.postValue(true)

            val task = Task(
                title = title,
                description = description,
                category = category,
                createdAt = System.currentTimeMillis(),
                status = TaskStatus.PENDING
            )

            taskRepository.createTask(task)
                .onSuccess {
                    // Task created successfully
                    generateAISuggestions()
                }
                .onFailure { e ->
                    _error.postValue(e.message)
                }

            _isLoading.postValue(false)
        }
    }

    fun executeTaskWorkflow(taskId: Long, workflowType: String) {
        viewModelScope.launch {
            try {
                val result = urnLabsSDK.executeWorkflow(
                    workflowId = workflowType,
                    parameters = mapOf("taskId" to taskId),
                    priority = WorkflowPriority.HIGH
                )

                // Handle workflow result
                when (result.status) {
                    WorkflowStatus.COMPLETED -> {
                        // Update task status
                        updateTaskFromWorkflowResult(taskId, result)
                    }
                    WorkflowStatus.FAILED -> {
                        _error.postValue("Workflow failed: ${result.error}")
                    }
                    else -> {
                        // Handle other statuses
                    }
                }
            } catch (e: Exception) {
                _error.postValue("Failed to execute workflow: ${e.message}")
            }
        }
    }

    private fun generateAISuggestions() {
        viewModelScope.launch {
            try {
                val context = "User has ${_tasks.value?.size ?: 0} tasks in progress"
                val suggestions = taskRepository.generateTaskSuggestions(context)
                _aiSuggestions.postValue(suggestions)
            } catch (e: Exception) {
                Log.e("TaskViewModel", "Failed to generate AI suggestions", e)
            }
        }
    }

    private suspend fun updateTaskFromWorkflowResult(taskId: Long, result: WorkflowExecution) {
        // Implementation to update task based on workflow result
    }
}
```

### Compose UI Components

```kotlin
// TaskListScreen.kt
@Composable
fun TaskListScreen(
    taskViewModel: TaskViewModel = hiltViewModel(),
    onTaskClick: (Task) -> Unit
) {
    val tasks by taskViewModel.tasks.observeAsState(emptyList())
    val isLoading by taskViewModel.isLoading.observeAsState(false)
    val aiSuggestions by taskViewModel.aiSuggestions.observeAsState(emptyList())

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // AI Suggestions Card
        if (aiSuggestions.isNotEmpty()) {
            AISuggestionsCard(
                suggestions = aiSuggestions,
                onSuggestionClick = { suggestion ->
                    // Create task from AI suggestion
                    taskViewModel.createTask(
                        title = suggestion,
                        description = "AI suggested task",
                        category = "AI Generated"
                    )
                }
            )
            Spacer(modifier = Modifier.height(16.dp))
        }

        // Tasks List
        LazyColumn {
            items(tasks) { task ->
                TaskCard(
                    task = task,
                    onClick = { onTaskClick(task) },
                    onWorkflowExecute = { workflowType ->
                        taskViewModel.executeTaskWorkflow(task.id, workflowType)
                    }
                )
            }
        }

        // Loading indicator
        if (isLoading) {
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
    }
}

@Composable
fun AISuggestionsCard(
    suggestions: List<String>,
    onSuggestionClick: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Psychology,
                    contentDescription = "AI Suggestions"
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "AI Suggestions",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            suggestions.take(3).forEach { suggestion ->
                SuggestionChip(
                    suggestion = suggestion,
                    onClick = { onSuggestionClick(suggestion) }
                )
                Spacer(modifier = Modifier.height(4.dp))
            }
        }
    }
}

@Composable
fun TaskCard(
    task: Task,
    onClick: () -> Unit,
    onWorkflowExecute: (String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = task.title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = task.description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TaskStatusChip(status = task.status)

                // Workflow action buttons
                Row {
                    Button(
                        onClick = { onWorkflowExecute("auto_prioritize") },
                        modifier = Modifier.size(width = 100.dp, height = 32.dp)
                    ) {
                        Text("Prioritize", fontSize = 12.sp)
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    Button(
                        onClick = { onWorkflowExecute("suggest_subtasks") },
                        modifier = Modifier.size(width = 100.dp, height = 32.dp)
                    ) {
                        Text("Enhance", fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
```

### Background Sync Worker

```kotlin
// TaskSyncWorker.kt
class TaskSyncWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        val taskId = inputData.getLong("taskId", -1L)
        if (taskId == -1L) return Result.failure()

        return try {
            val app = applicationContext as TaskManagerApplication
            val sdk = app.urnLabsSDK

            // Perform sync operation
            syncTaskWithBackend(sdk, taskId)

            Result.success()
        } catch (e: Exception) {
            Log.e("TaskSyncWorker", "Sync failed", e)
            Result.retry()
        }
    }

    private suspend fun syncTaskWithBackend(sdk: UrnLabsSDK, taskId: Long) {
        // Implementation for syncing task with backend
        // This would involve calling UrnLabs workflows
        val syncResult = sdk.executeWorkflow(
            workflowId = "sync_task",
            parameters = mapOf("taskId" to taskId),
            priority = WorkflowPriority.LOW
        )

        if (syncResult.status == WorkflowStatus.FAILED) {
            throw Exception("Sync workflow failed: ${syncResult.error}")
        }
    }
}
```

## Building and Running

### Prerequisites
1. Android Studio Arctic Fox or later
2. Android SDK 21+ (API level 21)
3. UrnLabs API key and organization ID

### Setup Steps

1. **Clone and Setup**
   ```bash
   git clone https://github.com/urnlabs/mobile-sdks.git
   cd mobile-sdks/samples/android-task-manager
   ```

2. **Configure API Keys**
   Create `local.properties` in the project root:
   ```properties
   URNLABS_API_KEY=your_api_key_here
   URNLABS_ORG_ID=your_organization_id_here
   ```

3. **Build and Run**
   ```bash
   ./gradlew assembleDebug
   ./gradlew installDebug
   ```

### Testing

#### Unit Tests
```bash
./gradlew testDebugUnitTest
```

#### Instrumentation Tests
```bash
./gradlew connectedAndroidTest
```

#### Key Test Areas
- SDK initialization and configuration
- Workflow execution with various parameters
- Agent communication and message handling
- Offline data synchronization
- Authentication flows
- Background task processing

## Key Learning Points

This sample demonstrates:

1. **Proper SDK Integration**: How to initialize and configure the UrnLabs SDK in an Android application
2. **Architecture Best Practices**: MVVM pattern with Repository, ViewModels, and Compose UI
3. **Offline-First Design**: Local storage with background synchronization
4. **AI Integration**: Using workflows and agents to enhance user experience
5. **Platform Features**: Biometric authentication, background processing, push notifications
6. **Error Handling**: Comprehensive error handling and user feedback
7. **Testing Strategy**: Unit tests, integration tests, and UI tests

## Next Steps

To customize this sample for your needs:

1. Replace placeholder workflows with your actual business logic
2. Customize the UI to match your brand
3. Add additional agent interactions
4. Implement your specific authentication requirements
5. Add more sophisticated offline conflict resolution
6. Integrate with your existing backend systems

## Support

For questions about this sample:
- 📖 [SDK Documentation](../docs/getting-started.md)
- 💬 [Developer Discord](https://discord.gg/urnlabs)
- 📧 [Support Email](mailto:sdk-support@urnlabs.ai)