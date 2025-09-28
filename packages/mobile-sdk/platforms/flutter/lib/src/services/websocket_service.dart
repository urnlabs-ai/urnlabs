import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

import '../core/sdk_config.dart';
import '../core/sdk_error.dart';

class WebSocketService {
  final SDKConfig config;
  WebSocketChannel? _channel;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  
  final StreamController<WebSocketEvent> _eventController =
      StreamController<WebSocketEvent>.broadcast();
  
  bool _isConnected = false;
  bool _isConnecting = false;
  bool _shouldReconnect = true;
  int _reconnectAttempts = 0;
  static const int maxReconnectAttempts = 5;
  static const Duration baseReconnectDelay = Duration(seconds: 2);

  WebSocketService(this.config);

  /// Stream of WebSocket events
  Stream<WebSocketEvent> get events => _eventController.stream;

  /// Check if WebSocket is connected
  bool get isConnected => _isConnected;

  /// Check if WebSocket is initialized
  bool get isInitialized => _channel != null;

  /// Initialize WebSocket connection
  Future<void> initialize() async {
    if (config.websocketUrl == null) {
      throw SDKError.configurationError('WebSocket URL not configured');
    }

    await connect();
  }

  /// Connect to WebSocket
  Future<void> connect() async {
    if (_isConnecting || _isConnected) {
      return;
    }

    _isConnecting = true;

    try {
      _log('Connecting to WebSocket: ${config.websocketUrl}');

      final uri = Uri.parse(config.websocketUrl!);
      _channel = WebSocketChannel.connect(uri);

      // Wait for connection to be established
      await _channel!.ready;

      _isConnected = true;
      _isConnecting = false;
      _reconnectAttempts = 0;

      _log('WebSocket connected successfully');
      _emitEvent(WebSocketEvent(
        type: 'connected',
        data: {'url': config.websocketUrl},
        timestamp: DateTime.now(),
      ));

      // Start listening to messages
      _listenToMessages();

      // Start heartbeat
      _startHeartbeat();

    } catch (e) {
      _isConnecting = false;
      _isConnected = false;

      _log('WebSocket connection failed: $e');
      _emitEvent(WebSocketEvent(
        type: 'error',
        data: {'error': e.toString()},
        timestamp: DateTime.now(),
      ));

      // Schedule reconnect if enabled
      if (_shouldReconnect) {
        _scheduleReconnect();
      }

      throw SDKError.networkError('WebSocket connection failed: $e');
    }
  }

  /// Disconnect from WebSocket
  Future<void> disconnect() async {
    _shouldReconnect = false;
    
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();

    if (_channel != null) {
      await _channel!.sink.close(status.normalClosure);
      _channel = null;
    }

    _isConnected = false;
    _isConnecting = false;

    _log('WebSocket disconnected');
    _emitEvent(WebSocketEvent(
      type: 'disconnected',
      data: {},
      timestamp: DateTime.now(),
    ));
  }

  /// Reconnect WebSocket
  Future<void> reconnect() async {
    _log('Reconnecting WebSocket...');
    await disconnect();
    _shouldReconnect = true;
    await connect();
  }

  /// Send message through WebSocket
  void sendMessage(Map<String, dynamic> message) {
    if (!_isConnected || _channel == null) {
      throw SDKError.networkError('WebSocket not connected');
    }

    try {
      final jsonMessage = jsonEncode(message);
      _channel!.sink.add(jsonMessage);

      _log('Message sent: ${message['type'] ?? 'unknown'}');
      _emitEvent(WebSocketEvent(
        type: 'message_sent',
        data: message,
        timestamp: DateTime.now(),
      ));
    } catch (e) {
      _log('Failed to send message: $e');
      _emitEvent(WebSocketEvent(
        type: 'send_error',
        data: {'error': e.toString(), 'message': message},
        timestamp: DateTime.now(),
      ));
      
      throw SDKError.networkError('Failed to send WebSocket message: $e');
    }
  }

  /// Subscribe to specific event types
  void subscribeToEvent(String eventType) {
    sendMessage({
      'type': 'subscribe',
      'eventType': eventType,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  /// Unsubscribe from specific event types
  void unsubscribeFromEvent(String eventType) {
    sendMessage({
      'type': 'unsubscribe',
      'eventType': eventType,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  /// Send authentication message
  void authenticate(String token) {
    sendMessage({
      'type': 'auth',
      'token': token,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  /// Join a room/channel
  void joinRoom(String roomId) {
    sendMessage({
      'type': 'join_room',
      'roomId': roomId,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  /// Leave a room/channel
  void leaveRoom(String roomId) {
    sendMessage({
      'type': 'leave_room',
      'roomId': roomId,
      'timestamp': DateTime.now().toIso8601String(),
    });
  }

  void _listenToMessages() {
    _channel!.stream.listen(
      (message) {
        try {
          final data = jsonDecode(message) as Map<String, dynamic>;
          _handleMessage(data);
        } catch (e) {
          _log('Failed to parse WebSocket message: $e');
          _emitEvent(WebSocketEvent(
            type: 'parse_error',
            data: {'error': e.toString(), 'rawMessage': message},
            timestamp: DateTime.now(),
          ));
        }
      },
      onError: (error) {
        _log('WebSocket stream error: $error');
        _isConnected = false;
        
        _emitEvent(WebSocketEvent(
          type: 'error',
          data: {'error': error.toString()},
          timestamp: DateTime.now(),
        ));

        if (_shouldReconnect) {
          _scheduleReconnect();
        }
      },
      onDone: () {
        _log('WebSocket stream closed');
        _isConnected = false;
        
        _emitEvent(WebSocketEvent(
          type: 'disconnected',
          data: {},
          timestamp: DateTime.now(),
        ));

        if (_shouldReconnect) {
          _scheduleReconnect();
        }
      },
    );
  }

  void _handleMessage(Map<String, dynamic> data) {
    final messageType = data['type'] as String?;
    
    _log('Message received: $messageType');

    switch (messageType) {
      case 'pong':
        // Heartbeat response - no action needed
        break;
        
      case 'auth_success':
        _emitEvent(WebSocketEvent(
          type: 'authenticated',
          data: data,
          timestamp: DateTime.now(),
        ));
        break;
        
      case 'auth_error':
        _emitEvent(WebSocketEvent(
          type: 'auth_error',
          data: data,
          timestamp: DateTime.now(),
        ));
        break;
        
      case 'workflow_update':
        _emitEvent(WebSocketEvent(
          type: 'workflow_update',
          data: data,
          timestamp: DateTime.now(),
        ));
        break;
        
      case 'agent_message':
        _emitEvent(WebSocketEvent(
          type: 'agent_message',
          data: data,
          timestamp: DateTime.now(),
        ));
        break;
        
      case 'notification':
        _emitEvent(WebSocketEvent(
          type: 'notification',
          data: data,
          timestamp: DateTime.now(),
        ));
        break;
        
      default:
        _emitEvent(WebSocketEvent(
          type: messageType ?? 'unknown',
          data: data,
          timestamp: DateTime.now(),
        ));
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (timer) {
      if (_isConnected && _channel != null) {
        try {
          sendMessage({
            'type': 'ping',
            'timestamp': DateTime.now().toIso8601String(),
          });
        } catch (e) {
          _log('Heartbeat failed: $e');
          _isConnected = false;
          
          if (_shouldReconnect) {
            _scheduleReconnect();
          }
        }
      } else {
        timer.cancel();
      }
    });
  }

  void _scheduleReconnect() {
    if (_reconnectAttempts >= maxReconnectAttempts) {
      _log('Max reconnect attempts reached, giving up');
      _emitEvent(WebSocketEvent(
        type: 'max_reconnect_attempts',
        data: {'attempts': _reconnectAttempts},
        timestamp: DateTime.now(),
      ));
      return;
    }

    _reconnectAttempts++;
    final delay = Duration(
      seconds: baseReconnectDelay.inSeconds * _reconnectAttempts,
    );

    _log('Scheduling reconnect attempt $_reconnectAttempts in ${delay.inSeconds}s');
    
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, () {
      if (_shouldReconnect && !_isConnected && !_isConnecting) {
        connect().catchError((e) {
          _log('Reconnect attempt $_reconnectAttempts failed: $e');
        });
      }
    });
  }

  void _emitEvent(WebSocketEvent event) {
    if (!_eventController.isClosed) {
      _eventController.add(event);
    }
  }

  void _log(String message) {
    if (config.enableLogging) {
      developer.log('[WebSocket] $message', name: 'UrnlabsSDK');
    }
  }

  /// Shutdown WebSocket service
  Future<void> shutdown() async {
    await disconnect();
    await _eventController.close();
  }

  /// Get connection statistics
  Map<String, dynamic> getConnectionStats() {
    return {
      'isConnected': _isConnected,
      'isConnecting': _isConnecting,
      'reconnectAttempts': _reconnectAttempts,
      'maxReconnectAttempts': maxReconnectAttempts,
      'shouldReconnect': _shouldReconnect,
      'websocketUrl': config.websocketUrl,
    };
  }
}

/// WebSocket event class
class WebSocketEvent {
  final String type;
  final Map<String, dynamic> data;
  final DateTime timestamp;

  WebSocketEvent({
    required this.type,
    required this.data,
    required this.timestamp,
  });

  @override
  String toString() {
    return 'WebSocketEvent(type: $type, data: $data, timestamp: $timestamp)';
  }
}