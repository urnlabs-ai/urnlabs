import Foundation

/// Comprehensive error handling for Urnlabs SDK
public enum SDKError: Error, LocalizedError, Equatable {
    
    // MARK: - Configuration Errors
    case invalidConfiguration(String)
    case missingAPIKey
    case invalidURL(String)
    case alreadyInitialized
    case notInitialized
    case initializationFailed(Error)
    
    // MARK: - Network Errors
    case networkUnavailable
    case requestTimeout
    case connectionFailed(String)
    case invalidResponse
    case serverError(Int, String?)
    case rateLimited(retryAfter: TimeInterval?)
    case sslError(String)
    
    // MARK: - Authentication Errors
    case unauthorized(String?)
    case forbidden(String?)
    case tokenExpired
    case invalidCredentials
    case mfaRequired(String?)
    case accountLocked
    case emailNotVerified
    
    // MARK: - Data Errors
    case invalidData(String)
    case encodingFailed(String)
    case decodingFailed(String)
    case validationFailed([String])
    case notFound(String)
    case conflict(String)
    
    // MARK: - Storage Errors
    case storageUnavailable
    case storageCorrupted
    case storageFull
    case keyNotFound(String)
    case encryptionFailed
    case decryptionFailed
    
    // MARK: - File Errors
    case fileNotFound(String)
    case fileTooBig(maxSize: Int)
    case unsupportedFileType(String)
    case uploadFailed(String)
    case downloadFailed(String)
    case insufficientStorage
    
    // MARK: - WebSocket Errors
    case websocketConnectionFailed(String)
    case websocketDisconnected
    case websocketMessageFailed(String)
    
    // MARK: - Operation Errors
    case operationCancelled
    case operationFailed(String)
    case concurrentModification
    case resourceBusy
    case quotaExceeded(String)
    
    // MARK: - Generic Errors
    case unknown(String, Error?)
    case notImplemented(String)
    case featureNotAvailable(String)
    
    // MARK: - Error Information
    
    public var errorDescription: String? {
        switch self {
        // Configuration Errors
        case .invalidConfiguration(let message):
            return "Invalid configuration: \(message)"
        case .missingAPIKey:
            return "API key is required for this operation"
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .alreadyInitialized:
            return "SDK is already initialized"
        case .notInitialized:
            return "SDK is not initialized. Call initialize() first"
        case .initializationFailed(let error):
            return "SDK initialization failed: \(error.localizedDescription)"
            
        // Network Errors
        case .networkUnavailable:
            return "Network is unavailable"
        case .requestTimeout:
            return "Request timed out"
        case .connectionFailed(let message):
            return "Connection failed: \(message)"
        case .invalidResponse:
            return "Invalid response from server"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown error")"
        case .rateLimited(let retryAfter):
            if let retryAfter = retryAfter {
                return "Rate limited. Retry after \(Int(retryAfter)) seconds"
            } else {
                return "Rate limited. Please try again later"
            }
        case .sslError(let message):
            return "SSL error: \(message)"
            
        // Authentication Errors
        case .unauthorized(let message):
            return "Unauthorized: \(message ?? "Invalid credentials")"
        case .forbidden(let message):
            return "Forbidden: \(message ?? "Access denied")"
        case .tokenExpired:
            return "Authentication token has expired"
        case .invalidCredentials:
            return "Invalid username or password"
        case .mfaRequired(let token):
            return "Multi-factor authentication required"
        case .accountLocked:
            return "Account has been locked"
        case .emailNotVerified:
            return "Email address has not been verified"
            
        // Data Errors
        case .invalidData(let message):
            return "Invalid data: \(message)"
        case .encodingFailed(let message):
            return "Data encoding failed: \(message)"
        case .decodingFailed(let message):
            return "Data decoding failed: \(message)"
        case .validationFailed(let errors):
            return "Validation failed: \(errors.joined(separator: ", "))"
        case .notFound(let resource):
            return "\(resource) not found"
        case .conflict(let message):
            return "Conflict: \(message)"
            
        // Storage Errors
        case .storageUnavailable:
            return "Storage is unavailable"
        case .storageCorrupted:
            return "Storage data is corrupted"
        case .storageFull:
            return "Storage is full"
        case .keyNotFound(let key):
            return "Key not found: \(key)"
        case .encryptionFailed:
            return "Data encryption failed"
        case .decryptionFailed:
            return "Data decryption failed"
            
        // File Errors
        case .fileNotFound(let filename):
            return "File not found: \(filename)"
        case .fileTooBig(let maxSize):
            return "File is too big. Maximum size: \(maxSize) bytes"
        case .unsupportedFileType(let type):
            return "Unsupported file type: \(type)"
        case .uploadFailed(let message):
            return "File upload failed: \(message)"
        case .downloadFailed(let message):
            return "File download failed: \(message)"
        case .insufficientStorage:
            return "Insufficient storage space"
            
        // WebSocket Errors
        case .websocketConnectionFailed(let message):
            return "WebSocket connection failed: \(message)"
        case .websocketDisconnected:
            return "WebSocket disconnected"
        case .websocketMessageFailed(let message):
            return "WebSocket message failed: \(message)"
            
        // Operation Errors
        case .operationCancelled:
            return "Operation was cancelled"
        case .operationFailed(let message):
            return "Operation failed: \(message)"
        case .concurrentModification:
            return "Resource was modified by another operation"
        case .resourceBusy:
            return "Resource is currently busy"
        case .quotaExceeded(let message):
            return "Quota exceeded: \(message)"
            
        // Generic Errors
        case .unknown(let message, let underlyingError):
            if let underlyingError = underlyingError {
                return "\(message): \(underlyingError.localizedDescription)"
            } else {
                return message
            }
        case .notImplemented(let feature):
            return "Feature not implemented: \(feature)"
        case .featureNotAvailable(let feature):
            return "Feature not available: \(feature)"
        }
    }
    
    public var failureReason: String? {
        switch self {
        case .networkUnavailable:
            return "No network connection available"
        case .requestTimeout:
            return "Request exceeded timeout limit"
        case .serverError(let code, _):
            return "Server returned error code \(code)"
        case .unauthorized:
            return "Authentication failed"
        case .forbidden:
            return "Insufficient permissions"
        case .tokenExpired:
            return "Authentication token has expired"
        case .storageUnavailable:
            return "Device storage is not accessible"
        case .storageFull:
            return "Device storage is full"
        default:
            return nil
        }
    }
    
    public var recoverySuggestion: String? {
        switch self {
        case .networkUnavailable:
            return "Check your internet connection and try again"
        case .requestTimeout:
            return "Check your connection and try again"
        case .unauthorized, .forbidden:
            return "Please log in again"
        case .tokenExpired:
            return "Please log in again to refresh your session"
        case .mfaRequired:
            return "Please complete multi-factor authentication"
        case .emailNotVerified:
            return "Please verify your email address"
        case .accountLocked:
            return "Contact support to unlock your account"
        case .storageUnavailable, .storageCorrupted:
            return "Try restarting the app"
        case .storageFull:
            return "Free up space on your device"
        case .fileTooBig:
            return "Choose a smaller file"
        case .unsupportedFileType:
            return "Choose a supported file type"
        case .rateLimited:
            return "Please wait before making another request"
        default:
            return "Please try again"
        }
    }
    
    // MARK: - Error Classification
    
    /// Whether this error is recoverable
    public var isRecoverable: Bool {
        switch self {
        case .networkUnavailable, .requestTimeout, .connectionFailed,
             .serverError(500...599, _), .websocketDisconnected,
             .operationCancelled, .resourceBusy:
            return true
        case .rateLimited:
            return true
        default:
            return false
        }
    }
    
    /// Whether this error requires user authentication
    public var requiresAuthentication: Bool {
        switch self {
        case .unauthorized, .forbidden, .tokenExpired,
             .invalidCredentials, .mfaRequired:
            return true
        default:
            return false
        }
    }
    
    /// Error code for programmatic handling
    public var code: String {
        switch self {
        case .invalidConfiguration: return "INVALID_CONFIGURATION"
        case .missingAPIKey: return "MISSING_API_KEY"
        case .invalidURL: return "INVALID_URL"
        case .alreadyInitialized: return "ALREADY_INITIALIZED"
        case .notInitialized: return "NOT_INITIALIZED"
        case .initializationFailed: return "INITIALIZATION_FAILED"
        case .networkUnavailable: return "NETWORK_UNAVAILABLE"
        case .requestTimeout: return "REQUEST_TIMEOUT"
        case .connectionFailed: return "CONNECTION_FAILED"
        case .invalidResponse: return "INVALID_RESPONSE"
        case .serverError: return "SERVER_ERROR"
        case .rateLimited: return "RATE_LIMITED"
        case .sslError: return "SSL_ERROR"
        case .unauthorized: return "UNAUTHORIZED"
        case .forbidden: return "FORBIDDEN"
        case .tokenExpired: return "TOKEN_EXPIRED"
        case .invalidCredentials: return "INVALID_CREDENTIALS"
        case .mfaRequired: return "MFA_REQUIRED"
        case .accountLocked: return "ACCOUNT_LOCKED"
        case .emailNotVerified: return "EMAIL_NOT_VERIFIED"
        case .invalidData: return "INVALID_DATA"
        case .encodingFailed: return "ENCODING_FAILED"
        case .decodingFailed: return "DECODING_FAILED"
        case .validationFailed: return "VALIDATION_FAILED"
        case .notFound: return "NOT_FOUND"
        case .conflict: return "CONFLICT"
        case .storageUnavailable: return "STORAGE_UNAVAILABLE"
        case .storageCorrupted: return "STORAGE_CORRUPTED"
        case .storageFull: return "STORAGE_FULL"
        case .keyNotFound: return "KEY_NOT_FOUND"
        case .encryptionFailed: return "ENCRYPTION_FAILED"
        case .decryptionFailed: return "DECRYPTION_FAILED"
        case .fileNotFound: return "FILE_NOT_FOUND"
        case .fileTooBig: return "FILE_TOO_BIG"
        case .unsupportedFileType: return "UNSUPPORTED_FILE_TYPE"
        case .uploadFailed: return "UPLOAD_FAILED"
        case .downloadFailed: return "DOWNLOAD_FAILED"
        case .insufficientStorage: return "INSUFFICIENT_STORAGE"
        case .websocketConnectionFailed: return "WEBSOCKET_CONNECTION_FAILED"
        case .websocketDisconnected: return "WEBSOCKET_DISCONNECTED"
        case .websocketMessageFailed: return "WEBSOCKET_MESSAGE_FAILED"
        case .operationCancelled: return "OPERATION_CANCELLED"
        case .operationFailed: return "OPERATION_FAILED"
        case .concurrentModification: return "CONCURRENT_MODIFICATION"
        case .resourceBusy: return "RESOURCE_BUSY"
        case .quotaExceeded: return "QUOTA_EXCEEDED"
        case .unknown: return "UNKNOWN"
        case .notImplemented: return "NOT_IMPLEMENTED"
        case .featureNotAvailable: return "FEATURE_NOT_AVAILABLE"
        }
    }
    
    // MARK: - Equatable
    
    public static func == (lhs: SDKError, rhs: SDKError) -> Bool {
        lhs.code == rhs.code
    }
}