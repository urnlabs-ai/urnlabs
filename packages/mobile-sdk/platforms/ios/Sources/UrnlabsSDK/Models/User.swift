import Foundation

/// Represents a user in the Urnlabs platform
public struct User: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let email: String
    public let fullName: String
    public let avatar: String?
    public let role: UserRole
    public let permissions: [Permission]
    public let preferences: UserPreferences
    public let subscription: Subscription?
    public let createdAt: Date
    public let updatedAt: Date
    public let lastLoginAt: Date?
    public let isActive: Bool
    public let isEmailVerified: Bool
    public let mfaEnabled: Bool

    public init(
        id: String,
        email: String,
        fullName: String,
        avatar: String? = nil,
        role: UserRole,
        permissions: [Permission] = [],
        preferences: UserPreferences = UserPreferences(),
        subscription: Subscription? = nil,
        createdAt: Date,
        updatedAt: Date,
        lastLoginAt: Date? = nil,
        isActive: Bool = true,
        isEmailVerified: Bool = false,
        mfaEnabled: Bool = false
    ) {
        self.id = id
        self.email = email
        self.fullName = fullName
        self.avatar = avatar
        self.role = role
        self.permissions = permissions
        self.preferences = preferences
        self.subscription = subscription
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastLoginAt = lastLoginAt
        self.isActive = isActive
        self.isEmailVerified = isEmailVerified
        self.mfaEnabled = mfaEnabled
    }

    // MARK: - Computed Properties

    /// User's display name (full name or email)
    public var displayName: String {
        return fullName.isEmpty ? email : fullName
    }

    /// User's initials for avatar fallback
    public var initials: String {
        let components = fullName.components(separatedBy: " ")
        let initials = components.compactMap { $0.first }.map { String($0) }
        return initials.prefix(2).joined().uppercased()
    }

    /// Check if user has specific permission
    public func hasPermission(_ permission: Permission) -> Bool {
        return permissions.contains(permission) || role.defaultPermissions.contains(permission)
    }

    /// Check if user has any of the specified permissions
    public func hasAnyPermission(_ permissions: [Permission]) -> Bool {
        return permissions.contains { hasPermission($0) }
    }

    /// Check if user has all specified permissions
    public func hasAllPermissions(_ permissions: [Permission]) -> Bool {
        return permissions.allSatisfy { hasPermission($0) }
    }
}

/// User role with associated permissions
public enum UserRole: String, Codable, CaseIterable {
    case admin = "admin"
    case manager = "manager"
    case developer = "developer"
    case viewer = "viewer"

    /// Default permissions for each role
    public var defaultPermissions: [Permission] {
        switch self {
        case .admin:
            return Permission.allCases
        case .manager:
            return [.readWorkflows, .writeWorkflows, .executeWorkflows, .readAgents, .writeAgents, .readFiles, .writeFiles, .readUsers]
        case .developer:
            return [.readWorkflows, .writeWorkflows, .executeWorkflows, .readAgents, .readFiles, .writeFiles]
        case .viewer:
            return [.readWorkflows, .readAgents, .readFiles]
        }
    }

    /// Display name for the role
    public var displayName: String {
        switch self {
        case .admin:
            return "Administrator"
        case .manager:
            return "Manager"
        case .developer:
            return "Developer"
        case .viewer:
            return "Viewer"
        }
    }

    /// Description of the role
    public var description: String {
        switch self {
        case .admin:
            return "Full system access and user management"
        case .manager:
            return "Manage workflows, agents, and team members"
        case .developer:
            return "Create and execute workflows and agents"
        case .viewer:
            return "Read-only access to workflows and results"
        }
    }
}

/// System permissions
public enum Permission: String, Codable, CaseIterable {
    // Workflow permissions
    case readWorkflows = "read:workflows"
    case writeWorkflows = "write:workflows"
    case executeWorkflows = "execute:workflows"
    case deleteWorkflows = "delete:workflows"

    // Agent permissions
    case readAgents = "read:agents"
    case writeAgents = "write:agents"
    case executeAgents = "execute:agents"
    case deleteAgents = "delete:agents"

    // File permissions
    case readFiles = "read:files"
    case writeFiles = "write:files"
    case deleteFiles = "delete:files"
    case shareFiles = "share:files"

    // User permissions
    case readUsers = "read:users"
    case writeUsers = "write:users"
    case deleteUsers = "delete:users"

    // System permissions
    case adminAccess = "admin:access"
    case viewAnalytics = "view:analytics"
    case manageBilling = "manage:billing"

    /// Display name for the permission
    public var displayName: String {
        switch self {
        case .readWorkflows:
            return "View Workflows"
        case .writeWorkflows:
            return "Create/Edit Workflows"
        case .executeWorkflows:
            return "Execute Workflows"
        case .deleteWorkflows:
            return "Delete Workflows"
        case .readAgents:
            return "View Agents"
        case .writeAgents:
            return "Create/Edit Agents"
        case .executeAgents:
            return "Execute Agents"
        case .deleteAgents:
            return "Delete Agents"
        case .readFiles:
            return "View Files"
        case .writeFiles:
            return "Upload/Edit Files"
        case .deleteFiles:
            return "Delete Files"
        case .shareFiles:
            return "Share Files"
        case .readUsers:
            return "View Users"
        case .writeUsers:
            return "Create/Edit Users"
        case .deleteUsers:
            return "Delete Users"
        case .adminAccess:
            return "Administrator Access"
        case .viewAnalytics:
            return "View Analytics"
        case .manageBilling:
            return "Manage Billing"
        }
    }
}

/// User preferences and settings
public struct UserPreferences: Codable, Equatable, Hashable {
    public let theme: Theme
    public let language: String
    public let timezone: String
    public let dateFormat: DateFormat
    public let notifications: NotificationSettings
    public let privacy: PrivacySettings

    public init(
        theme: Theme = .system,
        language: String = "en",
        timezone: String = TimeZone.current.identifier,
        dateFormat: DateFormat = .iso8601,
        notifications: NotificationSettings = NotificationSettings(),
        privacy: PrivacySettings = PrivacySettings()
    ) {
        self.theme = theme
        self.language = language
        self.timezone = timezone
        self.dateFormat = dateFormat
        self.notifications = notifications
        self.privacy = privacy
    }
}

/// UI theme preference
public enum Theme: String, Codable, CaseIterable {
    case light = "light"
    case dark = "dark"
    case system = "system"

    public var displayName: String {
        switch self {
        case .light:
            return "Light"
        case .dark:
            return "Dark"
        case .system:
            return "System"
        }
    }
}

/// Date format preference
public enum DateFormat: String, Codable, CaseIterable {
    case iso8601 = "iso8601"
    case usFormat = "us"
    case europeanFormat = "eu"
    case customFormat = "custom"

    public var displayName: String {
        switch self {
        case .iso8601:
            return "ISO 8601 (2024-01-01)"
        case .usFormat:
            return "US Format (01/01/2024)"
        case .europeanFormat:
            return "European Format (01.01.2024)"
        case .customFormat:
            return "Custom Format"
        }
    }
}

/// Notification settings
public struct NotificationSettings: Codable, Equatable, Hashable {
    public let email: Bool
    public let push: Bool
    public let sms: Bool
    public let workflowCompleted: Bool
    public let agentMessages: Bool
    public let systemUpdates: Bool
    public let securityAlerts: Bool

    public init(
        email: Bool = true,
        push: Bool = true,
        sms: Bool = false,
        workflowCompleted: Bool = true,
        agentMessages: Bool = true,
        systemUpdates: Bool = true,
        securityAlerts: Bool = true
    ) {
        self.email = email
        self.push = push
        self.sms = sms
        self.workflowCompleted = workflowCompleted
        self.agentMessages = agentMessages
        self.systemUpdates = systemUpdates
        self.securityAlerts = securityAlerts
    }
}

/// Privacy settings
public struct PrivacySettings: Codable, Equatable, Hashable {
    public let profileVisibility: ProfileVisibility
    public let activityTracking: Bool
    public let analyticsOptIn: Bool
    public let dataRetention: DataRetentionPeriod

    public init(
        profileVisibility: ProfileVisibility = .team,
        activityTracking: Bool = true,
        analyticsOptIn: Bool = true,
        dataRetention: DataRetentionPeriod = .oneYear
    ) {
        self.profileVisibility = profileVisibility
        self.activityTracking = activityTracking
        self.analyticsOptIn = analyticsOptIn
        self.dataRetention = dataRetention
    }
}

/// Profile visibility options
public enum ProfileVisibility: String, Codable, CaseIterable {
    case `private` = "private"
    case team = "team"
    case organization = "organization"
    case `public` = "public"

    public var displayName: String {
        switch self {
        case .private:
            return "Private"
        case .team:
            return "Team Members"
        case .organization:
            return "Organization"
        case .public:
            return "Public"
        }
    }
}

/// Data retention period options
public enum DataRetentionPeriod: String, Codable, CaseIterable {
    case thirtyDays = "30d"
    case ninetyDays = "90d"
    case oneYear = "1y"
    case forever = "forever"

    public var displayName: String {
        switch self {
        case .thirtyDays:
            return "30 Days"
        case .ninetyDays:
            return "90 Days"
        case .oneYear:
            return "1 Year"
        case .forever:
            return "Forever"
        }
    }
}

/// User subscription information
public struct Subscription: Codable, Equatable, Hashable {
    public let id: String
    public let plan: SubscriptionPlan
    public let status: SubscriptionStatus
    public let currentPeriodStart: Date
    public let currentPeriodEnd: Date
    public let cancelAtPeriodEnd: Bool
    public let trialEnd: Date?

    public init(
        id: String,
        plan: SubscriptionPlan,
        status: SubscriptionStatus,
        currentPeriodStart: Date,
        currentPeriodEnd: Date,
        cancelAtPeriodEnd: Bool = false,
        trialEnd: Date? = nil
    ) {
        self.id = id
        self.plan = plan
        self.status = status
        self.currentPeriodStart = currentPeriodStart
        self.currentPeriodEnd = currentPeriodEnd
        self.cancelAtPeriodEnd = cancelAtPeriodEnd
        self.trialEnd = trialEnd
    }

    /// Check if subscription is active
    public var isActive: Bool {
        return status == .active && currentPeriodEnd > Date()
    }

    /// Check if subscription is in trial
    public var isTrial: Bool {
        guard let trialEnd = trialEnd else { return false }
        return trialEnd > Date()
    }

    /// Days remaining in current period
    public var daysRemaining: Int {
        let calendar = Calendar.current
        return calendar.dateComponents([.day], from: Date(), to: currentPeriodEnd).day ?? 0
    }
}

/// Subscription plan types
public enum SubscriptionPlan: String, Codable, CaseIterable {
    case free = "free"
    case starter = "starter"
    case professional = "professional"
    case enterprise = "enterprise"

    public var displayName: String {
        switch self {
        case .free:
            return "Free"
        case .starter:
            return "Starter"
        case .professional:
            return "Professional"
        case .enterprise:
            return "Enterprise"
        }
    }

    /// Monthly price in USD cents
    public var monthlyPrice: Int {
        switch self {
        case .free:
            return 0
        case .starter:
            return 2900 // $29.00
        case .professional:
            return 9900 // $99.00
        case .enterprise:
            return 29900 // $299.00
        }
    }
}

/// Subscription status
public enum SubscriptionStatus: String, Codable, CaseIterable {
    case active = "active"
    case pastDue = "past_due"
    case canceled = "canceled"
    case unpaid = "unpaid"
    case incomplete = "incomplete"
    case incompleteExpired = "incomplete_expired"
    case trialing = "trialing"

    public var displayName: String {
        switch self {
        case .active:
            return "Active"
        case .pastDue:
            return "Past Due"
        case .canceled:
            return "Canceled"
        case .unpaid:
            return "Unpaid"
        case .incomplete:
            return "Incomplete"
        case .incompleteExpired:
            return "Incomplete (Expired)"
        case .trialing:
            return "Trial"
        }
    }

    /// Whether the subscription allows access
    public var allowsAccess: Bool {
        switch self {
        case .active, .trialing:
            return true
        case .pastDue, .canceled, .unpaid, .incomplete, .incompleteExpired:
            return false
        }
    }
}