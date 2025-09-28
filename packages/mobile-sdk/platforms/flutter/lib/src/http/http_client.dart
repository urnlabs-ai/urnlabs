import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:dio_certificate_pinning/dio_certificate_pinning.dart';

import '../core/sdk_config.dart';
import '../core/sdk_error.dart';
import '../storage/storage_adapter.dart';

class HttpClient {
  final SDKConfig config;
  final StorageAdapter storage;
  late final Dio _dio;

  HttpClient(this.config, this.storage) {
    _setupDio();
  }

  void _setupDio() {
    _dio = Dio(BaseOptions(
      baseUrl: config.baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      sendTimeout: const Duration(seconds: 30),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'UrnlabsSDK/1.0.0 Flutter',
      },
    ));

    // Add certificate pinning if configured
    if (config.certificatePinning?.isNotEmpty == true) {
      _dio.interceptors.add(
        CertificatePinningInterceptor(
          allowedSHAFingerprints: config.certificatePinning!,
        ),
      );
    }

    // Add authentication interceptor
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Add auth token if available
          final token = await storage.getString('auth_token');
          if (token != null) {
            options.headers['Authorization'] = 'Bearer $token';
          }

          // Add API key if configured
          if (config.apiKey != null) {
            options.headers['X-API-Key'] = config.apiKey;
          }

          handler.next(options);
        },
        onError: (error, handler) async {
          // Handle 401 unauthorized
          if (error.response?.statusCode == 401) {
            await storage.remove('auth_token');
            await storage.remove('refresh_token');
            // Emit authentication expired event through storage or another mechanism
          }

          handler.next(error);
        },
      ),
    );

    // Add logging interceptor
    if (config.enableLogging) {
      _dio.interceptors.add(
        LogInterceptor(
          requestBody: true,
          responseBody: true,
          requestHeader: true,
          responseHeader: false,
          error: true,
          logPrint: (object) {
            if (config.logLevel == LogLevel.debug) {
              print('[HTTP] $object');
            }
          },
        ),
      );
    }
  }

  /// GET request
  Future<T> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.get(
        path,
        queryParameters: queryParameters,
        options: options,
      );
      return _handleResponse<T>(response, fromJson);
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// POST request
  Future<T> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.post(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
      return _handleResponse<T>(response, fromJson);
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// PUT request
  Future<T> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.put(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
      return _handleResponse<T>(response, fromJson);
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// DELETE request
  Future<T> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    T Function(dynamic)? fromJson,
  }) async {
    try {
      final response = await _dio.delete(
        path,
        data: data,
        queryParameters: queryParameters,
        options: options,
      );
      return _handleResponse<T>(response, fromJson);
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// Upload file
  Future<T> uploadFile<T>(
    String path,
    File file, {
    String? filename,
    Map<String, dynamic>? data,
    T Function(dynamic)? fromJson,
    ProgressCallback? onProgress,
  }) async {
    try {
      final formData = FormData();
      
      if (data != null) {
        formData.fields.addAll(
          data.entries.map((e) => MapEntry(e.key, e.value.toString())),
        );
      }

      formData.files.add(
        MapEntry(
          'file',
          await MultipartFile.fromFile(
            file.path,
            filename: filename ?? file.path.split('/').last,
          ),
        ),
      );

      final response = await _dio.post(
        path,
        data: formData,
        onSendProgress: onProgress,
      );

      return _handleResponse<T>(response, fromJson);
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  /// Download file
  Future<void> downloadFile(
    String url,
    String savePath, {
    ProgressCallback? onProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      await _dio.download(
        url,
        savePath,
        onReceiveProgress: onProgress,
        cancelToken: cancelToken,
      );
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  T _handleResponse<T>(Response response, T Function(dynamic)? fromJson) {
    if (response.statusCode! >= 200 && response.statusCode! < 300) {
      if (fromJson != null) {
        return fromJson(response.data);
      }
      return response.data as T;
    } else {
      throw SDKError.httpError(
        'HTTP ${response.statusCode}',
        statusCode: response.statusCode!,
        response: response.data,
      );
    }
  }

  SDKError _handleDioError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return SDKError.timeout('Request timeout');

      case DioExceptionType.badResponse:
        final statusCode = e.response?.statusCode ?? 0;
        final message = e.response?.data?['message'] ?? 
                       e.response?.statusMessage ?? 
                       'HTTP $statusCode';
        
        if (statusCode == 401) {
          return SDKError.unauthorized(message);
        } else if (statusCode == 403) {
          return SDKError.forbidden(message);
        } else if (statusCode == 404) {
          return SDKError.notFound(message);
        } else if (statusCode >= 500) {
          return SDKError.serverError(message);
        } else {
          return SDKError.httpError(message, statusCode: statusCode, response: e.response?.data);
        }

      case DioExceptionType.connectionError:
        return SDKError.networkError('Connection failed: ${e.message}');

      case DioExceptionType.cancel:
        return SDKError.cancelled('Request was cancelled');

      case DioExceptionType.badCertificate:
        return SDKError.networkError('SSL certificate error');

      case DioExceptionType.unknown:
      default:
        return SDKError.unknown('Network error: ${e.message}', originalError: e);
    }
  }

  /// Create cancel token for request cancellation
  CancelToken createCancelToken() => CancelToken();

  /// Close HTTP client
  void close() {
    _dio.close();
  }
}