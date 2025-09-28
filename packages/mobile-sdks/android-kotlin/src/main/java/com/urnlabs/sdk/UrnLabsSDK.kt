package com.urnlabs.sdk

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.room.Room
import androidx.work.WorkManager
import com.urnlabs.sdk.core.*
import com.urnlabs.sdk.database.UrnLabsDatabase
import com.urnlabs.sdk.network.ApiService
import com.urnlabs.sdk.network.NetworkManager
import com.urnlabs.sdk.storage.SecureStorage
import com.urnlabs.sdk.workflow.WorkflowManager
import com.urnlabs.sdk.agents.AgentManager
import kotlinx.coroutines.*
import kotlin.coroutines.CoroutineContext

/**
 * UrnLabs AI Agents SDK for Android
 *
 * Main entry point for the UrnLabs AI Agent Platform SDK.
 * Provides comprehensive workflow execution, agent management,
 * and real-time communication capabilities.
 */
class UrnLabsSDK private constructor(
    private val context: Context,
    private val config: SDKConfig
) : CoroutineScope {

    private val job = SupervisorJob()
    override val coroutineContext: CoroutineContext = Dispatchers.Main + job

    // Core components
    private lateinit var database: UrnLabsDatabase
    private lateinit var networkManager: NetworkManager
    private lateinit var secureStorage: SecureStorage
    private lateinit var workflowManager: WorkflowManager
    private lateinit var agentManager: AgentManager
    private lateinit var workManager: WorkManager

    // State management
    private val _isInitialized = MutableLiveData<Boolean>(false)
    val isInitialized: LiveData<Boolean> = _isInitialized

    private val _connectionState = MutableLiveData<ConnectionState>(ConnectionState.DISCONNECTED)
    val connectionState: LiveData<ConnectionState> = _connectionState

    companion object {
        @Volatile
        private var INSTANCE: UrnLabsSDK? = null

        /**
         * Initialize the SDK with configuration
         */
        fun initialize(context: Context, config: SDKConfig): UrnLabsSDK {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: UrnLabsSDK(context.applicationContext, config).also {
                    INSTANCE = it
                    it.initializeComponents()
                }
            }
        }

        /**
         * Get the current SDK instance
         */
        fun getInstance(): UrnLabsSDK {
            return INSTANCE ?: throw IllegalStateException("SDK not initialized. Call initialize() first.")
        }

        /**
         * Check if SDK is initialized
         */
        fun isInitialized(): Boolean = INSTANCE != null
    }

    /**
     * Initialize SDK components
     */
    private fun initializeComponents() {
        launch {
            try {
                // Initialize database
                database = Room.databaseBuilder(
                    context,
                    UrnLabsDatabase::class.java,
                    "urnlabs_sdk_db"
                ).build()

                // Initialize secure storage
                secureStorage = SecureStorage(context)

                // Initialize network manager
                networkManager = NetworkManager(config, secureStorage)

                // Initialize Work Manager
                workManager = WorkManager.getInstance(context)

                // Initialize workflow manager
                workflowManager = WorkflowManager(
                    networkManager,
                    database,
                    workManager,
                    this@UrnLabsSDK
                )

                // Initialize agent manager
                agentManager = AgentManager(
                    networkManager,
                    database,
                    this@UrnLabsSDK
                )

                // Connect to platform
                connect()

                _isInitialized.postValue(true)

                Logger.i("UrnLabsSDK", "SDK initialized successfully")

            } catch (e: Exception) {
                Logger.e("UrnLabsSDK", "Failed to initialize SDK", e)
                throw SDKException("SDK initialization failed", e)
            }
        }
    }

    /**
     * Connect to the UrnLabs platform
     */
    suspend fun connect(): Result<Unit> {
        return try {
            _connectionState.postValue(ConnectionState.CONNECTING)

            val result = networkManager.connect()
            if (result.isSuccess) {
                _connectionState.postValue(ConnectionState.CONNECTED)

                // Start background sync
                workflowManager.startBackgroundSync()
                agentManager.startHeartbeat()

                Logger.i("UrnLabsSDK", "Connected to UrnLabs platform")
            } else {
                _connectionState.postValue(ConnectionState.DISCONNECTED)
                Logger.e("UrnLabsSDK", "Failed to connect to platform")
            }

            result
        } catch (e: Exception) {
            _connectionState.postValue(ConnectionState.DISCONNECTED)
            Logger.e("UrnLabsSDK", "Connection error", e)
            Result.failure(SDKException("Connection failed", e))
        }
    }

    /**
     * Disconnect from the platform
     */
    suspend fun disconnect() {
        try {
            _connectionState.postValue(ConnectionState.DISCONNECTING)

            workflowManager.stopBackgroundSync()
            agentManager.stopHeartbeat()
            networkManager.disconnect()

            _connectionState.postValue(ConnectionState.DISCONNECTED)
            Logger.i("UrnLabsSDK", "Disconnected from platform")

        } catch (e: Exception) {
            Logger.e("UrnLabsSDK", "Error during disconnect", e)
        }
    }

    /**
     * Execute a workflow
     */
    suspend fun executeWorkflow(
        workflowId: String,
        parameters: Map<String, Any> = emptyMap(),
        priority: WorkflowPriority = WorkflowPriority.MEDIUM
    ): Result<WorkflowExecution> {
        return workflowManager.executeWorkflow(workflowId, parameters, priority)
    }

    /**
     * Get workflow execution status
     */
    suspend fun getWorkflowStatus(executionId: String): Result<WorkflowExecution> {
        return workflowManager.getWorkflowStatus(executionId)
    }

    /**
     * Cancel a workflow execution
     */
    suspend fun cancelWorkflow(executionId: String): Result<Unit> {
        return workflowManager.cancelWorkflow(executionId)
    }

    /**
     * List available workflows
     */
    suspend fun getAvailableWorkflows(): Result<List<Workflow>> {
        return workflowManager.getAvailableWorkflows()
    }

    /**
     * Get workflow execution history
     */
    suspend fun getWorkflowHistory(
        limit: Int = 50,
        offset: Int = 0
    ): Result<List<WorkflowExecution>> {
        return workflowManager.getWorkflowHistory(limit, offset)
    }

    /**
     * Create a custom agent
     */
    suspend fun createAgent(agentConfig: AgentConfig): Result<Agent> {
        return agentManager.createAgent(agentConfig)
    }

    /**
     * Get available agents
     */
    suspend fun getAvailableAgents(): Result<List<Agent>> {
        return agentManager.getAvailableAgents()
    }

    /**
     * Send message to an agent
     */
    suspend fun sendMessageToAgent(
        agentId: String,
        message: String,
        context: Map<String, Any> = emptyMap()
    ): Result<AgentResponse> {
        return agentManager.sendMessage(agentId, message, context)
    }

    /**
     * Get agent conversation history
     */
    suspend fun getAgentConversation(
        agentId: String,
        limit: Int = 50
    ): Result<List<AgentMessage>> {
        return agentManager.getConversationHistory(agentId, limit)
    }

    /**
     * Update user profile
     */
    suspend fun updateUserProfile(profile: UserProfile): Result<Unit> {
        return networkManager.updateUserProfile(profile)
    }

    /**
     * Get current user profile
     */
    suspend fun getUserProfile(): Result<UserProfile> {
        return networkManager.getUserProfile()
    }

    /**
     * Set authentication token
     */
    fun setAuthToken(token: String) {
        secureStorage.setAuthToken(token)
        networkManager.updateAuthToken(token)
    }

    /**
     * Clear authentication
     */
    fun clearAuth() {
        secureStorage.clearAuthToken()
        networkManager.clearAuth()
    }

    /**
     * Get SDK metrics
     */
    fun getMetrics(): SDKMetrics {
        return SDKMetrics(
            workflowExecutions = workflowManager.getExecutionCount(),
            agentInteractions = agentManager.getInteractionCount(),
            networkRequests = networkManager.getRequestCount(),
            connectionUptime = networkManager.getConnectionUptime(),
            lastSyncTime = workflowManager.getLastSyncTime()
        )
    }

    /**
     * Enable debug logging
     */
    fun setDebugMode(enabled: Boolean) {
        Logger.setDebugMode(enabled)
    }

    /**
     * Clean up resources
     */
    fun shutdown() {
        launch {
            try {
                disconnect()
                job.cancel()
                database.close()
                INSTANCE = null

                Logger.i("UrnLabsSDK", "SDK shutdown complete")
            } catch (e: Exception) {
                Logger.e("UrnLabsSDK", "Error during shutdown", e)
            }
        }
    }

    /**
     * Register workflow execution listener
     */
    fun setWorkflowExecutionListener(listener: WorkflowExecutionListener) {
        workflowManager.setExecutionListener(listener)
    }

    /**
     * Register agent message listener
     */
    fun setAgentMessageListener(listener: AgentMessageListener) {
        agentManager.setMessageListener(listener)
    }

    /**
     * Register connection state listener
     */
    fun setConnectionStateListener(listener: ConnectionStateListener) {
        networkManager.setConnectionStateListener(listener)
    }
}

/**
 * SDK Configuration
 */
data class SDKConfig(
    val apiKey: String,
    val organizationId: String,
    val baseUrl: String = "https://api.urnlabs.ai",
    val environment: Environment = Environment.PRODUCTION,
    val enableAnalytics: Boolean = true,
    val enableCaching: Boolean = true,
    val cacheExpirationHours: Int = 24,
    val requestTimeoutSeconds: Int = 30,
    val maxRetryAttempts: Int = 3,
    val enableOfflineMode: Boolean = true,
    val enableBackgroundSync: Boolean = true,
    val logLevel: LogLevel = LogLevel.INFO
)

/**
 * Environment enumeration
 */
enum class Environment {
    DEVELOPMENT,
    STAGING,
    PRODUCTION
}

/**
 * Log level enumeration
 */
enum class LogLevel {
    VERBOSE,
    DEBUG,
    INFO,
    WARN,
    ERROR
}

/**
 * Connection state enumeration
 */
enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    DISCONNECTING,
    ERROR
}

/**
 * Workflow priority enumeration
 */
enum class WorkflowPriority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

/**
 * SDK Metrics data class
 */
data class SDKMetrics(
    val workflowExecutions: Int,
    val agentInteractions: Int,
    val networkRequests: Int,
    val connectionUptime: Long,
    val lastSyncTime: Long
)

/**
 * SDK Exception class
 */
class SDKException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Workflow execution listener interface
 */
interface WorkflowExecutionListener {
    fun onWorkflowStarted(execution: WorkflowExecution)
    fun onWorkflowProgress(execution: WorkflowExecution, progress: Float)
    fun onWorkflowCompleted(execution: WorkflowExecution)
    fun onWorkflowFailed(execution: WorkflowExecution, error: Throwable)
}

/**
 * Agent message listener interface
 */
interface AgentMessageListener {
    fun onMessageReceived(agentId: String, message: AgentMessage)
    fun onTypingStarted(agentId: String)
    fun onTypingStopped(agentId: String)
}

/**
 * Connection state listener interface
 */
interface ConnectionStateListener {
    fun onStateChanged(oldState: ConnectionState, newState: ConnectionState)
    fun onConnectionError(error: Throwable)
}