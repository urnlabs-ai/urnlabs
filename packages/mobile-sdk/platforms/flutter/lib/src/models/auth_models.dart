/// Authentication models for Flutter SDK
import 'package:json_annotation/json_annotation.dart';

part 'auth_models.g.dart';

/// User model
@JsonSerializable()
class User {
  final String id;
  final String email;
  final String? firstName;
  final String? lastName;
  final String? avatar;
  final bool isEmailVerified;
  final bool isMfaEnabled;
  final List<String> roles;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final DateTime updatedAt;

  User({
    required this.id,
    required this.email,
    this.firstName,
    this.lastName,
    this.avatar,
    required this.isEmailVerified,
    required this.isMfaEnabled,
    required this.roles,
    this.metadata,
    required this.createdAt,
    required this.updatedAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);

  String get displayName => 
      '${firstName ?? ''} ${lastName ?? ''}'.trim().isEmpty 
          ? email 
          : '${firstName ?? ''} ${lastName ?? ''}'.trim();
}

/// Authentication result
@JsonSerializable()
class AuthResult {
  final User? user;
  final String? token;
  final String? refreshToken;
  final bool requiresMfa;
  final String? mfaToken;
  final int? expiresIn;

  AuthResult({
    this.user,
    this.token,
    this.refreshToken,
    required this.requiresMfa,
    this.mfaToken,
    this.expiresIn,
  });

  factory AuthResult.fromJson(Map<String, dynamic> json) => _$AuthResultFromJson(json);
  Map<String, dynamic> toJson() => _$AuthResultToJson(this);
}

/// Authentication state
enum AuthStateType {
  @JsonValue('unauthenticated')
  unauthenticated,
  @JsonValue('authenticated')
  authenticated,
  @JsonValue('mfa_required')
  mfaRequired,
  @JsonValue('loading')
  loading,
}

class AuthState {
  final AuthStateType type;
  final User? user;
  final String? token;
  final String? refreshToken;
  final String? mfaToken;
  final String? error;

  const AuthState._({
    required this.type,
    this.user,
    this.token,
    this.refreshToken,
    this.mfaToken,
    this.error,
  });

  const AuthState.unauthenticated({String? error})
      : this._(type: AuthStateType.unauthenticated, error: error);

  const AuthState.authenticated({
    required User user,
    required String token,
    String? refreshToken,
  }) : this._(
          type: AuthStateType.authenticated,
          user: user,
          token: token,
          refreshToken: refreshToken,
        );

  const AuthState.mfaRequired({String? mfaToken})
      : this._(type: AuthStateType.mfaRequired, mfaToken: mfaToken);

  const AuthState.loading()
      : this._(type: AuthStateType.loading);

  bool get isAuthenticated => type == AuthStateType.authenticated;
  bool get requiresMfa => type == AuthStateType.mfaRequired;
  bool get isLoading => type == AuthStateType.loading;

  AuthState copyWith({
    AuthStateType? type,
    User? user,
    String? token,
    String? refreshToken,
    String? mfaToken,
    String? error,
  }) {
    return AuthState._(
      type: type ?? this.type,
      user: user ?? this.user,
      token: token ?? this.token,
      refreshToken: refreshToken ?? this.refreshToken,
      mfaToken: mfaToken ?? this.mfaToken,
      error: error ?? this.error,
    );
  }
}

/// MFA setup result
@JsonSerializable()
class MfaSetupResult {
  final String qrCode;
  final String secret;
  final List<String> backupCodes;

  MfaSetupResult({
    required this.qrCode,
    required this.secret,
    required this.backupCodes,
  });

  factory MfaSetupResult.fromJson(Map<String, dynamic> json) => _$MfaSetupResultFromJson(json);
  Map<String, dynamic> toJson() => _$MfaSetupResultToJson(this);
}

/// User credentials for sign in
@JsonSerializable()
class UserCredentials {
  final String email;
  final String password;

  UserCredentials({
    required this.email,
    required this.password,
  });

  factory UserCredentials.fromJson(Map<String, dynamic> json) => _$UserCredentialsFromJson(json);
  Map<String, dynamic> toJson() => _$UserCredentialsToJson(this);
}

/// User registration data
@JsonSerializable()
class UserRegistration {
  final String email;
  final String password;
  final String? firstName;
  final String? lastName;
  final Map<String, dynamic>? metadata;

  UserRegistration({
    required this.email,
    required this.password,
    this.firstName,
    this.lastName,
    this.metadata,
  });

  factory UserRegistration.fromJson(Map<String, dynamic> json) => _$UserRegistrationFromJson(json);
  Map<String, dynamic> toJson() => _$UserRegistrationToJson(this);
}

/// OAuth provider
enum OAuthProvider {
  @JsonValue('google')
  google,
  @JsonValue('github')
  github,
  @JsonValue('microsoft')
  microsoft,
  @JsonValue('apple')
  apple,
}

/// Session information
@JsonSerializable()
class SessionInfo {
  final String id;
  final String userAgent;
  final String ipAddress;
  final DateTime createdAt;
  final DateTime lastActiveAt;
  final bool isCurrent;

  SessionInfo({
    required this.id,
    required this.userAgent,
    required this.ipAddress,
    required this.createdAt,
    required this.lastActiveAt,
    required this.isCurrent,
  });

  factory SessionInfo.fromJson(Map<String, dynamic> json) => _$SessionInfoFromJson(json);
  Map<String, dynamic> toJson() => _$SessionInfoToJson(this);
}