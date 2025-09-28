/// SDK Configuration for Flutter
class SDKConfig {
  final String baseUrl;
  final String? websocketUrl;
  final String? apiKey;
  final Duration timeout;
  final int retryAttempts;
  final Duration retryDelay;
  final bool enableLogging;
  final LogLevel logLevel;
  final bool enableOffline;
  final List<String>? certificatePinning;

  const SDKConfig({
    this.baseUrl = 'https://api.urnlabs.com',
    this.websocketUrl = 'wss://ws.urnlabs.com',
    this.apiKey,
    this.timeout = const Duration(seconds: 30),
    this.retryAttempts = 3,
    this.retryDelay = const Duration(seconds: 1),
    this.enableLogging = true,
    this.logLevel = LogLevel.info,
    this.enableOffline = true,
    this.certificatePinning,
  });

  SDKConfig copyWith({
    String? baseUrl,
    String? websocketUrl,
    String? apiKey,
    Duration? timeout,
    int? retryAttempts,
    Duration? retryDelay,
    bool? enableLogging,
    LogLevel? logLevel,
    bool? enableOffline,
    List<String>? certificatePinning,
  }) {
    return SDKConfig(
      baseUrl: baseUrl ?? this.baseUrl,
      websocketUrl: websocketUrl ?? this.websocketUrl,
      apiKey: apiKey ?? this.apiKey,
      timeout: timeout ?? this.timeout,
      retryAttempts: retryAttempts ?? this.retryAttempts,
      retryDelay: retryDelay ?? this.retryDelay,
      enableLogging: enableLogging ?? this.enableLogging,
      logLevel: logLevel ?? this.logLevel,
      enableOffline: enableOffline ?? this.enableOffline,
      certificatePinning: certificatePinning ?? this.certificatePinning,
    );
  }

  /// Create configuration for development environment
  static SDKConfig development({
    String? apiKey,
  }) {
    return SDKConfig(
      baseUrl: 'http://localhost:7001',
      websocketUrl: 'ws://localhost:7001/ws',
      apiKey: apiKey,
      enableLogging: true,
      logLevel: LogLevel.debug,
      retryAttempts: 1,
      certificatePinning: null,
    );
  }

  /// Create configuration for staging environment
  static SDKConfig staging({
    String? apiKey,
  }) {
    return SDKConfig(
      baseUrl: 'https://staging-api.urnlabs.com',
      websocketUrl: 'wss://staging-ws.urnlabs.com',
      apiKey: apiKey,
      enableLogging: true,
      logLevel: LogLevel.info,
      retryAttempts: 2,
      certificatePinning: const ['staging-cert-fingerprint'],
    );
  }

  /// Create configuration for production environment
  static SDKConfig production({
    required String apiKey,
  }) {
    return SDKConfig(
      baseUrl: 'https://api.urnlabs.com',
      websocketUrl: 'wss://ws.urnlabs.com',
      apiKey: apiKey,
      enableLogging: false,
      logLevel: LogLevel.error,
      retryAttempts: 3,
      certificatePinning: const ['production-cert-fingerprint'],
    );
  }
}

enum LogLevel {
  debug,
  info,
  warn,
  error,
}