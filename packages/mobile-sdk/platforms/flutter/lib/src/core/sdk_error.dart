/// SDK Error types and handling
class SDKError implements Exception {
  final String code;
  final String message;
  final int? statusCode;
  final Map<String, dynamic>? details;
  final DateTime timestamp;
  final StackTrace? stackTrace;

  SDKError({
    required this.code,
    required this.message,
    this.statusCode,
    this.details,
    StackTrace? stackTrace,
  }) : timestamp = DateTime.now(),
       stackTrace = stackTrace ?? StackTrace.current;

  @override
  String toString() {
    return 'SDKError($code): $message';
  }

  /// Create network error
  static SDKError network(String message, {int? statusCode, dynamic originalError}) {
    return SDKError(
      code: 'NETWORK_ERROR',
      message: message,
      statusCode: statusCode,
      details: originalError != null ? {'originalError': originalError.toString()} : null,
    );
  }

  /// Create authentication error
  static SDKError auth(String message, {int? statusCode}) {
    return SDKError(
      code: 'AUTH_ERROR',
      message: message,
      statusCode: statusCode,
    );
  }

  /// Create validation error
  static SDKError validation(String message, {Map<String, dynamic>? details}) {
    return SDKError(
      code: 'VALIDATION_ERROR',
      message: message,
      details: details,
    );
  }

  /// Create timeout error
  static SDKError timeout(String message) {
    return SDKError(
      code: 'TIMEOUT_ERROR',
      message: message,
    );
  }

  /// Create permission error
  static SDKError permission(String message, {int? statusCode}) {
    return SDKError(
      code: 'PERMISSION_ERROR',
      message: message,
      statusCode: statusCode,
    );
  }

  /// Create server error
  static SDKError server(String message, {int? statusCode}) {
    return SDKError(
      code: 'SERVER_ERROR',
      message: message,
      statusCode: statusCode,
    );
  }

  /// Create offline error
  static SDKError offline(String message) {
    return SDKError(
      code: 'OFFLINE_ERROR',
      message: message,
    );
  }

  /// Create unknown error
  static SDKError unknown(String message, {dynamic originalError}) {
    return SDKError(
      code: 'UNKNOWN_ERROR',
      message: message,
      details: originalError != null ? {'originalError': originalError.toString()} : null,
    );
  }
}

/// Error codes used throughout the SDK
class ErrorCodes {
  static const String networkError = 'NETWORK_ERROR';
  static const String authError = 'AUTH_ERROR';
  static const String validationError = 'VALIDATION_ERROR';
  static const String timeoutError = 'TIMEOUT_ERROR';
  static const String permissionError = 'PERMISSION_ERROR';
  static const String serverError = 'SERVER_ERROR';
  static const String offlineError = 'OFFLINE_ERROR';
  static const String unknownError = 'UNKNOWN_ERROR';
}