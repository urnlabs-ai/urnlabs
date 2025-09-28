import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';

import '../core/sdk_error.dart';
import '../http/http_client.dart';
import '../models/auth_models.dart';
import '../storage/storage_adapter.dart';

class AuthService {
  final HttpClient httpClient;
  final StorageAdapter storage;

  final StreamController<AuthState> _authStateController = 
      StreamController<AuthState>.broadcast();

  AuthState _currentState = const AuthState.unauthenticated();

  AuthService(this.httpClient, this.storage);

  /// Stream of authentication state changes
  Stream<AuthState> get authState => _authStateController.stream;

  /// Current authentication state
  AuthState get currentState => _currentState;

  /// Check if user is authenticated
  bool get isAuthenticated => _currentState.isAuthenticated;

  /// Current user if authenticated
  User? get currentUser => _currentState.user;

  /// Restore authentication state from storage
  Future<void> restoreAuthState() async {
    try {
      final token = await storage.getString('auth_token');
      final refreshToken = await storage.getString('refresh_token');
      final userJson = await storage.getJson('current_user');

      if (token != null && userJson != null) {
        final user = User.fromJson(userJson);
        _updateState(AuthState.authenticated(
          user: user,
          token: token,
          refreshToken: refreshToken,
        ));

        // Verify token is still valid
        await _verifyToken();
      }
    } catch (e) {
      await _clearAuthData();
    }
  }

  /// Sign in with email and password
  Future<AuthResult> signIn(String email, String password) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/auth/signin',
        data: {
          'email': email,
          'password': password,
        },
      );

      return await _handleAuthResponse(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Sign in failed', originalError: e);
    }
  }

  /// Sign up with email and password
  Future<AuthResult> signUp(String email, String password, {
    String? firstName,
    String? lastName,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/auth/signup',
        data: {
          'email': email,
          'password': password,
          if (firstName != null) 'firstName': firstName,
          if (lastName != null) 'lastName': lastName,
          if (metadata != null) 'metadata': metadata,
        },
      );

      return await _handleAuthResponse(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Sign up failed', originalError: e);
    }
  }

  /// Sign in with OAuth provider
  Future<AuthResult> signInWithOAuth(String provider, String code) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/auth/oauth/$provider',
        data: {
          'code': code,
        },
      );

      return await _handleAuthResponse(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('OAuth sign in failed', originalError: e);
    }
  }

  /// Refresh authentication token
  Future<void> refreshToken() async {
    final refreshToken = await storage.getString('refresh_token');
    if (refreshToken == null) {
      throw SDKError.unauthorized('No refresh token available');
    }

    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {
          'refreshToken': refreshToken,
        },
      );

      await _handleAuthResponse(response);
    } on SDKError catch (e) {
      if (e.code == 'UNAUTHORIZED') {
        await signOut();
      }
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Token refresh failed', originalError: e);
    }
  }

  /// Sign out
  Future<void> signOut() async {
    try {
      final token = await storage.getString('auth_token');
      if (token != null) {
        // Attempt to revoke token on server
        try {
          await httpClient.post('/auth/signout');
        } catch (e) {
          // Continue with local sign out even if server call fails
        }
      }
    } finally {
      await _clearAuthData();
    }
  }

  /// Verify current token is valid
  Future<bool> _verifyToken() async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>('/auth/verify');
      
      if (response['valid'] == true) {
        return true;
      } else {
        await _clearAuthData();
        return false;
      }
    } catch (e) {
      await _clearAuthData();
      return false;
    }
  }

  /// Request password reset
  Future<void> requestPasswordReset(String email) async {
    try {
      await httpClient.post(
        '/auth/password/reset-request',
        data: {'email': email},
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Password reset request failed', originalError: e);
    }
  }

  /// Reset password with token
  Future<void> resetPassword(String token, String newPassword) async {
    try {
      await httpClient.post(
        '/auth/password/reset',
        data: {
          'token': token,
          'password': newPassword,
        },
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Password reset failed', originalError: e);
    }
  }

  /// Change password
  Future<void> changePassword(String currentPassword, String newPassword) async {
    try {
      await httpClient.post(
        '/auth/password/change',
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Password change failed', originalError: e);
    }
  }

  /// Enable MFA
  Future<MfaSetupResult> enableMfa() async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>('/auth/mfa/enable');
      
      return MfaSetupResult.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('MFA setup failed', originalError: e);
    }
  }

  /// Verify MFA setup
  Future<List<String>> verifyMfaSetup(String totpCode) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/auth/mfa/verify-setup',
        data: {'code': totpCode},
      );

      return List<String>.from(response['backupCodes'] ?? []);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('MFA verification failed', originalError: e);
    }
  }

  /// Disable MFA
  Future<void> disableMfa(String totpCode) async {
    try {
      await httpClient.post(
        '/auth/mfa/disable',
        data: {'code': totpCode},
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('MFA disable failed', originalError: e);
    }
  }

  /// Verify MFA code during login
  Future<AuthResult> verifyMfa(String code, {String? backupCode}) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/auth/mfa/verify',
        data: {
          if (code.isNotEmpty) 'code': code,
          if (backupCode != null) 'backupCode': backupCode,
        },
      );

      return await _handleAuthResponse(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('MFA verification failed', originalError: e);
    }
  }

  /// Update user profile
  Future<User> updateProfile({
    String? firstName,
    String? lastName,
    String? email,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (firstName != null) data['firstName'] = firstName;
      if (lastName != null) data['lastName'] = lastName;
      if (email != null) data['email'] = email;
      if (metadata != null) data['metadata'] = metadata;

      final response = await httpClient.put<Map<String, dynamic>>(
        '/auth/profile',
        data: data,
      );

      final user = User.fromJson(response);
      
      // Update stored user data
      await storage.setJson('current_user', user.toJson());
      
      // Update current state
      _updateState(_currentState.copyWith(user: user));

      return user;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Profile update failed', originalError: e);
    }
  }

  Future<AuthResult> _handleAuthResponse(Map<String, dynamic> response) async {
    final authResult = AuthResult.fromJson(response);

    if (authResult.requiresMfa) {
      _updateState(AuthState.mfaRequired());
      return authResult;
    }

    if (authResult.user != null && authResult.token != null) {
      // Store authentication data
      await storage.setString('auth_token', authResult.token!);
      if (authResult.refreshToken != null) {
        await storage.setString('refresh_token', authResult.refreshToken!);
      }
      await storage.setJson('current_user', authResult.user!.toJson());

      _updateState(AuthState.authenticated(
        user: authResult.user!,
        token: authResult.token!,
        refreshToken: authResult.refreshToken,
      ));
    }

    return authResult;
  }

  Future<void> _clearAuthData() async {
    await storage.remove('auth_token');
    await storage.remove('refresh_token');
    await storage.remove('current_user');
    
    _updateState(const AuthState.unauthenticated());
  }

  void _updateState(AuthState newState) {
    _currentState = newState;
    _authStateController.add(newState);
  }

  /// Generate PKCE challenge for OAuth flows
  Map<String, String> generatePkceChallenge() {
    final codeVerifier = _generateRandomString(128);
    final codeChallenge = base64Url
        .encode(sha256.convert(codeVerifier.codeUnits).bytes)
        .replaceAll('=', '');

    return {
      'codeVerifier': codeVerifier,
      'codeChallenge': codeChallenge,
      'codeChallengeMethod': 'S256',
    };
  }

  String _generateRandomString(int length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    return List.generate(length, (index) => chars[DateTime.now().microsecond % chars.length]).join();
  }

  /// Dispose resources
  void dispose() {
    _authStateController.close();
  }
}