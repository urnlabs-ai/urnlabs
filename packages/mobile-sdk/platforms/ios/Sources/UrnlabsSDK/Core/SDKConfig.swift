import Foundation

/// Configuration for the Urnlabs SDK
public struct SDKConfig {
    
    // MARK: - Properties
    
    /// Base URL for API requests
    public let baseURL: URL
    
    /// WebSocket URL for real-time features
    public let websocketURL: URL?
    
    /// API key for authentication
    public let apiKey: String?
    
    /// Request timeout duration
    public let timeout: TimeInterval
    
    /// Number of retry attempts for failed requests
    public let retryAttempts: Int
    
    /// Delay between retry attempts
    public let retryDelay: TimeInterval
    
    /// Enable SDK logging
    public let enableLogging: Bool
    
    /// Logging level
    public let logLevel: LogLevel
    
    /// Enable offline support
    public let enableOffline: Bool
    
    /// Certificate pinning configuration
    public let certificatePinning: CertificatePinningConfig?
    
    /// Background sync configuration
    public let backgroundSync: BackgroundSyncConfig
    
    /// Cache configuration
    public let cacheConfig: CacheConfig
    
    // MARK: - Initialization
    
    public init(
        baseURL: URL,
        websocketURL: URL? = nil,
        apiKey: String? = nil,
        timeout: TimeInterval = 30.0,
        retryAttempts: Int = 3,
        retryDelay: TimeInterval = 1.0,
        enableLogging: Bool = true,
        logLevel: LogLevel = .info,
        enableOffline: Bool = true,
        certificatePinning: CertificatePinningConfig? = nil,
        backgroundSync: BackgroundSyncConfig = BackgroundSyncConfig(),
        cacheConfig: CacheConfig = CacheConfig()
    ) {
        self.baseURL = baseURL
        self.websocketURL = websocketURL
        self.apiKey = apiKey
        self.timeout = timeout
        self.retryAttempts = retryAttempts
        self.retryDelay = retryDelay
        self.enableLogging = enableLogging
        self.logLevel = logLevel
        self.enableOffline = enableOffline
        self.certificatePinning = certificatePinning
        self.backgroundSync = backgroundSync
        self.cacheConfig = cacheConfig
    }
    
    // MARK: - Predefined Configurations
    
    /// Development environment configuration
    public static func development(apiKey: String? = nil) -> SDKConfig {
        return SDKConfig(
            baseURL: URL(string: "http://localhost:7001")!,
            websocketURL: URL(string: "ws://localhost:7001/ws"),
            apiKey: apiKey,
            enableLogging: true,
            logLevel: .debug,
            retryAttempts: 1,
            certificatePinning: nil
        )
    }
    
    /// Staging environment configuration
    public static func staging(apiKey: String? = nil) -> SDKConfig {
        return SDKConfig(
            baseURL: URL(string: "https://staging-api.urnlabs.com")!,
            websocketURL: URL(string: "wss://staging-ws.urnlabs.com"),
            apiKey: apiKey,
            enableLogging: true,
            logLevel: .info,
            retryAttempts: 2,
            certificatePinning: CertificatePinningConfig(
                certificates: ["staging-cert-fingerprint"]
            )
        )
    }
    
    /// Production environment configuration
    public static func production(apiKey: String) -> SDKConfig {
        return SDKConfig(
            baseURL: URL(string: "https://api.urnlabs.com")!,
            websocketURL: URL(string: "wss://ws.urnlabs.com"),
            apiKey: apiKey,
            enableLogging: false,
            logLevel: .error,
            retryAttempts: 3,
            certificatePinning: CertificatePinningConfig(
                certificates: ["production-cert-fingerprint"]
            )
        )
    }
}

// MARK: - Supporting Types

/// Logging levels
public enum LogLevel: String, CaseIterable {
    case debug = "DEBUG"
    case info = "INFO"
    case warning = "WARNING"
    case error = "ERROR"
    
    public var priority: Int {
        switch self {
        case .debug: return 0
        case .info: return 1
        case .warning: return 2
        case .error: return 3
        }
    }
}

/// Certificate pinning configuration
public struct CertificatePinningConfig {
    /// Certificate fingerprints to pin
    public let certificates: [String]
    
    /// Whether to allow invalid certificates in debug builds
    public let allowInvalidCertificatesInDebug: Bool
    
    public init(
        certificates: [String],
        allowInvalidCertificatesInDebug: Bool = true
    ) {
        self.certificates = certificates
        self.allowInvalidCertificatesInDebug = allowInvalidCertificatesInDebug
    }
}

/// Background sync configuration
public struct BackgroundSyncConfig {
    /// Enable background sync
    public let enabled: Bool
    
    /// Sync interval in seconds
    public let syncInterval: TimeInterval
    
    /// Maximum number of pending operations
    public let maxPendingOperations: Int
    
    /// Battery level threshold for background sync
    public let batteryThreshold: Float
    
    public init(
        enabled: Bool = true,
        syncInterval: TimeInterval = 300, // 5 minutes
        maxPendingOperations: Int = 100,
        batteryThreshold: Float = 0.2 // 20%
    ) {
        self.enabled = enabled
        self.syncInterval = syncInterval
        self.maxPendingOperations = maxPendingOperations
        self.batteryThreshold = batteryThreshold
    }
}

/// Cache configuration
public struct CacheConfig {
    /// Maximum cache size in bytes
    public let maxCacheSize: Int
    
    /// Default cache expiry time
    public let defaultExpiry: TimeInterval
    
    /// Cache cleanup interval
    public let cleanupInterval: TimeInterval
    
    /// Cache policies for different types
    public let policies: [String: CachePolicy]
    
    public init(
        maxCacheSize: Int = 100 * 1024 * 1024, // 100MB
        defaultExpiry: TimeInterval = 3600, // 1 hour
        cleanupInterval: TimeInterval = 86400, // 24 hours
        policies: [String: CachePolicy] = [:]
    ) {
        self.maxCacheSize = maxCacheSize
        self.defaultExpiry = defaultExpiry
        self.cleanupInterval = cleanupInterval
        self.policies = policies
    }
}

/// Cache policy for specific data types
public struct CachePolicy {
    /// Maximum age before cache is considered stale
    public let maxAge: TimeInterval
    
    /// Whether to serve stale data while revalidating
    public let staleWhileRevalidate: Bool
    
    /// Maximum size for this cache type
    public let maxSize: Int?
    
    public init(
        maxAge: TimeInterval,
        staleWhileRevalidate: Bool = true,
        maxSize: Int? = nil
    ) {
        self.maxAge = maxAge
        self.staleWhileRevalidate = staleWhileRevalidate
        self.maxSize = maxSize
    }
}