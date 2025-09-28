import Foundation
import Combine
import Network

/// Main UrnlabsSDK class for iOS
@MainActor
public final class UrnlabsSDK: ObservableObject {
    
    // MARK: - Singleton
    
    public static let shared = UrnlabsSDK()
    
    // MARK: - Properties
    
    private var config: SDKConfig?
    private var isInitialized = false
    
    // Services
    private var httpClient: HTTPClient?
    private var storage: StorageAdapter?
    
    public private(set) var authService: AuthService?
    public private(set) var workflowService: WorkflowService?
    public private(set) var agentService: AgentService?
    public private(set) var fileService: FileService?
    public private(set) var websocketService: WebSocketService?
    
    // Network monitoring
    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "NetworkMonitor")
    
    // Publishers
    @Published public private(set) var isOnline = true
    @Published public private(set) var connectionStatus: ConnectionStatus = .disconnected
    
    private let eventSubject = PassthroughSubject<SDKEvent, Never>()
    public var events: AnyPublisher<SDKEvent, Never> {
        eventSubject.eraseToAnyPublisher()
    }
    
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        setupNetworkMonitoring()
    }
    
    /// Initialize the SDK with configuration
    public func initialize(config: SDKConfig) async throws {
        guard !isInitialized else {
            throw SDKError.alreadyInitialized
        }
        
        self.config = config
        
        do {
            // Initialize storage
            let storageAdapter = try CoreDataStorageAdapter()
            self.storage = storageAdapter

            // Initialize HTTP client
            let client = HTTPClient(config: config, storageAdapter: storageAdapter)
            self.httpClient = client

            // Initialize services
            self.authService = AuthService(httpClient: client, storageAdapter: storageAdapter)
            self.workflowService = WorkflowService(httpClient: client, storageAdapter: storageAdapter)
            self.agentService = AgentService(httpClient: client, storageAdapter: storageAdapter)
            self.fileService = FileService(httpClient: client, storageAdapter: storageAdapter)
            
            // Initialize WebSocket if configured
            if let websocketURL = config.websocketURL {
                self.websocketService = WebSocketService(url: websocketURL, config: config)
            }
            
            // Load stored authentication state
            if let authService = authService, await authService.isTokenValid() {
                // Authentication state will be loaded by the service
            }
            
            isInitialized = true
            connectionStatus = .connected
            
            emitEvent(.sdkInitialized(version: "1.0.0"))
            
            if config.enableLogging {
                print("[UrnlabsSDK] SDK initialized successfully")
            }
            
        } catch {
            connectionStatus = .failed(error)
            emitEvent(.sdkError(error: error))
            throw SDKError.initializationFailed(error)
        }
    }
    
    /// Shutdown the SDK
    public func shutdown() async {
        guard isInitialized else { return }
        
        // Stop network monitoring
        networkMonitor.cancel()
        
        // Shutdown services
        await websocketService?.disconnect()
        
        // Clear storage if needed
        // Note: Core Data will handle cleanup automatically
        
        // Clear references
        authService = nil
        workflowService = nil
        agentService = nil
        fileService = nil
        websocketService = nil
        httpClient = nil
        storage = nil
        
        isInitialized = false
        connectionStatus = .disconnected
        
        cancellables.removeAll()
        
        emitEvent(.sdkShutdown)
        
        if config?.enableLogging == true {
            print("[UrnlabsSDK] SDK shutdown complete")
        }
    }
    
    // MARK: - Network Monitoring
    
    private func setupNetworkMonitoring() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.updateNetworkStatus(path: path)
            }
        }
        networkMonitor.start(queue: networkQueue)
    }
    
    private func updateNetworkStatus(path: NWPath) {
        let wasOnline = isOnline
        isOnline = path.status == .satisfied
        
        if wasOnline != isOnline {
            emitEvent(isOnline ? .networkOnline : .networkOffline)
            
            if config?.enableLogging == true {
                print("[UrnlabsSDK] Network status: \(isOnline ? "online" : "offline")")
            }
            
            // Reconnect WebSocket if back online
            if isOnline {
                Task {
                    await websocketService?.reconnect()
                }
            }
        }
    }
    
    // MARK: - Event Handling
    
    private func emitEvent(_ event: SDKEvent) {
        eventSubject.send(event)
    }
    
    // MARK: - Public API
    
    /// Check if SDK is initialized
    public var initialized: Bool {
        isInitialized
    }
    
    /// Get current configuration
    public var currentConfig: SDKConfig? {
        config
    }
    
    /// Force offline mode
    public func setOfflineMode(_ enabled: Bool) {
        if enabled != isOnline {
            isOnline = !enabled
            emitEvent(enabled ? .offlineModeEnabled : .offlineModeDisabled)
        }
    }
    
    /// Get connection statistics
    public func getConnectionStats() -> ConnectionStats {
        ConnectionStats(
            isOnline: isOnline,
            connectionStatus: connectionStatus,
            isInitialized: isInitialized,
            hasActiveWebSocket: websocketService?.isConnected ?? false
        )
    }
}

// MARK: - Supporting Types

public enum ConnectionStatus: Equatable {
    case disconnected
    case connecting
    case connected
    case failed(Error)
    
    public static func == (lhs: ConnectionStatus, rhs: ConnectionStatus) -> Bool {
        switch (lhs, rhs) {
        case (.disconnected, .disconnected),
             (.connecting, .connecting),
             (.connected, .connected):
            return true
        case (.failed, .failed):
            return true
        default:
            return false
        }
    }
}

public struct ConnectionStats {
    public let isOnline: Bool
    public let connectionStatus: ConnectionStatus
    public let isInitialized: Bool
    public let hasActiveWebSocket: Bool
}

// MARK: - SDK Events

public enum SDKEvent {
    case sdkInitialized(version: String)
    case sdkShutdown
    case sdkError(error: Error)
    case networkOnline
    case networkOffline
    case offlineModeEnabled
    case offlineModeDisabled
    case authStateChanged(state: AuthState)
    case workflowUpdate(runId: String, status: String)
    case agentMessage(conversationId: String, message: AgentMessage)
    case fileUploaded(fileId: String)
    case custom(type: String, data: [String: Any])
}