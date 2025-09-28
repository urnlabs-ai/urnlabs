/// Abstract storage adapter interface for platform-specific implementations
abstract class StorageAdapter {
  /// Initialize the storage adapter
  Future<void> initialize();

  /// Close and cleanup storage
  Future<void> close();

  /// Store a string value
  Future<void> setString(String key, String value);

  /// Retrieve a string value
  Future<String?> getString(String key);

  /// Store an integer value
  Future<void> setInt(String key, int value);

  /// Retrieve an integer value
  Future<int?> getInt(String key);

  /// Store a boolean value
  Future<void> setBool(String key, bool value);

  /// Retrieve a boolean value
  Future<bool?> getBool(String key);

  /// Store a JSON object
  Future<void> setJson(String key, Map<String, dynamic> value);

  /// Retrieve a JSON object
  Future<Map<String, dynamic>?> getJson(String key);

  /// Store a list of strings
  Future<void> setStringList(String key, List<String> value);

  /// Retrieve a list of strings
  Future<List<String>?> getStringList(String key);

  /// Remove a value
  Future<void> remove(String key);

  /// Clear all stored data
  Future<void> clear();

  /// Check if a key exists
  Future<bool> containsKey(String key);

  /// Get all keys
  Future<Set<String>> getKeys();

  // Database operations for structured data

  /// Create a table if it doesn't exist
  Future<void> createTable(String tableName, Map<String, String> columns);

  /// Insert data into a table
  Future<int> insert(String tableName, Map<String, dynamic> data);

  /// Query data from a table
  Future<List<Map<String, dynamic>>> query(
    String tableName, {
    List<String>? columns,
    String? where,
    List<dynamic>? whereArgs,
    String? orderBy,
    int? limit,
    int? offset,
  });

  /// Update data in a table
  Future<int> update(
    String tableName,
    Map<String, dynamic> data, {
    String? where,
    List<dynamic>? whereArgs,
  });

  /// Delete data from a table
  Future<int> delete(
    String tableName, {
    String? where,
    List<dynamic>? whereArgs,
  });

  /// Execute raw SQL query
  Future<List<Map<String, dynamic>>> rawQuery(
    String sql, [
    List<dynamic>? arguments,
  ]);

  /// Execute raw SQL command
  Future<int> rawExecute(
    String sql, [
    List<dynamic>? arguments,
  ]);

  /// Begin a transaction
  Future<void> beginTransaction();

  /// Commit a transaction
  Future<void> commitTransaction();

  /// Rollback a transaction
  Future<void> rollbackTransaction();

  /// Execute operations in a transaction
  Future<T> transaction<T>(Future<T> Function() action);
}