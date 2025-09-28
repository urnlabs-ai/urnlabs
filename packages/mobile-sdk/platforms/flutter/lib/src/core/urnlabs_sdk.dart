/// Main Urnlabs SDK class for Flutter
import 'dart:async';
import 'dart:developer' as developer;

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import '../services/auth_service.dart';
import '../services/workflow_service.dart';
import '../services/agent_service.dart';
import '../services/file_service.dart';
import '../services/websocket_service.dart';
import '../storage/storage_adapter.dart';
import '../storage/sqflite_storage.dart';
import '../http/http_client.dart';
import 'sdk_config.dart';
import 'sdk_error.dart';

class UrnlabsSDK {
  static UrnlabsSDK? _instance;
  static UrnlabsSDK get instance {
    if (_instance == null) {
      throw SDKError(
        code: 'SDK_NOT_INITIALIZED',
        message: 'SDK must be initialized before use. Call UrnlabsSDK.initialize() first.',
      );
    }
    return _instance!;
  }

  final SDKConfig config;
  late final HttpClient _httpClient;
  late final StorageAdapter _storage;
  late final AuthService _authService;
  late final WorkflowService _workflowService;
  late final AgentService _agentService;
  late final FileService _fileService;
  late final WebSocketService _webSocketService;

  late final StreamController<SDKEvent> _eventController;
  late final StreamSubscription _connectivitySubscription;

  bool _isInitialized = false;
  bool _isOnline = true;

  UrnlabsSDK._(this.config) {
    _eventController = StreamController<SDKEvent>.broadcast();
    _setupServices();
    _setupConnectivityMonitoring();
  }

  /// Initialize the SDK with configuration
  static Future<UrnlabsSDK> initialize(SDKConfig config) async {
    if (_instance != null) {
      await _instance!.shutdown();
    }

    _instance = UrnlabsSDK._(config);
    await _instance!._initialize();
    return _instance!;
  }

  /// Stream of SDK events
  Stream<SDKEvent> get events => _eventController.stream;

  /// Services
  AuthService get auth => _authService;
  WorkflowService get workflows => _workflowService;
  AgentService get agents => _agentService;
  FileService get files => _fileService;
  WebSocketService get websocket => _webSocketService;

  /// Check if SDK is initialized
  bool get isInitialized => _isInitialized;

  /// Check if device is online
  bool get isOnline => _isOnline;

  void _setupServices() {
    _storage = SqfliteStorage();
    _httpClient = HttpClient(config, _storage);
    _authService = AuthService(_httpClient, _storage);
    _workflowService = WorkflowService(_httpClient);
    _agentService = AgentService(_httpClient);
    _fileService = FileService(_httpClient);
    _webSocketService = WebSocketService(config);
  }

  void _setupConnectivityMonitoring() {
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen(
      (ConnectivityResult result) {
        final wasOnline = _isOnline;
        _isOnline = result != ConnectivityResult.none;

        if (wasOnline != _isOnline) {
          _emitEvent(SDKEvent(
            type: _isOnline ? 'sdk:online' : 'sdk:offline',
            data: {'isOnline': _isOnline, 'connectivity': result.name},
            timestamp: DateTime.now(),
          ));

          _log(LogLevel.info, 'Network status changed: ${_isOnline ? 'online' : 'offline'}');

          // Reconnect WebSocket if back online
          if (_isOnline && _webSocketService.isInitialized) {
            _webSocketService.reconnect();
          }
        }
      },
    );
  }

  Future<void> _initialize() async {
    try {
      _log(LogLevel.info, 'Initializing Urnlabs SDK...');

      // Initialize storage
      await _storage.initialize();

      // Restore authentication state
      await _authService.restoreAuthState();

      // Initialize WebSocket if configured
      if (config.websocketUrl != null) {
        await _webSocketService.initialize();
      }

      _isInitialized = true;
      _emitEvent(SDKEvent(
        type: 'sdk:initialized',
        data: {'version': '1.0.0'},
        timestamp: DateTime.now(),
      ));

      _log(LogLevel.info, 'SDK initialized successfully');
    } catch (error) {
      _log(LogLevel.error, 'SDK initialization failed: $error');
      throw SDKError.unknown('Failed to initialize SDK', originalError: error);
    }
  }

  /// Shutdown the SDK and cleanup resources
  Future<void> shutdown() async {
    try {
      _log(LogLevel.info, 'Shutting down SDK...');

      await _connectivitySubscription.cancel();
      await _webSocketService.shutdown();
      await _storage.close();
      await _eventController.close();

      _isInitialized = false;
      _instance = null;

      _log(LogLevel.info, 'SDK shutdown complete');
    } catch (error) {
      _log(LogLevel.error, 'Error during SDK shutdown: $error');
    }
  }

  /// Check network connectivity
  Future<ConnectivityResult> checkConnectivity() async {
    return await Connectivity().checkConnectivity();
  }

  /// Set offline mode
  void setOfflineMode(bool enabled) {
    _isOnline = !enabled;
    _emitEvent(SDKEvent(
      type: enabled ? 'sdk:offline_mode_enabled' : 'sdk:offline_mode_disabled',
      data: {'offlineMode': enabled},
      timestamp: DateTime.now(),
    ));
  }

  void _emitEvent(SDKEvent event) {
    if (!_eventController.isClosed) {
      _eventController.add(event);
    }
  }

  void _log(LogLevel level, String message, [Map<String, dynamic>? data]) {
    if (!config.enableLogging) return;

    final levelIndex = LogLevel.values.indexOf(level);
    final configLevelIndex = LogLevel.values.indexOf(config.logLevel);

    if (levelIndex >= configLevelIndex) {
      final logMessage = '[UrnlabsSDK] $message';

      if (kDebugMode) {
        switch (level) {
          case LogLevel.debug:
            developer.log(logMessage, name: 'UrnlabsSDK', level: 500);
            break;
          case LogLevel.info:
            developer.log(logMessage, name: 'UrnlabsSDK', level: 800);
            break;
          case LogLevel.warn:
            developer.log(logMessage, name: 'UrnlabsSDK', level: 900);
            break;
          case LogLevel.error:
            developer.log(logMessage, name: 'UrnlabsSDK', level: 1000);
            break;
        }
      }

      // Emit log event
      _emitEvent(SDKEvent(
        type: 'sdk:log',
        data: {
          'level': level.name,
          'message': message,
          'data': data,
        },
        timestamp: DateTime.now(),
      ));
    }
  }
}

/// SDK Event class
class SDKEvent {
  final String type;
  final Map<String, dynamic> data;
  final DateTime timestamp;

  SDKEvent({
    required this.type,
    required this.data,
    required this.timestamp,
  });

  @override
  String toString() {
    return 'SDKEvent(type: $type, data: $data, timestamp: $timestamp)';
  }
}