import SwiftUI
import UrnlabsSDK
import Combine

struct ContentView: View {
    @StateObject private var appState = AppState()
    
    var body: some View {
        NavigationView {
            Group {
                if !appState.isInitialized {
                    InitializingView()
                } else if appState.isAuthenticated {
                    AuthenticatedView()
                } else {
                    LoginView()
                }
            }
            .environmentObject(appState)
            .navigationTitle("Urnlabs SDK")
        }
        .onAppear {
            Task {
                await appState.initializeSDK()
            }
        }
        .alert("Error", isPresented: .constant(appState.errorMessage != nil)) {
            Button("OK") {
                appState.clearError()
            }
        } message: {
            if let errorMessage = appState.errorMessage {
                Text(errorMessage)
            }
        }
    }
}

struct InitializingView: View {
    var body: some View {
        VStack(spacing: 20) {
            ProgressView()
                .scaleEffect(1.5)
            
            Text("Initializing SDK...")
                .font(.headline)
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var appState: AppState
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    
    var body: some View {
        VStack(spacing: 20) {
            VStack(spacing: 8) {
                Text("Welcome to Urnlabs")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Sign in to continue")
                    .foregroundColor(.secondary)
            }
            .padding(.bottom, 30)
            
            VStack(spacing: 16) {
                TextField("Email", text: $email)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)
                    .keyboardType(.emailAddress)
                
                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            
            Button(action: signIn) {
                HStack {
                    if isLoading {
                        ProgressView()
                            .scaleEffect(0.8)
                    }
                    Text("Sign In")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
            }
            .disabled(isLoading || email.isEmpty || password.isEmpty)
            
            Spacer()
        }
        .padding()
    }
    
    private func signIn() {
        isLoading = true
        
        Task {
            await appState.signIn(email: email, password: password)
            await MainActor.run {
                isLoading = false
            }
        }
    }
}

struct AuthenticatedView: View {
    @EnvironmentObject private var appState: AppState
    
    let features = [
        Feature(title: "Workflows", icon: "gear", description: "Manage AI workflows"),
        Feature(title: "Agents", icon: "brain", description: "Chat with AI agents"),
        Feature(title: "Files", icon: "folder", description: "Upload and manage files"),
        Feature(title: "Settings", icon: "gearshape", description: "App settings")
    ]
    
    var body: some View {
        VStack(spacing: 20) {
            // Welcome Card
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Welcome back!")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        if let user = appState.currentUser {
                            Text(user)
                                .foregroundColor(.secondary)
                        }
                    }
                    
                    Spacer()
                    
                    Button("Sign Out") {
                        Task {
                            await appState.signOut()
                        }
                    }
                    .foregroundColor(.red)
                }
            }
            .padding()
            .background(Color(UIColor.systemBackground))
            .cornerRadius(12)
            .shadow(radius: 2)
            
            // Features Grid
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: 16) {
                ForEach(features) { feature in
                    FeatureCard(feature: feature) {
                        // Handle feature tap
                        print("Tapped \(feature.title)")
                    }
                }
            }
            
            Spacer()
            
            // SDK Info
            VStack(spacing: 4) {
                Text("SDK Status")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                HStack {
                    Circle()
                        .fill(appState.isOnline ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    
                    Text(appState.isOnline ? "Online" : "Offline")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding()
    }
}

struct FeatureCard: View {
    let feature: Feature
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                Image(systemName: feature.icon)
                    .font(.title)
                    .foregroundColor(.blue)
                
                VStack(spacing: 4) {
                    Text(feature.title)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text(feature.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .padding()
            .background(Color(UIColor.systemBackground))
            .cornerRadius(12)
            .shadow(radius: 2)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Models

struct Feature: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let description: String
}

// MARK: - App State

@MainActor
class AppState: ObservableObject {
    @Published var isInitialized = false
    @Published var isAuthenticated = false
    @Published var isOnline = true
    @Published var currentUser: String?
    @Published var errorMessage: String?
    
    private var cancellables = Set<AnyCancellable>()
    
    func initializeSDK() async {
        do {
            let config = SDKConfig.development()
            try await UrnlabsSDK.shared.initialize(config: config)
            
            // Subscribe to SDK events
            UrnlabsSDK.shared.events
                .sink { [weak self] event in
                    Task { @MainActor in
                        self?.handleSDKEvent(event)
                    }
                }
                .store(in: &cancellables)
            
            isInitialized = true
        } catch {
            errorMessage = "Failed to initialize SDK: \(error.localizedDescription)"
        }
    }
    
    func signIn(email: String, password: String) async {
        guard let authService = UrnlabsSDK.shared.authService else {
            errorMessage = "Authentication service not available"
            return
        }
        
        do {
            // This would be implemented in the actual auth service
            // For now, simulate successful login
            isAuthenticated = true
            currentUser = email
        } catch {
            errorMessage = "Sign in failed: \(error.localizedDescription)"
        }
    }
    
    func signOut() async {
        guard let authService = UrnlabsSDK.shared.authService else {
            return
        }
        
        do {
            // This would be implemented in the actual auth service
            isAuthenticated = false
            currentUser = nil
        } catch {
            errorMessage = "Sign out failed: \(error.localizedDescription)"
        }
    }
    
    func clearError() {
        errorMessage = nil
    }
    
    private func handleSDKEvent(_ event: SDKEvent) {
        switch event {
        case .networkOnline:
            isOnline = true
        case .networkOffline:
            isOnline = false
        case .authStateChanged(let state):
            // Handle auth state changes
            break
        case .sdkError(let error):
            errorMessage = error.localizedDescription
        default:
            break
        }
    }
}

#Preview {
    ContentView()
}