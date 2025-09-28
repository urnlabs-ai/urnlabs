import Foundation
import Combine
import Network

/// Service responsible for handling authentication operations
public class AuthService: ObservableObject {
    // MARK: - Published Properties
    @Published public private(set) var isAuthenticated = false
    @Published public private(set) var currentUser: User?
    @Published public private(set) var isLoading = false

    // MARK: - Private Properties
    private let httpClient: HTTPClient
    private let storageAdapter: StorageAdapter
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(httpClient: HTTPClient, storageAdapter: StorageAdapter) {
        self.httpClient = httpClient
        self.storageAdapter = storageAdapter

        setupAuthStateMonitoring()
        loadStoredAuthState()
    }

    // MARK: - Public Methods

    /// Sign in with email and password
    public func signIn(email: String, password: String) async throws -> AuthResult {
        isLoading = true
        defer { isLoading = false }

        let request = SignInRequest(email: email, password: password)

        do {
            let response: AuthResponse = try await httpClient.post("/auth/signin", body: request)
            return try await handleAuthResponse(response)
        } catch {
            throw mapAuthError(error)
        }
    }

    /// Sign up with user details
    public func signUp(email: String, password: String, fullName: String) async throws -> AuthResult {
        isLoading = true
        defer { isLoading = false }

        let request = SignUpRequest(email: email, password: password, fullName: fullName)

        do {
            let response: AuthResponse = try await httpClient.post("/auth/signup", body: request)
            return try await handleAuthResponse(response)
        } catch {
            throw mapAuthError(error)
        }
    }

    /// Complete MFA verification
    public func verifyMFA(code: String, method: MFAMethod) async throws -> AuthResult {
        isLoading = true
        defer { isLoading = false }

        let request = MFAVerificationRequest(code: code, method: method)

        do {
            let response: AuthResponse = try await httpClient.post("/auth/mfa/verify", body: request)
            return try await handleAuthResponse(response)
        } catch {
            throw mapAuthError(error)
        }
    }

    /// Refresh authentication token
    public func refreshToken() async throws {
        guard let refreshToken = await storageAdapter.getSecureValue(for: "refresh_token") else {
            throw SDKError.tokenExpired
        }

        let request = RefreshTokenRequest(refreshToken: refreshToken)

        do {
            let response: AuthResponse = try await httpClient.post("/auth/refresh", body: request)
            try await storeAuthTokens(response.tokens)

            if let user = response.user {
                await storeUser(user)
                await MainActor.run {
                    self.currentUser = user
                    self.isAuthenticated = true
                }
            }
        } catch {
            await clearAuthState()
            throw mapAuthError(error)
        }
    }

    /// Sign out current user
    public func signOut() async throws {
        isLoading = true
        defer { isLoading = false }

        // Try to revoke token on server
        do {
            _ = try await httpClient.post("/auth/signout", body: EmptyRequest())
        } catch {
            // Continue with local signout even if server request fails
            print("Warning: Failed to revoke token on server: \(error)")
        }

        await clearAuthState()
    }

    /// Get current access token
    public func getAccessToken() async -> String? {
        return await storageAdapter.getSecureValue(for: "access_token")
    }

    /// Check if current token is valid
    public func isTokenValid() async -> Bool {
        guard let token = await getAccessToken() else { return false }

        // Check token expiration
        if let expiryString = await storageAdapter.getValue(for: "token_expiry"),
           let expiry = ISO8601DateFormatter().date(from: expiryString) {
            return expiry > Date()
        }

        return false
    }

    // MARK: - Private Methods

    private func setupAuthStateMonitoring() {
        // Monitor connectivity for token refresh
        // Implementation would depend on network monitoring setup
    }

    private func loadStoredAuthState() {
        Task {
            if let userData = await storageAdapter.getValue(for: "current_user"),
               let user = try? JSONDecoder().decode(User.self, from: userData.data(using: .utf8)!) {

                let tokenValid = await isTokenValid()

                await MainActor.run {
                    self.currentUser = user
                    self.isAuthenticated = tokenValid
                }

                // Try to refresh token if expired
                if !tokenValid {
                    try? await refreshToken()
                }
            }
        }
    }

    private func handleAuthResponse(_ response: AuthResponse) async throws -> AuthResult {
        // Store tokens securely
        try await storeAuthTokens(response.tokens)

        // Store user data
        if let user = response.user {
            await storeUser(user)
            await MainActor.run {
                self.currentUser = user
                self.isAuthenticated = true
            }
        }

        return AuthResult(
            user: response.user,
            requiresMFA: response.requiresMFA,
            mfaMethods: response.availableMFAMethods
        )
    }

    private func storeAuthTokens(_ tokens: AuthTokens) async throws {
        await storageAdapter.setSecureValue(tokens.accessToken, for: "access_token")
        await storageAdapter.setSecureValue(tokens.refreshToken, for: "refresh_token")

        // Store expiry time
        let expiryDate = Date().addingTimeInterval(TimeInterval(tokens.expiresIn))
        let expiryString = ISO8601DateFormatter().string(from: expiryDate)
        await storageAdapter.setValue(expiryString, for: "token_expiry")
    }

    private func storeUser(_ user: User) async {
        if let userData = try? JSONEncoder().encode(user),
           let userString = String(data: userData, encoding: .utf8) {
            await storageAdapter.setValue(userString, for: "current_user")
        }
    }

    private func clearAuthState() async {
        await storageAdapter.removeValue(for: "access_token")
        await storageAdapter.removeValue(for: "refresh_token")
        await storageAdapter.removeValue(for: "token_expiry")
        await storageAdapter.removeValue(for: "current_user")

        await MainActor.run {
            self.currentUser = nil
            self.isAuthenticated = false
        }
    }

    private func mapAuthError(_ error: Error) -> SDKError {
        if let httpError = error as? HTTPError {
            switch httpError.statusCode {
            case 401:
                return .unauthorized(httpError.message)
            case 403:
                return .forbidden
            case 404:
                return .userNotFound
            case 429:
                return .rateLimited
            default:
                return .authenticationFailed(httpError.message ?? "Authentication failed")
            }
        }

        if error is DecodingError {
            return .invalidResponse
        }

        return .networkError(error.localizedDescription)
    }
}

// MARK: - Request/Response Models

public struct SignInRequest: Codable {
    let email: String
    let password: String
}

public struct SignUpRequest: Codable {
    let email: String
    let password: String
    let fullName: String
}

public struct MFAVerificationRequest: Codable {
    let code: String
    let method: MFAMethod
}

public struct RefreshTokenRequest: Codable {
    let refreshToken: String
}

public struct EmptyRequest: Codable {}

public struct AuthResponse: Codable {
    let tokens: AuthTokens
    let user: User?
    let requiresMFA: Bool
    let availableMFAMethods: [MFAMethod]?
}

public struct AuthTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

public struct AuthResult {
    public let user: User?
    public let requiresMFA: Bool
    public let mfaMethods: [MFAMethod]?
}

public enum MFAMethod: String, Codable, CaseIterable {
    case sms = "sms"
    case email = "email"
    case authenticator = "authenticator"
    case backup = "backup"
}