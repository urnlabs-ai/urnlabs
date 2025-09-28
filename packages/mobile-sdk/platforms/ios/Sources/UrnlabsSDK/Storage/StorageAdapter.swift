import Foundation
import Combine

/// Protocol for storage adapters
public protocol StorageAdapter: AnyObject {
    
    // MARK: - Lifecycle
    
    /// Initialize the storage adapter
    func initialize() async throws
    
    /// Close the storage adapter
    func close() async
    
    // MARK: - Simple Key-Value Storage
    
    /// Store a string value
    func setString(_ value: String, forKey key: String) async throws
    
    /// Retrieve a string value
    func getString(forKey key: String) async -> String?
    
    /// Store an integer value
    func setInt(_ value: Int, forKey key: String) async throws
    
    /// Retrieve an integer value
    func getInt(forKey key: String) async -> Int?
    
    /// Store a boolean value
    func setBool(_ value: Bool, forKey key: String) async throws
    
    /// Retrieve a boolean value
    func getBool(forKey key: String) async -> Bool?
    
    /// Store a double value
    func setDouble(_ value: Double, forKey key: String) async throws
    
    /// Retrieve a double value
    func getDouble(forKey key: String) async -> Double?
    
    /// Store data
    func setData(_ value: Data, forKey key: String) async throws
    
    /// Retrieve data
    func getData(forKey key: String) async -> Data?
    
    /// Store a codable object
    func setCodable<T: Codable>(_ value: T, forKey key: String) async throws
    
    /// Retrieve a codable object
    func getCodable<T: Codable>(_ type: T.Type, forKey key: String) async -> T?
    
    /// Remove a value
    func removeValue(forKey key: String) async throws
    
    /// Check if a key exists
    func containsKey(_ key: String) async -> Bool
    
    /// Get all keys
    func getAllKeys() async -> [String]
    
    /// Clear all data
    func clearAll() async throws
    
    // MARK: - Structured Data Storage
    
    /// Create a table/collection
    func createTable(name: String, schema: [String: StorageDataType]) async throws
    
    /// Insert data into a table
    func insert(into table: String, data: [String: Any]) async throws -> String
    
    /// Query data from a table
    func query(
        from table: String,
        where conditions: [String: Any]?,
        orderBy: String?,
        ascending: Bool,
        limit: Int?,
        offset: Int?
    ) async throws -> [[String: Any]]
    
    /// Update data in a table
    func update(
        table: String,
        data: [String: Any],
        where conditions: [String: Any]
    ) async throws -> Int
    
    /// Delete data from a table
    func delete(
        from table: String,
        where conditions: [String: Any]
    ) async throws -> Int
    
    /// Execute raw query
    func executeQuery(_ query: String, parameters: [Any]?) async throws -> [[String: Any]]
    
    // MARK: - Transactions
    
    /// Begin a transaction
    func beginTransaction() async throws
    
    /// Commit a transaction
    func commitTransaction() async throws
    
    /// Rollback a transaction
    func rollbackTransaction() async throws
    
    /// Execute operations in a transaction
    func transaction<T>(_ operation: () async throws -> T) async throws -> T
    
    // MARK: - Cache Management
    
    /// Set cache with expiration
    func setCache<T: Codable>(
        _ value: T,
        forKey key: String,
        expiresIn: TimeInterval?
    ) async throws
    
    /// Get cache value
    func getCache<T: Codable>(_ type: T.Type, forKey key: String) async -> T?
    
    /// Clear expired cache entries
    func clearExpiredCache() async throws
    
    /// Get cache size
    func getCacheSize() async -> Int
    
    // MARK: - Batch Operations
    
    /// Perform batch operations
    func batch(_ operations: [StorageOperation]) async throws
    
    // MARK: - Synchronization
    
    /// Get changes since timestamp
    func getChangesSince(_ timestamp: Date) async throws -> [StorageChange]
    
    /// Mark data as synced
    func markSynced(changeIds: [String]) async throws
}

// MARK: - Supporting Types

public enum StorageDataType {
    case string
    case integer
    case double
    case boolean
    case data
    case date
    case json
}

public enum StorageOperation {
    case insert(table: String, data: [String: Any])
    case update(table: String, data: [String: Any], conditions: [String: Any])
    case delete(table: String, conditions: [String: Any])
    case setKeyValue(key: String, value: Any)
    case removeKey(String)
}

public struct StorageChange {
    public let id: String
    public let table: String
    public let operation: ChangeOperation
    public let data: [String: Any]?
    public let timestamp: Date
    public let isSynced: Bool
    
    public enum ChangeOperation: String {
        case insert
        case update
        case delete
    }
}

// MARK: - Error Types

public enum StorageError: Error, LocalizedError {
    case notInitialized
    case tableNotFound(String)
    case invalidData(String)
    case transactionFailed(Error)
    case corruptedData
    case diskFull
    case accessDenied
    case unknown(Error)
    
    public var errorDescription: String? {
        switch self {
        case .notInitialized:
            return "Storage is not initialized"
        case .tableNotFound(let table):
            return "Table '\(table)' not found"
        case .invalidData(let message):
            return "Invalid data: \(message)"
        case .transactionFailed(let error):
            return "Transaction failed: \(error.localizedDescription)"
        case .corruptedData:
            return "Storage data is corrupted"
        case .diskFull:
            return "Disk is full"
        case .accessDenied:
            return "Storage access denied"
        case .unknown(let error):
            return "Unknown storage error: \(error.localizedDescription)"
        }
    }
}