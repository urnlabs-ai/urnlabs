import Foundation

/// Represents a workflow in the Urnlabs platform
public struct Workflow: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let description: String?
    public let definition: WorkflowDefinition
    public let status: WorkflowStatus
    public let tags: [String]
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date
    public let lastExecutedAt: Date?
    public let executionCount: Int
    public let averageExecutionTime: TimeInterval?

    public init(
        id: String,
        name: String,
        description: String? = nil,
        definition: WorkflowDefinition,
        status: WorkflowStatus,
        tags: [String] = [],
        createdBy: String,
        createdAt: Date,
        updatedAt: Date,
        lastExecutedAt: Date? = nil,
        executionCount: Int = 0,
        averageExecutionTime: TimeInterval? = nil
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.definition = definition
        self.status = status
        self.tags = tags
        self.createdBy = createdBy
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastExecutedAt = lastExecutedAt
        self.executionCount = executionCount
        self.averageExecutionTime = averageExecutionTime
    }

    /// Check if workflow can be executed
    public var canExecute: Bool {
        return status == .active && !definition.steps.isEmpty
    }

    /// Get estimated execution time
    public var estimatedExecutionTime: TimeInterval {
        return averageExecutionTime ?? definition.estimatedDuration
    }
}

/// Workflow status
public enum WorkflowStatus: String, Codable, CaseIterable {
    case draft = "draft"
    case active = "active"
    case paused = "paused"
    case archived = "archived"

    public var displayName: String {
        switch self {
        case .draft:
            return "Draft"
        case .active:
            return "Active"
        case .paused:
            return "Paused"
        case .archived:
            return "Archived"
        }
    }

    /// Color representation for UI
    public var color: String {
        switch self {
        case .draft:
            return "gray"
        case .active:
            return "green"
        case .paused:
            return "orange"
        case .archived:
            return "red"
        }
    }
}

/// Workflow definition containing the actual workflow logic
public struct WorkflowDefinition: Codable, Equatable, Hashable {
    public let version: String
    public let steps: [WorkflowStep]
    public let inputs: [WorkflowInput]
    public let outputs: [WorkflowOutput]
    public let triggers: [WorkflowTrigger]
    public let variables: [String: WorkflowVariable]
    public let settings: WorkflowSettings

    public init(
        version: String = "1.0",
        steps: [WorkflowStep],
        inputs: [WorkflowInput] = [],
        outputs: [WorkflowOutput] = [],
        triggers: [WorkflowTrigger] = [],
        variables: [String: WorkflowVariable] = [:],
        settings: WorkflowSettings = WorkflowSettings()
    ) {
        self.version = version
        self.steps = steps
        self.inputs = inputs
        self.outputs = outputs
        self.triggers = triggers
        self.variables = variables
        self.settings = settings
    }

    /// Estimated duration based on step configurations
    public var estimatedDuration: TimeInterval {
        return steps.reduce(0) { total, step in
            total + (step.estimatedDuration ?? 30) // Default 30 seconds per step
        }
    }

    /// Check if definition is valid
    public var isValid: Bool {
        return !steps.isEmpty && steps.allSatisfy { $0.isValid }
    }
}

/// Individual step in a workflow
public struct WorkflowStep: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let type: WorkflowStepType
    public let configuration: WorkflowStepConfiguration
    public let position: WorkflowPosition
    public let dependencies: [String]
    public let condition: String?
    public let timeout: TimeInterval?
    public let retryPolicy: RetryPolicy?

    public init(
        id: String,
        name: String,
        type: WorkflowStepType,
        configuration: WorkflowStepConfiguration,
        position: WorkflowPosition,
        dependencies: [String] = [],
        condition: String? = nil,
        timeout: TimeInterval? = nil,
        retryPolicy: RetryPolicy? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.configuration = configuration
        self.position = position
        self.dependencies = dependencies
        self.condition = condition
        self.timeout = timeout
        self.retryPolicy = retryPolicy
    }

    /// Estimated duration for this step
    public var estimatedDuration: TimeInterval? {
        return timeout ?? configuration.estimatedDuration
    }

    /// Check if step configuration is valid
    public var isValid: Bool {
        return configuration.isValid
    }
}

/// Position of a step in the workflow canvas
public struct WorkflowPosition: Codable, Equatable, Hashable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// Type of workflow step
public enum WorkflowStepType: String, Codable, CaseIterable {
    case trigger = "trigger"
    case action = "action"
    case condition = "condition"
    case loop = "loop"
    case parallel = "parallel"
    case delay = "delay"
    case webhook = "webhook"
    case agent = "agent"
    case code = "code"

    public var displayName: String {
        switch self {
        case .trigger:
            return "Trigger"
        case .action:
            return "Action"
        case .condition:
            return "Condition"
        case .loop:
            return "Loop"
        case .parallel:
            return "Parallel"
        case .delay:
            return "Delay"
        case .webhook:
            return "Webhook"
        case .agent:
            return "Agent"
        case .code:
            return "Code"
        }
    }

    /// Icon name for UI
    public var iconName: String {
        switch self {
        case .trigger:
            return "play.circle"
        case .action:
            return "gear"
        case .condition:
            return "questionmark.diamond"
        case .loop:
            return "repeat"
        case .parallel:
            return "arrow.triangle.branch"
        case .delay:
            return "clock"
        case .webhook:
            return "link"
        case .agent:
            return "person.crop.circle"
        case .code:
            return "curlybraces"
        }
    }
}

/// Configuration for a workflow step
public struct WorkflowStepConfiguration: Codable, Equatable, Hashable {
    public let type: String
    public let parameters: [String: WorkflowParameter]
    public let estimatedDuration: TimeInterval?

    public init(
        type: String,
        parameters: [String: WorkflowParameter] = [:],
        estimatedDuration: TimeInterval? = nil
    ) {
        self.type = type
        self.parameters = parameters
        self.estimatedDuration = estimatedDuration
    }

    /// Check if configuration is valid
    public var isValid: Bool {
        return !type.isEmpty
    }
}

/// Parameter value in workflow configuration
public enum WorkflowParameter: Codable, Equatable, Hashable {
    case string(String)
    case number(Double)
    case boolean(Bool)
    case array([WorkflowParameter])
    case object([String: WorkflowParameter])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let stringValue = try? container.decode(String.self) {
            self = .string(stringValue)
        } else if let numberValue = try? container.decode(Double.self) {
            self = .number(numberValue)
        } else if let boolValue = try? container.decode(Bool.self) {
            self = .boolean(boolValue)
        } else if let arrayValue = try? container.decode([WorkflowParameter].self) {
            self = .array(arrayValue)
        } else if let objectValue = try? container.decode([String: WorkflowParameter].self) {
            self = .object(objectValue)
        } else {
            throw DecodingError.typeMismatch(
                WorkflowParameter.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Invalid parameter type")
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .boolean(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        }
    }
}

/// Workflow input definition
public struct WorkflowInput: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let type: WorkflowDataType
    public let description: String?
    public let required: Bool
    public let defaultValue: WorkflowParameter?

    public init(
        id: String,
        name: String,
        type: WorkflowDataType,
        description: String? = nil,
        required: Bool = false,
        defaultValue: WorkflowParameter? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.description = description
        self.required = required
        self.defaultValue = defaultValue
    }
}

/// Workflow output definition
public struct WorkflowOutput: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let type: WorkflowDataType
    public let description: String?

    public init(
        id: String,
        name: String,
        type: WorkflowDataType,
        description: String? = nil
    ) {
        self.id = id
        self.name = name
        self.type = type
        self.description = description
    }
}

/// Data types supported in workflows
public enum WorkflowDataType: String, Codable, CaseIterable {
    case string = "string"
    case number = "number"
    case boolean = "boolean"
    case array = "array"
    case object = "object"
    case file = "file"
    case date = "date"

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
        case .file:
            return "File"
        case .date:
            return "Date"
        }
    }
}

/// Workflow trigger configuration
public struct WorkflowTrigger: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let type: WorkflowTriggerType
    public let configuration: WorkflowStepConfiguration
    public let enabled: Bool

    public init(
        id: String,
        type: WorkflowTriggerType,
        configuration: WorkflowStepConfiguration,
        enabled: Bool = true
    ) {
        self.id = id
        self.type = type
        self.configuration = configuration
        self.enabled = enabled
    }
}

/// Types of workflow triggers
public enum WorkflowTriggerType: String, Codable, CaseIterable {
    case manual = "manual"
    case schedule = "schedule"
    case webhook = "webhook"
    case fileUpload = "file_upload"
    case email = "email"
    case apiCall = "api_call"

    public var displayName: String {
        switch self {
        case .manual:
            return "Manual"
        case .schedule:
            return "Schedule"
        case .webhook:
            return "Webhook"
        case .fileUpload:
            return "File Upload"
        case .email:
            return "Email"
        case .apiCall:
            return "API Call"
        }
    }
}

/// Workflow variable definition
public struct WorkflowVariable: Codable, Equatable, Hashable {
    public let type: WorkflowDataType
    public let defaultValue: WorkflowParameter?
    public let description: String?

    public init(
        type: WorkflowDataType,
        defaultValue: WorkflowParameter? = nil,
        description: String? = nil
    ) {
        self.type = type
        self.defaultValue = defaultValue
        self.description = description
    }
}

/// Workflow settings and preferences
public struct WorkflowSettings: Codable, Equatable, Hashable {
    public let maxConcurrentExecutions: Int
    public let executionTimeout: TimeInterval
    public let enableLogging: Bool
    public let logLevel: LogLevel
    public let notificationSettings: WorkflowNotificationSettings

    public init(
        maxConcurrentExecutions: Int = 1,
        executionTimeout: TimeInterval = 3600, // 1 hour
        enableLogging: Bool = true,
        logLevel: LogLevel = .info,
        notificationSettings: WorkflowNotificationSettings = WorkflowNotificationSettings()
    ) {
        self.maxConcurrentExecutions = maxConcurrentExecutions
        self.executionTimeout = executionTimeout
        self.enableLogging = enableLogging
        self.logLevel = logLevel
        self.notificationSettings = notificationSettings
    }
}

/// Log levels for workflow execution
public enum LogLevel: String, Codable, CaseIterable {
    case error = "error"
    case warn = "warn"
    case info = "info"
    case debug = "debug"

    public var displayName: String {
        switch self {
        case .error:
            return "Error"
        case .warn:
            return "Warning"
        case .info:
            return "Info"
        case .debug:
            return "Debug"
        }
    }
}

/// Notification settings for workflow events
public struct WorkflowNotificationSettings: Codable, Equatable, Hashable {
    public let onSuccess: Bool
    public let onFailure: Bool
    public let onTimeout: Bool
    public let recipients: [String]

    public init(
        onSuccess: Bool = false,
        onFailure: Bool = true,
        onTimeout: Bool = true,
        recipients: [String] = []
    ) {
        self.onSuccess = onSuccess
        self.onFailure = onFailure
        self.onTimeout = onTimeout
        self.recipients = recipients
    }
}

/// Retry policy for workflow steps
public struct RetryPolicy: Codable, Equatable, Hashable {
    public let maxRetries: Int
    public let retryDelay: TimeInterval
    public let backoffMultiplier: Double
    public let maxRetryDelay: TimeInterval

    public init(
        maxRetries: Int = 3,
        retryDelay: TimeInterval = 1.0,
        backoffMultiplier: Double = 2.0,
        maxRetryDelay: TimeInterval = 300.0
    ) {
        self.maxRetries = maxRetries
        self.retryDelay = retryDelay
        self.backoffMultiplier = backoffMultiplier
        self.maxRetryDelay = maxRetryDelay
    }

    /// Calculate delay for a specific retry attempt
    public func delayForAttempt(_ attempt: Int) -> TimeInterval {
        let delay = retryDelay * pow(backoffMultiplier, Double(attempt))
        return min(delay, maxRetryDelay)
    }
}