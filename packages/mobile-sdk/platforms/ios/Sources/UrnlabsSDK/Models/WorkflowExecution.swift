import Foundation

/// Represents a workflow execution instance
public struct WorkflowExecution: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let workflowId: String
    public let workflowName: String
    public var status: ExecutionStatus
    public let inputs: [String: Any]?
    public var outputs: [String: Any]?
    public var currentStep: String?
    public var progress: Double
    public let createdAt: Date
    public var updatedAt: Date
    public var startedAt: Date?
    public var completedAt: Date?
    public var failedAt: Date?
    public var error: ExecutionError?
    public let triggeredBy: String
    public let triggerType: String
    public var steps: [StepExecution]
    public var logs: [ExecutionLog]

    public init(
        id: String,
        workflowId: String,
        workflowName: String,
        status: ExecutionStatus,
        inputs: [String: Any]? = nil,
        outputs: [String: Any]? = nil,
        currentStep: String? = nil,
        progress: Double = 0.0,
        createdAt: Date,
        updatedAt: Date,
        startedAt: Date? = nil,
        completedAt: Date? = nil,
        failedAt: Date? = nil,
        error: ExecutionError? = nil,
        triggeredBy: String,
        triggerType: String,
        steps: [StepExecution] = [],
        logs: [ExecutionLog] = []
    ) {
        self.id = id
        self.workflowId = workflowId
        self.workflowName = workflowName
        self.status = status
        self.inputs = inputs
        self.outputs = outputs
        self.currentStep = currentStep
        self.progress = progress
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.failedAt = failedAt
        self.error = error
        self.triggeredBy = triggeredBy
        self.triggerType = triggerType
        self.steps = steps
        self.logs = logs
    }

    // MARK: - Computed Properties

    /// Duration of the execution
    public var duration: TimeInterval? {
        guard let start = startedAt else { return nil }
        let end = completedAt ?? failedAt ?? Date()
        return end.timeIntervalSince(start)
    }

    /// Whether the execution is in a terminal state
    public var isTerminal: Bool {
        switch status {
        case .completed, .failed, .cancelled, .timeout:
            return true
        case .pending, .running, .paused:
            return false
        }
    }

    /// Whether the execution can be cancelled
    public var canCancel: Bool {
        switch status {
        case .pending, .running, .paused:
            return true
        case .completed, .failed, .cancelled, .timeout:
            return false
        }
    }

    /// Whether the execution can be retried
    public var canRetry: Bool {
        switch status {
        case .failed, .cancelled, .timeout:
            return true
        case .pending, .running, .paused, .completed:
            return false
        }
    }

    /// Number of completed steps
    public var completedSteps: Int {
        return steps.filter { $0.status == .completed }.count
    }

    /// Number of failed steps
    public var failedSteps: Int {
        return steps.filter { $0.status == .failed }.count
    }

    /// Total number of steps
    public var totalSteps: Int {
        return steps.count
    }

    // MARK: - Codable Implementation

    enum CodingKeys: CodingKey {
        case id, workflowId, workflowName, status, inputs, outputs
        case currentStep, progress, createdAt, updatedAt, startedAt
        case completedAt, failedAt, error, triggeredBy, triggerType
        case steps, logs
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        workflowId = try container.decode(String.self, forKey: .workflowId)
        workflowName = try container.decode(String.self, forKey: .workflowName)
        status = try container.decode(ExecutionStatus.self, forKey: .status)
        currentStep = try container.decodeIfPresent(String.self, forKey: .currentStep)
        progress = try container.decode(Double.self, forKey: .progress)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        startedAt = try container.decodeIfPresent(Date.self, forKey: .startedAt)
        completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
        failedAt = try container.decodeIfPresent(Date.self, forKey: .failedAt)
        error = try container.decodeIfPresent(ExecutionError.self, forKey: .error)
        triggeredBy = try container.decode(String.self, forKey: .triggeredBy)
        triggerType = try container.decode(String.self, forKey: .triggerType)
        steps = try container.decode([StepExecution].self, forKey: .steps)
        logs = try container.decode([ExecutionLog].self, forKey: .logs)

        // Handle dynamic JSON for inputs/outputs
        if let inputsString = try container.decodeIfPresent(String.self, forKey: .inputs),
           let inputsData = inputsString.data(using: .utf8),
           let inputsObject = try? JSONSerialization.jsonObject(with: inputsData) as? [String: Any] {
            inputs = inputsObject
        } else {
            inputs = nil
        }

        if let outputsString = try container.decodeIfPresent(String.self, forKey: .outputs),
           let outputsData = outputsString.data(using: .utf8),
           let outputsObject = try? JSONSerialization.jsonObject(with: outputsData) as? [String: Any] {
            outputs = outputsObject
        } else {
            outputs = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(id, forKey: .id)
        try container.encode(workflowId, forKey: .workflowId)
        try container.encode(workflowName, forKey: .workflowName)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(currentStep, forKey: .currentStep)
        try container.encode(progress, forKey: .progress)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
        try container.encodeIfPresent(startedAt, forKey: .startedAt)
        try container.encodeIfPresent(completedAt, forKey: .completedAt)
        try container.encodeIfPresent(failedAt, forKey: .failedAt)
        try container.encodeIfPresent(error, forKey: .error)
        try container.encode(triggeredBy, forKey: .triggeredBy)
        try container.encode(triggerType, forKey: .triggerType)
        try container.encode(steps, forKey: .steps)
        try container.encode(logs, forKey: .logs)

        // Encode dynamic JSON for inputs/outputs
        if let inputs = inputs {
            let inputsData = try JSONSerialization.data(withJSONObject: inputs)
            let inputsString = String(data: inputsData, encoding: .utf8)
            try container.encode(inputsString, forKey: .inputs)
        }

        if let outputs = outputs {
            let outputsData = try JSONSerialization.data(withJSONObject: outputs)
            let outputsString = String(data: outputsData, encoding: .utf8)
            try container.encode(outputsString, forKey: .outputs)
        }
    }
}

/// Status of workflow execution
public enum ExecutionStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case running = "running"
    case paused = "paused"
    case completed = "completed"
    case failed = "failed"
    case cancelled = "cancelled"
    case timeout = "timeout"

    public var displayName: String {
        switch self {
        case .pending:
            return "Pending"
        case .running:
            return "Running"
        case .paused:
            return "Paused"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .cancelled:
            return "Cancelled"
        case .timeout:
            return "Timeout"
        }
    }

    /// Color representation for UI
    public var color: String {
        switch self {
        case .pending:
            return "gray"
        case .running:
            return "blue"
        case .paused:
            return "orange"
        case .completed:
            return "green"
        case .failed:
            return "red"
        case .cancelled:
            return "yellow"
        case .timeout:
            return "purple"
        }
    }

    /// SF Symbol icon name
    public var iconName: String {
        switch self {
        case .pending:
            return "clock"
        case .running:
            return "play.circle.fill"
        case .paused:
            return "pause.circle.fill"
        case .completed:
            return "checkmark.circle.fill"
        case .failed:
            return "xmark.circle.fill"
        case .cancelled:
            return "stop.circle.fill"
        case .timeout:
            return "timer"
        }
    }
}

/// Execution error details
public struct ExecutionError: Codable, Equatable, Hashable {
    public let code: String
    public let message: String
    public let stepId: String?
    public let details: [String: String]?
    public let timestamp: Date

    public init(
        code: String,
        message: String,
        stepId: String? = nil,
        details: [String: String]? = nil,
        timestamp: Date = Date()
    ) {
        self.code = code
        self.message = message
        self.stepId = stepId
        self.details = details
        self.timestamp = timestamp
    }

    /// Whether this is a recoverable error
    public var isRecoverable: Bool {
        switch code {
        case "NETWORK_ERROR", "TIMEOUT", "RATE_LIMITED":
            return true
        case "INVALID_INPUT", "PERMISSION_DENIED", "NOT_FOUND":
            return false
        default:
            return false
        }
    }
}

/// Individual step execution within a workflow execution
public struct StepExecution: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let stepId: String
    public let name: String
    public var status: StepExecutionStatus
    public var inputs: [String: Any]?
    public var outputs: [String: Any]?
    public var startedAt: Date?
    public var completedAt: Date?
    public var error: ExecutionError?
    public var retryCount: Int
    public var logs: [ExecutionLog]

    public init(
        id: String,
        stepId: String,
        name: String,
        status: StepExecutionStatus,
        inputs: [String: Any]? = nil,
        outputs: [String: Any]? = nil,
        startedAt: Date? = nil,
        completedAt: Date? = nil,
        error: ExecutionError? = nil,
        retryCount: Int = 0,
        logs: [ExecutionLog] = []
    ) {
        self.id = id
        self.stepId = stepId
        self.name = name
        self.status = status
        self.inputs = inputs
        self.outputs = outputs
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.error = error
        self.retryCount = retryCount
        self.logs = logs
    }

    /// Duration of step execution
    public var duration: TimeInterval? {
        guard let start = startedAt else { return nil }
        let end = completedAt ?? Date()
        return end.timeIntervalSince(start)
    }

    // MARK: - Codable Implementation

    enum CodingKeys: CodingKey {
        case id, stepId, name, status, inputs, outputs
        case startedAt, completedAt, error, retryCount, logs
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        id = try container.decode(String.self, forKey: .id)
        stepId = try container.decode(String.self, forKey: .stepId)
        name = try container.decode(String.self, forKey: .name)
        status = try container.decode(StepExecutionStatus.self, forKey: .status)
        startedAt = try container.decodeIfPresent(Date.self, forKey: .startedAt)
        completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
        error = try container.decodeIfPresent(ExecutionError.self, forKey: .error)
        retryCount = try container.decode(Int.self, forKey: .retryCount)
        logs = try container.decode([ExecutionLog].self, forKey: .logs)

        // Handle dynamic JSON for inputs/outputs
        if let inputsString = try container.decodeIfPresent(String.self, forKey: .inputs),
           let inputsData = inputsString.data(using: .utf8),
           let inputsObject = try? JSONSerialization.jsonObject(with: inputsData) as? [String: Any] {
            inputs = inputsObject
        } else {
            inputs = nil
        }

        if let outputsString = try container.decodeIfPresent(String.self, forKey: .outputs),
           let outputsData = outputsString.data(using: .utf8),
           let outputsObject = try? JSONSerialization.jsonObject(with: outputsData) as? [String: Any] {
            outputs = outputsObject
        } else {
            outputs = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)

        try container.encode(id, forKey: .id)
        try container.encode(stepId, forKey: .stepId)
        try container.encode(name, forKey: .name)
        try container.encode(status, forKey: .status)
        try container.encodeIfPresent(startedAt, forKey: .startedAt)
        try container.encodeIfPresent(completedAt, forKey: .completedAt)
        try container.encodeIfPresent(error, forKey: .error)
        try container.encode(retryCount, forKey: .retryCount)
        try container.encode(logs, forKey: .logs)

        // Encode dynamic JSON for inputs/outputs
        if let inputs = inputs {
            let inputsData = try JSONSerialization.data(withJSONObject: inputs)
            let inputsString = String(data: inputsData, encoding: .utf8)
            try container.encode(inputsString, forKey: .inputs)
        }

        if let outputs = outputs {
            let outputsData = try JSONSerialization.data(withJSONObject: outputs)
            let outputsString = String(data: outputsData, encoding: .utf8)
            try container.encode(outputsString, forKey: .outputs)
        }
    }
}

/// Status of individual step execution
public enum StepExecutionStatus: String, Codable, CaseIterable {
    case pending = "pending"
    case running = "running"
    case completed = "completed"
    case failed = "failed"
    case skipped = "skipped"
    case cancelled = "cancelled"

    public var displayName: String {
        switch self {
        case .pending:
            return "Pending"
        case .running:
            return "Running"
        case .completed:
            return "Completed"
        case .failed:
            return "Failed"
        case .skipped:
            return "Skipped"
        case .cancelled:
            return "Cancelled"
        }
    }

    /// Color representation for UI
    public var color: String {
        switch self {
        case .pending:
            return "gray"
        case .running:
            return "blue"
        case .completed:
            return "green"
        case .failed:
            return "red"
        case .skipped:
            return "orange"
        case .cancelled:
            return "yellow"
        }
    }
}

/// Log entry for execution events
public struct ExecutionLog: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let level: LogLevel
    public let message: String
    public let stepId: String?
    public let timestamp: Date
    public let metadata: [String: String]?

    public init(
        id: String = UUID().uuidString,
        level: LogLevel,
        message: String,
        stepId: String? = nil,
        timestamp: Date = Date(),
        metadata: [String: String]? = nil
    ) {
        self.id = id
        self.level = level
        self.message = message
        self.stepId = stepId
        self.timestamp = timestamp
        self.metadata = metadata
    }

    /// Formatted log message for display
    public var formattedMessage: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss.SSS"
        let timeString = formatter.string(from: timestamp)

        var prefix = "[\(timeString)] \(level.displayName.uppercased())"
        if let stepId = stepId {
            prefix += " [Step: \(stepId)]"
        }

        return "\(prefix): \(message)"
    }
}

/// Log levels for execution logging
public enum LogLevel: String, Codable, CaseIterable {
    case debug = "debug"
    case info = "info"
    case warn = "warn"
    case error = "error"

    public var displayName: String {
        switch self {
        case .debug:
            return "Debug"
        case .info:
            return "Info"
        case .warn:
            return "Warning"
        case .error:
            return "Error"
        }
    }

    /// Priority level for filtering
    public var priority: Int {
        switch self {
        case .debug:
            return 0
        case .info:
            return 1
        case .warn:
            return 2
        case .error:
            return 3
        }
    }

    /// Color representation for UI
    public var color: String {
        switch self {
        case .debug:
            return "gray"
        case .info:
            return "blue"
        case .warn:
            return "orange"
        case .error:
            return "red"
        }
    }
}