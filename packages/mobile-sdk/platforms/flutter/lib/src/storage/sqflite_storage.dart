import 'dart:convert';
import 'package:path/path.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';

import 'storage_adapter.dart';

class SqfliteStorage implements StorageAdapter {
  static const String _dbName = 'urnlabs_sdk.db';
  static const int _dbVersion = 1;

  Database? _database;
  SharedPreferences? _prefs;
  Database? _currentTransaction;

  @override
  Future<void> initialize() async {
    _prefs = await SharedPreferences.getInstance();
    await _initializeDatabase();
  }

  Future<void> _initializeDatabase() async {
    final path = join(await getDatabasesPath(), _dbName);
    
    _database = await openDatabase(
      path,
      version: _dbVersion,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  void _onCreate(Database db, int version) async {
    // Create system tables
    await db.execute('''
      CREATE TABLE IF NOT EXISTS sdk_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS sdk_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        timestamp INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        input_data TEXT,
        output_data TEXT,
        error_data TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');

    await db.execute('''
      CREATE TABLE IF NOT EXISTS agent_conversations (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        messages TEXT NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    ''');
  }

  void _onUpgrade(Database db, int oldVersion, int newVersion) async {
    // Handle database upgrades
    if (oldVersion < newVersion) {
      // Add migration logic here for future versions
    }
  }

  Database get _db {
    if (_currentTransaction != null) {
      return _currentTransaction!;
    }
    if (_database == null) {
      throw StateError('Database not initialized. Call initialize() first.');
    }
    return _database!;
  }

  @override
  Future<void> close() async {
    await _database?.close();
    _database = null;
    _currentTransaction = null;
  }

  // SharedPreferences operations for simple key-value storage
  @override
  Future<void> setString(String key, String value) async {
    await _prefs!.setString(key, value);
  }

  @override
  Future<String?> getString(String key) async {
    return _prefs!.getString(key);
  }

  @override
  Future<void> setInt(String key, int value) async {
    await _prefs!.setInt(key, value);
  }

  @override
  Future<int?> getInt(String key) async {
    return _prefs!.getInt(key);
  }

  @override
  Future<void> setBool(String key, bool value) async {
    await _prefs!.setBool(key, value);
  }

  @override
  Future<bool?> getBool(String key) async {
    return _prefs!.getBool(key);
  }

  @override
  Future<void> setJson(String key, Map<String, dynamic> value) async {
    await _prefs!.setString(key, jsonEncode(value));
  }

  @override
  Future<Map<String, dynamic>?> getJson(String key) async {
    final jsonString = _prefs!.getString(key);
    if (jsonString == null) return null;
    
    try {
      return jsonDecode(jsonString) as Map<String, dynamic>;
    } catch (e) {
      return null;
    }
  }

  @override
  Future<void> setStringList(String key, List<String> value) async {
    await _prefs!.setStringList(key, value);
  }

  @override
  Future<List<String>?> getStringList(String key) async {
    return _prefs!.getStringList(key);
  }

  @override
  Future<void> remove(String key) async {
    await _prefs!.remove(key);
  }

  @override
  Future<void> clear() async {
    await _prefs!.clear();
    await _db.delete('sdk_cache');
    await _db.delete('sdk_logs');
    await _db.delete('workflow_runs');
    await _db.delete('agent_conversations');
  }

  @override
  Future<bool> containsKey(String key) async {
    return _prefs!.containsKey(key);
  }

  @override
  Future<Set<String>> getKeys() async {
    return _prefs!.getKeys();
  }

  // Database operations
  @override
  Future<void> createTable(String tableName, Map<String, String> columns) async {
    final columnDefs = columns.entries
        .map((e) => '${e.key} ${e.value}')
        .join(', ');
    
    await _db.execute('CREATE TABLE IF NOT EXISTS $tableName ($columnDefs)');
  }

  @override
  Future<int> insert(String tableName, Map<String, dynamic> data) async {
    return await _db.insert(tableName, data);
  }

  @override
  Future<List<Map<String, dynamic>>> query(
    String tableName, {
    List<String>? columns,
    String? where,
    List<dynamic>? whereArgs,
    String? orderBy,
    int? limit,
    int? offset,
  }) async {
    return await _db.query(
      tableName,
      columns: columns,
      where: where,
      whereArgs: whereArgs,
      orderBy: orderBy,
      limit: limit,
      offset: offset,
    );
  }

  @override
  Future<int> update(
    String tableName,
    Map<String, dynamic> data, {
    String? where,
    List<dynamic>? whereArgs,
  }) async {
    return await _db.update(
      tableName,
      data,
      where: where,
      whereArgs: whereArgs,
    );
  }

  @override
  Future<int> delete(
    String tableName, {
    String? where,
    List<dynamic>? whereArgs,
  }) async {
    return await _db.delete(
      tableName,
      where: where,
      whereArgs: whereArgs,
    );
  }

  @override
  Future<List<Map<String, dynamic>>> rawQuery(
    String sql, [
    List<dynamic>? arguments,
  ]) async {
    return await _db.rawQuery(sql, arguments);
  }

  @override
  Future<int> rawExecute(
    String sql, [
    List<dynamic>? arguments,
  ]) async {
    return await _db.rawUpdate(sql, arguments);
  }

  @override
  Future<void> beginTransaction() async {
    _currentTransaction = _database;
    await _currentTransaction!.execute('BEGIN TRANSACTION');
  }

  @override
  Future<void> commitTransaction() async {
    if (_currentTransaction != null) {
      await _currentTransaction!.execute('COMMIT');
      _currentTransaction = null;
    }
  }

  @override
  Future<void> rollbackTransaction() async {
    if (_currentTransaction != null) {
      await _currentTransaction!.execute('ROLLBACK');
      _currentTransaction = null;
    }
  }

  @override
  Future<T> transaction<T>(Future<T> Function() action) async {
    return await _db.transaction((txn) async {
      final oldTransaction = _currentTransaction;
      _currentTransaction = txn;
      
      try {
        final result = await action();
        return result;
      } finally {
        _currentTransaction = oldTransaction;
      }
    });
  }

  // Helper methods for caching
  Future<void> setCache(String key, dynamic value, {Duration? ttl}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final expiresAt = ttl != null ? now + ttl.inMilliseconds : null;
    
    await _db.insert(
      'sdk_cache',
      {
        'key': key,
        'value': jsonEncode(value),
        'created_at': now,
        'expires_at': expiresAt,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<T?> getCache<T>(String key, T Function(dynamic) fromJson) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    
    final results = await _db.query(
      'sdk_cache',
      where: 'key = ? AND (expires_at IS NULL OR expires_at > ?)',
      whereArgs: [key, now],
      limit: 1,
    );

    if (results.isNotEmpty) {
      try {
        final value = jsonDecode(results.first['value'] as String);
        return fromJson(value);
      } catch (e) {
        // Remove invalid cache entry
        await _db.delete('sdk_cache', where: 'key = ?', whereArgs: [key]);
        return null;
      }
    }

    return null;
  }

  Future<void> clearExpiredCache() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db.delete(
      'sdk_cache',
      where: 'expires_at IS NOT NULL AND expires_at <= ?',
      whereArgs: [now],
    );
  }

  // Log storage methods
  Future<void> storeLog(String level, String message, Map<String, dynamic>? data) async {
    await _db.insert('sdk_logs', {
      'level': level,
      'message': message,
      'data': data != null ? jsonEncode(data) : null,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
    });
  }

  Future<List<Map<String, dynamic>>> getLogs({
    String? level,
    DateTime? since,
    int? limit,
  }) async {
    String where = '';
    List<dynamic> whereArgs = [];

    if (level != null) {
      where = 'level = ?';
      whereArgs.add(level);
    }

    if (since != null) {
      if (where.isNotEmpty) where += ' AND ';
      where += 'timestamp >= ?';
      whereArgs.add(since.millisecondsSinceEpoch);
    }

    return await _db.query(
      'sdk_logs',
      where: where.isNotEmpty ? where : null,
      whereArgs: whereArgs.isNotEmpty ? whereArgs : null,
      orderBy: 'timestamp DESC',
      limit: limit,
    );
  }

  Future<void> clearOldLogs({Duration? olderThan}) async {
    final cutoff = olderThan ?? const Duration(days: 7);
    final timestamp = DateTime.now().subtract(cutoff).millisecondsSinceEpoch;
    
    await _db.delete(
      'sdk_logs',
      where: 'timestamp < ?',
      whereArgs: [timestamp],
    );
  }
}