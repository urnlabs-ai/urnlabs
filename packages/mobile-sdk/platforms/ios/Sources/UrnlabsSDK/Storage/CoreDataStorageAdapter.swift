import Foundation
import CoreData
import OSLog

/// Core Data implementation of the storage adapter
public class CoreDataStorageAdapter: StorageAdapter {
    private let logger = Logger(subsystem: "com.urnlabs.sdk", category: "CoreDataStorage")
    private let persistentContainer: NSPersistentContainer
    private let keychain: KeychainHelper

    // MARK: - Initialization

    public init() throws {
        self.keychain = KeychainHelper()

        // Create the Core Data model programmatically
        let model = Self.createDataModel()

        // Initialize persistent container
        self.persistentContainer = NSPersistentContainer(name: "UrnlabsSDK", managedObjectModel: model)

        // Configure persistent store
        let description = persistentContainer.persistentStoreDescriptions.first
        description?.type = NSSQLiteStoreType
        description?.shouldInferMappingModelAutomatically = true
        description?.shouldMigrateStoreAutomatically = true

        // Set store location
        if let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
            let storeURL = documentsPath.appendingPathComponent("UrnlabsSDK.sqlite")
            description?.url = storeURL
        }

        // Load persistent stores
        var loadError: Error?
        persistentContainer.loadPersistentStores { _, error in
            if let error = error {
                loadError = error
            }
        }

        if let error = loadError {
            logger.error("Failed to load Core Data store: \(error.localizedDescription)")
            throw SDKError.storageInitializationFailed
        }

        // Configure context
        persistentContainer.viewContext.automaticallyMergesChangesFromParent = true
        persistentContainer.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        logger.info("Core Data storage adapter initialized successfully")
    }

    // MARK: - StorageAdapter Implementation

    public func setValue(_ value: String, for key: String) async {
        await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    // Find existing entry or create new one
                    let request: NSFetchRequest<KeyValueEntity> = KeyValueEntity.fetchRequest()
                    request.predicate = NSPredicate(format: "key == %@", key)

                    let results = try context.fetch(request)
                    let entity: KeyValueEntity

                    if let existing = results.first {
                        entity = existing
                    } else {
                        entity = KeyValueEntity(context: context)
                        entity.key = key
                        entity.createdAt = Date()
                    }

                    entity.value = value
                    entity.updatedAt = Date()

                    try context.save()
                    self.logger.debug("Stored value for key: \(key)")

                } catch {
                    self.logger.error("Failed to store value for key \(key): \(error.localizedDescription)")
                }

                continuation.resume()
            }
        }
    }

    public func getValue(for key: String) async -> String? {
        return await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    let request: NSFetchRequest<KeyValueEntity> = KeyValueEntity.fetchRequest()
                    request.predicate = NSPredicate(format: "key == %@", key)
                    request.fetchLimit = 1

                    let results = try context.fetch(request)
                    let value = results.first?.value

                    if value != nil {
                        self.logger.debug("Retrieved value for key: \(key)")
                    }

                    continuation.resume(returning: value)

                } catch {
                    self.logger.error("Failed to retrieve value for key \(key): \(error.localizedDescription)")
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    public func removeValue(for key: String) async {
        await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    let request: NSFetchRequest<KeyValueEntity> = KeyValueEntity.fetchRequest()
                    request.predicate = NSPredicate(format: "key == %@", key)

                    let results = try context.fetch(request)

                    for entity in results {
                        context.delete(entity)
                    }

                    try context.save()
                    self.logger.debug("Removed value for key: \(key)")

                } catch {
                    self.logger.error("Failed to remove value for key \(key): \(error.localizedDescription)")
                }

                continuation.resume()
            }
        }
    }

    public func setSecureValue(_ value: String, for key: String) async {
        do {
            try keychain.set(value, for: key)
            logger.debug("Stored secure value for key: \(key)")
        } catch {
            logger.error("Failed to store secure value for key \(key): \(error.localizedDescription)")
        }
    }

    public func getSecureValue(for key: String) async -> String? {
        do {
            let value = try keychain.get(key)
            if value != nil {
                logger.debug("Retrieved secure value for key: \(key)")
            }
            return value
        } catch {
            logger.error("Failed to retrieve secure value for key \(key): \(error.localizedDescription)")
            return nil
        }
    }

    public func removeSecureValue(for key: String) async {
        do {
            try keychain.delete(key)
            logger.debug("Removed secure value for key: \(key)")
        } catch {
            logger.error("Failed to remove secure value for key \(key): \(error.localizedDescription)")
        }
    }

    public func clear() async {
        // Clear Core Data storage
        await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    // Delete all KeyValueEntity objects
                    let request: NSFetchRequest<NSFetchRequestResult> = KeyValueEntity.fetchRequest()
                    let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)

                    try context.execute(deleteRequest)
                    try context.save()

                    self.logger.info("Cleared Core Data storage")

                } catch {
                    self.logger.error("Failed to clear Core Data storage: \(error.localizedDescription)")
                }

                continuation.resume()
            }
        }

        // Clear keychain storage
        do {
            try keychain.deleteAll()
            logger.info("Cleared keychain storage")
        } catch {
            logger.error("Failed to clear keychain storage: \(error.localizedDescription)")
        }
    }

    // MARK: - Cache Management

    /// Store cached data with expiration
    public func setCachedData(_ data: Data, for key: String, expiresIn: TimeInterval) async {
        await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    // Find existing entry or create new one
                    let request: NSFetchRequest<CacheEntity> = CacheEntity.fetchRequest()
                    request.predicate = NSPredicate(format: "key == %@", key)

                    let results = try context.fetch(request)
                    let entity: CacheEntity

                    if let existing = results.first {
                        entity = existing
                    } else {
                        entity = CacheEntity(context: context)
                        entity.key = key
                        entity.createdAt = Date()
                    }

                    entity.data = data
                    entity.expiresAt = Date().addingTimeInterval(expiresIn)
                    entity.updatedAt = Date()

                    try context.save()
                    self.logger.debug("Cached data for key: \(key)")

                } catch {
                    self.logger.error("Failed to cache data for key \(key): \(error.localizedDescription)")
                }

                continuation.resume()
            }
        }
    }

    /// Retrieve cached data if not expired
    public func getCachedData(for key: String) async -> Data? {
        return await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    let request: NSFetchRequest<CacheEntity> = CacheEntity.fetchRequest()
                    request.predicate = NSPredicate(format: "key == %@ AND expiresAt > %@", key, Date() as NSDate)
                    request.fetchLimit = 1

                    let results = try context.fetch(request)
                    let data = results.first?.data

                    if data != nil {
                        self.logger.debug("Retrieved cached data for key: \(key)")
                    }

                    continuation.resume(returning: data)

                } catch {
                    self.logger.error("Failed to retrieve cached data for key \(key): \(error.localizedDescription)")
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    /// Clear expired cache entries
    public func clearExpiredCache() async {
        await withCheckedContinuation { continuation in
            persistentContainer.performBackgroundTask { context in
                do {
                    let request: NSFetchRequest<NSFetchRequestResult> = CacheEntity.fetchRequest()
                    request.predicate = NSPredicate(format: "expiresAt <= %@", Date() as NSDate)

                    let deleteRequest = NSBatchDeleteRequest(fetchRequest: request)
                    let result = try context.execute(deleteRequest) as? NSBatchDeleteResult

                    if let deletedCount = result?.result as? Int, deletedCount > 0 {
                        self.logger.info("Cleared \(deletedCount) expired cache entries")
                    }

                } catch {
                    self.logger.error("Failed to clear expired cache: \(error.localizedDescription)")
                }

                continuation.resume()
            }
        }
    }

    // MARK: - Private Methods

    private static func createDataModel() -> NSManagedObjectModel {
        let model = NSManagedObjectModel()

        // KeyValueEntity
        let keyValueEntity = NSEntityDescription()
        keyValueEntity.name = "KeyValueEntity"
        keyValueEntity.managedObjectClassName = NSStringFromClass(KeyValueEntity.self)

        let keyAttribute = NSAttributeDescription()
        keyAttribute.name = "key"
        keyAttribute.attributeType = .stringAttributeType
        keyAttribute.isOptional = false

        let valueAttribute = NSAttributeDescription()
        valueAttribute.name = "value"
        valueAttribute.attributeType = .stringAttributeType
        valueAttribute.isOptional = false

        let createdAtAttribute = NSAttributeDescription()
        createdAtAttribute.name = "createdAt"
        createdAtAttribute.attributeType = .dateAttributeType
        createdAtAttribute.isOptional = false

        let updatedAtAttribute = NSAttributeDescription()
        updatedAtAttribute.name = "updatedAt"
        updatedAtAttribute.attributeType = .dateAttributeType
        updatedAtAttribute.isOptional = false

        keyValueEntity.properties = [keyAttribute, valueAttribute, createdAtAttribute, updatedAtAttribute]

        // CacheEntity
        let cacheEntity = NSEntityDescription()
        cacheEntity.name = "CacheEntity"
        cacheEntity.managedObjectClassName = NSStringFromClass(CacheEntity.self)

        let cacheKeyAttribute = NSAttributeDescription()
        cacheKeyAttribute.name = "key"
        cacheKeyAttribute.attributeType = .stringAttributeType
        cacheKeyAttribute.isOptional = false

        let dataAttribute = NSAttributeDescription()
        dataAttribute.name = "data"
        dataAttribute.attributeType = .binaryDataAttributeType
        dataAttribute.isOptional = false

        let expiresAtAttribute = NSAttributeDescription()
        expiresAtAttribute.name = "expiresAt"
        expiresAtAttribute.attributeType = .dateAttributeType
        expiresAtAttribute.isOptional = false

        let cacheCreatedAtAttribute = NSAttributeDescription()
        cacheCreatedAtAttribute.name = "createdAt"
        cacheCreatedAtAttribute.attributeType = .dateAttributeType
        cacheCreatedAtAttribute.isOptional = false

        let cacheUpdatedAtAttribute = NSAttributeDescription()
        cacheUpdatedAtAttribute.name = "updatedAt"
        cacheUpdatedAtAttribute.attributeType = .dateAttributeType
        cacheUpdatedAtAttribute.isOptional = false

        cacheEntity.properties = [cacheKeyAttribute, dataAttribute, expiresAtAttribute, cacheCreatedAtAttribute, cacheUpdatedAtAttribute]

        model.entities = [keyValueEntity, cacheEntity]
        return model
    }
}

// MARK: - Core Data Entities

@objc(KeyValueEntity)
public class KeyValueEntity: NSManagedObject {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<KeyValueEntity> {
        return NSFetchRequest<KeyValueEntity>(entityName: "KeyValueEntity")
    }

    @NSManaged public var key: String
    @NSManaged public var value: String
    @NSManaged public var createdAt: Date
    @NSManaged public var updatedAt: Date
}

@objc(CacheEntity)
public class CacheEntity: NSManagedObject {
    @nonobjc public class func fetchRequest() -> NSFetchRequest<CacheEntity> {
        return NSFetchRequest<CacheEntity>(entityName: "CacheEntity")
    }

    @NSManaged public var key: String
    @NSManaged public var data: Data
    @NSManaged public var expiresAt: Date
    @NSManaged public var createdAt: Date
    @NSManaged public var updatedAt: Date
}

// MARK: - Keychain Helper

private class KeychainHelper {
    private let serviceName = "com.urnlabs.sdk"

    func set(_ value: String, for key: String) throws {
        let data = value.data(using: .utf8)!

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]

        // Delete existing item first
        SecItemDelete(query as CFDictionary)

        // Add new item
        let status = SecItemAdd(query as CFDictionary, nil)

        guard status == errSecSuccess else {
            throw KeychainError.unableToStore(status)
        }
    }

    func get(_ key: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        switch status {
        case errSecSuccess:
            guard let data = result as? Data,
                  let string = String(data: data, encoding: .utf8) else {
                throw KeychainError.unexpectedData
            }
            return string
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.unableToRetrieve(status)
        }
    }

    func delete(_ key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unableToDelete(status)
        }
    }

    func deleteAll() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName
        ]

        let status = SecItemDelete(query as CFDictionary)

        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unableToDelete(status)
        }
    }
}

// MARK: - Keychain Errors

private enum KeychainError: Error, LocalizedError {
    case unableToStore(OSStatus)
    case unableToRetrieve(OSStatus)
    case unableToDelete(OSStatus)
    case unexpectedData

    var errorDescription: String? {
        switch self {
        case .unableToStore(let status):
            return "Unable to store item in keychain (status: \(status))"
        case .unableToRetrieve(let status):
            return "Unable to retrieve item from keychain (status: \(status))"
        case .unableToDelete(let status):
            return "Unable to delete item from keychain (status: \(status))"
        case .unexpectedData:
            return "Unexpected data format in keychain"
        }
    }
}