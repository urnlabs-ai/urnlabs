import Foundation

/// Represents an AI agent in the Urnlabs platform
public struct Agent: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let description: String
    public let avatar: String?
    public let category: AgentCategory
    public let capabilities: [String]
    public let configuration: AgentConfiguration
    public let status: AgentStatus
    public let version: String
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date
    public let lastActiveAt: Date?
    public let conversationCount: Int
    public let totalMessages: Int
    public let averageResponseTime: TimeInterval?

    public init(
        id: String,
        name: String,
        description: String,
        avatar: String? = nil,
        category: AgentCategory,
        capabilities: [String] = [],
        configuration: AgentConfiguration,
        status: AgentStatus,
        version: String = "1.0.0",
        createdBy: String,
        createdAt: Date,
        updatedAt: Date,
        lastActiveAt: Date? = nil,
        conversationCount: Int = 0,
        totalMessages: Int = 0,
        averageResponseTime: TimeInterval? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.avatar = avatar
        self.category = category
        self.capabilities = capabilities
        self.configuration = configuration
        self.status = status
        self.version = version
        self.createdBy = createdBy
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastActiveAt = lastActiveAt
        self.conversationCount = conversationCount
        self.totalMessages = totalMessages
        self.averageResponseTime = averageResponseTime
    }

    /// Check if agent can handle a specific capability
    public func hasCapability(_ capability: String) -> Bool {
        return capabilities.contains(capability)
    }

    /// Check if agent is currently available
    public var isAvailable: Bool {
        return status == .available
    }

    /// Get agent initials for avatar fallback
    public var initials: String {
        let components = name.components(separatedBy: " ")
        let initials = components.compactMap { $0.first }.map { String($0) }
        return initials.prefix(2).joined().uppercased()
    }
}

/// Configuration for an AI agent
public struct AgentConfiguration: Codable, Equatable, Hashable {
    public let model: String
    public let temperature: Double
    public let maxTokens: Int
    public let systemPrompt: String
    public let tools: [AgentTool]
    public let constraints: AgentConstraints
    public let personality: AgentPersonality

    public init(
        model: String,
        temperature: Double = 0.7,
        maxTokens: Int = 4096,
        systemPrompt: String,
        tools: [AgentTool] = [],
        constraints: AgentConstraints = AgentConstraints(),
        personality: AgentPersonality = AgentPersonality()
    ) {
        self.model = model
        self.temperature = temperature
        self.maxTokens = maxTokens
        self.systemPrompt = systemPrompt
        self.tools = tools
        self.constraints = constraints
        self.personality = personality
    }
}

/// Tools available to an agent
public struct AgentTool: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let description: String
    public let parameters: [ToolParameter]
    public let enabled: Bool

    public init(
        id: String,
        name: String,
        description: String,
        parameters: [ToolParameter] = [],
        enabled: Bool = true
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.parameters = parameters
        self.enabled = enabled
    }
}

/// Parameter definition for agent tools
public struct ToolParameter: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let type: ParameterType
    public let description: String
    public let required: Bool
    public let defaultValue: String?
    public let options: [String]?

    public init(
        id: String,
        name: String,
        type: ParameterType,
        description: String,
        required: Bool = false,
        defaultValue: String? = nil,
        options: [String]? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.description = description
        self.required = required
        self.defaultValue = defaultValue
        self.options = options
    }
}

/// Types of tool parameters
public enum ParameterType: String, Codable, CaseIterable {
    case string = "string"
    case number = "number"
    case boolean = "boolean"
    case array = "array"
    case object = "object"
    case enum = "enum"

    public var displayName: String {
        switch self {
        case .string:
            return "Text"
        case .number:
            return "Number"
        case .boolean:
            return "True/False"
        case .array:
            return "List"
        case .object:
            return "Object"
        case .enum:
            return "Selection"
        }
    }
}

/// Constraints and limitations for agent behavior
public struct AgentConstraints: Codable, Equatable, Hashable {
    public let maxConversationLength: Int
    public let allowedDomains: [String]?
    public let blockedDomains: [String]?
    public let rateLimit: RateLimit
    public let contentFilters: [ContentFilter]

    public init(
        maxConversationLength: Int = 100,
        allowedDomains: [String]? = nil,
        blockedDomains: [String]? = nil,
        rateLimit: RateLimit = RateLimit(),
        contentFilters: [ContentFilter] = []
    ) {
        self.maxConversationLength = maxConversationLength
        self.allowedDomains = allowedDomains
        self.blockedDomains = blockedDomains
        self.rateLimit = rateLimit
        self.contentFilters = contentFilters
    }
}

/// Rate limiting configuration
public struct RateLimit: Codable, Equatable, Hashable {
    public let requestsPerMinute: Int
    public let requestsPerHour: Int
    public let requestsPerDay: Int

    public init(
        requestsPerMinute: Int = 10,
        requestsPerHour: Int = 100,
        requestsPerDay: Int = 1000
    ) {
        self.requestsPerMinute = requestsPerMinute
        self.requestsPerHour = requestsPerHour
        self.requestsPerDay = requestsPerDay
    }
}

/// Content filtering rules
public struct ContentFilter: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let type: ContentFilterType
    public let pattern: String
    public let action: FilterAction
    public let enabled: Bool

    public init(
        id: String,
        type: ContentFilterType,
        pattern: String,
        action: FilterAction,
        enabled: Bool = true
    ) {
        self.id = id
        self.type = type
        self.pattern = pattern
        self.action = action
        self.enabled = enabled
    }
}

/// Types of content filters
public enum ContentFilterType: String, Codable, CaseIterable {
    case profanity = "profanity"
    case personalInfo = "personal_info"
    case spam = "spam"
    case offensive = "offensive"
    case custom = "custom"

    public var displayName: String {
        switch self {
        case .profanity:
            return "Profanity"
        case .personalInfo:
            return "Personal Information"
        case .spam:
            return "Spam"
        case .offensive:
            return "Offensive Content"
        case .custom:
            return "Custom Filter"
        }
    }
}

/// Actions to take when content filter is triggered
public enum FilterAction: String, Codable, CaseIterable {
    case block = "block"
    case warn = "warn"
    case moderate = "moderate"
    case log = "log"

    public var displayName: String {
        switch self {
        case .block:
            return "Block"
        case .warn:
            return "Warn"
        case .moderate:
            return "Moderate"
        case .log:
            return "Log Only"
        }
    }
}

/// Personality traits for agent behavior
public struct AgentPersonality: Codable, Equatable, Hashable {
    public let tone: AgentTone
    public let verbosity: AgentVerbosity
    public let formality: AgentFormality
    public let empathy: Double // 0.0 to 1.0
    public let creativity: Double // 0.0 to 1.0
    public let humor: Double // 0.0 to 1.0

    public init(
        tone: AgentTone = .friendly,
        verbosity: AgentVerbosity = .balanced,
        formality: AgentFormality = .casual,
        empathy: Double = 0.7,
        creativity: Double = 0.5,
        humor: Double = 0.3
    ) {
        self.tone = tone
        self.verbosity = verbosity
        self.formality = formality
        self.empathy = max(0.0, min(1.0, empathy))
        self.creativity = max(0.0, min(1.0, creativity))
        self.humor = max(0.0, min(1.0, humor))
    }
}

/// Agent communication tone
public enum AgentTone: String, Codable, CaseIterable {
    case professional = "professional"
    case friendly = "friendly"
    case casual = "casual"
    case enthusiastic = "enthusiastic"
    case calm = "calm"
    case direct = "direct"

    public var displayName: String {
        switch self {
        case .professional:
            return "Professional"
        case .friendly:
            return "Friendly"
        case .casual:
            return "Casual"
        case .enthusiastic:
            return "Enthusiastic"
        case .calm:
            return "Calm"
        case .direct:
            return "Direct"
        }
    }
}

/// Agent response verbosity
public enum AgentVerbosity: String, Codable, CaseIterable {
    case concise = "concise"
    case balanced = "balanced"
    case detailed = "detailed"
    case verbose = "verbose"

    public var displayName: String {
        switch self {
        case .concise:
            return "Concise"
        case .balanced:
            return "Balanced"
        case .detailed:
            return "Detailed"
        case .verbose:
            return "Verbose"
        }
    }
}

/// Agent communication formality
public enum AgentFormality: String, Codable, CaseIterable {
    case formal = "formal"
    case semiformal = "semiformal"
    case casual = "casual"
    case informal = "informal"

    public var displayName: String {
        switch self {
        case .formal:
            return "Formal"
        case .semiformal:
            return "Semi-formal"
        case .casual:
            return "Casual"
        case .informal:
            return "Informal"
        }
    }
}

/// Conversation between user and agent
public struct Conversation: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let agentId: String
    public let agentName: String
    public let userId: String
    public let title: String?
    public var messages: [Message]
    public let context: ConversationContext?
    public let createdAt: Date
    public var updatedAt: Date
    public var isActive: Bool

    public init(
        id: String,
        agentId: String,
        agentName: String,
        userId: String,
        title: String? = nil,
        messages: [Message] = [],
        context: ConversationContext? = nil,
        createdAt: Date,
        updatedAt: Date,
        isActive: Bool = true
    ) {
        self.id = id
        self.agentId = agentId
        self.agentName = agentName
        self.userId = userId
        self.title = title
        self.messages = messages
        self.context = context
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.isActive = isActive
    }

    /// Get conversation title or generate from first message
    public var displayTitle: String {
        if let title = title, !title.isEmpty {
            return title
        }

        if let firstUserMessage = messages.first(where: { $0.role == .user })?.content {
            let trimmed = firstUserMessage.trimmingCharacters(in: .whitespacesAndNewlines)
            return String(trimmed.prefix(50)) + (trimmed.count > 50 ? "..." : "")
        }

        return "Conversation with \(agentName)"
    }

    /// Get last message in conversation
    public var lastMessage: Message? {
        return messages.last
    }

    /// Get number of messages from user
    public var userMessageCount: Int {
        return messages.filter { $0.role == .user }.count
    }

    /// Get number of messages from agent
    public var agentMessageCount: Int {
        return messages.filter { $0.role == .assistant }.count
    }
}

/// Context information for a conversation
public struct ConversationContext: Codable, Equatable, Hashable {
    public let workflowId: String?
    public let projectId: String?
    public let metadata: [String: String]?

    public init(
        workflowId: String? = nil,
        projectId: String? = nil,
        metadata: [String: String]? = nil
    ) {
        self.workflowId = workflowId
        self.projectId = projectId
        self.metadata = metadata
    }
}

/// Individual message in a conversation
public struct Message: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let conversationId: String
    public let role: MessageRole
    public let content: String
    public let attachments: [MessageAttachment]
    public let metadata: MessageMetadata?
    public let createdAt: Date
    public let isEdited: Bool

    public init(
        id: String,
        conversationId: String,
        role: MessageRole,
        content: String,
        attachments: [MessageAttachment] = [],
        metadata: MessageMetadata? = nil,
        createdAt: Date,
        isEdited: Bool = false
    ) {
        self.id = id
        self.conversationId = conversationId
        self.role = role
        self.content = content
        self.attachments = attachments
        self.metadata = metadata
        self.createdAt = createdAt
        self.isEdited = isEdited
    }

    /// Check if message has attachments
    public var hasAttachments: Bool {
        return !attachments.isEmpty
    }

    /// Get total size of attachments
    public var attachmentsTotalSize: Int {
        return attachments.reduce(0) { $0 + $1.size }
    }
}

/// Role of message sender
public enum MessageRole: String, Codable, CaseIterable {
    case user = "user"
    case assistant = "assistant"
    case system = "system"

    public var displayName: String {
        switch self {
        case .user:
            return "User"
        case .assistant:
            return "Assistant"
        case .system:
            return "System"
        }
    }
}

/// Attachment to a message
public struct MessageAttachment: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let type: String
    public let size: Int
    public let url: String?
    public let thumbnailUrl: String?

    public init(
        id: String,
        name: String,
        type: String,
        size: Int,
        url: String? = nil,
        thumbnailUrl: String? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.size = size
        self.url = url
        self.thumbnailUrl = thumbnailUrl
    }

    /// Check if attachment is an image
    public var isImage: Bool {
        return type.hasPrefix("image/")
    }

    /// Check if attachment is a document
    public var isDocument: Bool {
        return type.hasPrefix("application/") || type.hasPrefix("text/")
    }

    /// Get human-readable file size
    public var formattedSize: String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(size))
    }
}

/// Metadata for message processing
public struct MessageMetadata: Codable, Equatable, Hashable {
    public let processingTime: TimeInterval?
    public let tokenCount: Int?
    public let model: String?
    public let temperature: Double?
    public let toolsUsed: [String]?

    public init(
        processingTime: TimeInterval? = nil,
        tokenCount: Int? = nil,
        model: String? = nil,
        temperature: Double? = nil,
        toolsUsed: [String]? = nil
    ) {
        self.processingTime = processingTime
        self.tokenCount = tokenCount
        self.model = model
        self.temperature = temperature
        self.toolsUsed = toolsUsed
    }
}