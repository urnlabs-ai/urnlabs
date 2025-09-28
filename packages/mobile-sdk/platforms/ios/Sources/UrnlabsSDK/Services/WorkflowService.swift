import Foundation
import Combine

/// Service responsible for managing workflows and executions
public class WorkflowService: ObservableObject {
    // MARK: - Published Properties
    @Published public private(set) var workflows: [Workflow] = []
    @Published public private(set) var executions: [WorkflowExecution] = []
    @Published public private(set) var isLoading = false

    // MARK: - Private Properties
    private let httpClient: HTTPClient
    private let storageAdapter: StorageAdapter
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization
    public init(httpClient: HTTPClient, storageAdapter: StorageAdapter) {
        self.httpClient = httpClient
        self.storageAdapter = storageAdapter

        loadCachedData()
    }

    // MARK: - Workflow Management

    /// Get all workflows with optional filtering
    public func getWorkflows(status: WorkflowStatus? = nil) async throws -> [Workflow] {
        isLoading = true
        defer { isLoading = false }

        var path = "/workflows"
        if let status = status {
            path += "?status=\(status.rawValue)"
        }

        do {
            let response: WorkflowListResponse = try await httpClient.get(path)
            let workflows = response.workflows

            await cacheWorkflows(workflows)
            await MainActor.run {
                self.workflows = workflows
            }

            return workflows
        } catch {
            // Return cached data if network fails
            if !workflows.isEmpty {
                return workflows
            }
            throw mapWorkflowError(error)
        }
    }

    /// Get workflow by ID
    public func getWorkflow(id: String) async throws -> Workflow {
        // Check cache first
        if let cached = workflows.first(where: { $0.id == id }) {
            return cached
        }

        do {
            let workflow: Workflow = try await httpClient.get("/workflows/\(id)")
            await updateCachedWorkflow(workflow)
            return workflow
        } catch {
            throw mapWorkflowError(error)
        }
    }

    /// Create new workflow
    public func createWorkflow(_ request: CreateWorkflowRequest) async throws -> Workflow {
        isLoading = true
        defer { isLoading = false }

        do {
            let workflow: Workflow = try await httpClient.post("/workflows", body: request)
            await updateCachedWorkflow(workflow)
            return workflow
        } catch {
            throw mapWorkflowError(error)
        }
    }

    /// Update existing workflow
    public func updateWorkflow(id: String, request: UpdateWorkflowRequest) async throws -> Workflow {
        isLoading = true
        defer { isLoading = false }

        do {
            let workflow: Workflow = try await httpClient.put("/workflows/\(id)", body: request)
            await updateCachedWorkflow(workflow)
            return workflow
        } catch {
            throw mapWorkflowError(error)
        }
    }

    /// Delete workflow
    public func deleteWorkflow(id: String) async throws {
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await httpClient.delete("/workflows/\(id)")
            await removeCachedWorkflow(id)
        } catch {
            throw mapWorkflowError(error)
        }
    }

    // MARK: - Workflow Execution

    /// Execute workflow
    public func executeWorkflow(id: String, inputs: [String: Any] = [:]) async throws -> WorkflowExecution {
        isLoading = true
        defer { isLoading = false }

        let request = ExecuteWorkflowRequest(inputs: inputs)

        do {
            let execution: WorkflowExecution = try await httpClient.post("/workflows/\(id)/execute", body: request)
            await updateCachedExecution(execution)
            return execution
        } catch {
            throw mapWorkflowError(error)
        }
    }

    /// Get workflow executions
    public func getExecutions(workflowId: String? = nil, limit: Int = 50) async throws -> [WorkflowExecution] {
        var path = "/executions?limit=\(limit)"
        if let workflowId = workflowId {
            path += "&workflow_id=\(workflowId)"
        }

        do {
            let response: ExecutionListResponse = try await httpClient.get(path)
            let executions = response.executions

            await cacheExecutions(executions)
            await MainActor.run {
                self.executions = executions
            }

            return executions
        } catch {
            // Return cached data if network fails
            if !executions.isEmpty {
                return executions
            }
            throw mapWorkflowError(error)
        }
    }

    /// Get execution by ID
    public func getExecution(id: String) async throws -> WorkflowExecution {
        // Check cache first
        if let cached = executions.first(where: { $0.id == id }) {
            return cached
        }

        do {
            let execution: WorkflowExecution = try await httpClient.get("/executions/\(id)")
            await updateCachedExecution(execution)
            return execution
        } catch {
            throw mapWorkflowError(error)
        }
    }

    /// Cancel execution
    public func cancelExecution(id: String) async throws {
        do {
            _ = try await httpClient.post("/executions/\(id)/cancel", body: EmptyRequest())

            // Update cached execution status
            if let index = executions.firstIndex(where: { $0.id == id }) {
                await MainActor.run {
                    self.executions[index].status = .cancelled
                }
            }
        } catch {
            throw mapWorkflowError(error)
        }
    }

    /// Retry failed execution
    public func retryExecution(id: String) async throws -> WorkflowExecution {
        do {
            let execution: WorkflowExecution = try await httpClient.post("/executions/\(id)/retry", body: EmptyRequest())
            await updateCachedExecution(execution)
            return execution
        } catch {
            throw mapWorkflowError(error)
        }
    }

    // MARK: - Real-time Updates

    /// Subscribe to execution updates
    public func subscribeToExecutionUpdates(executionId: String) -> AnyPublisher<WorkflowExecution, Never> {
        // This would typically use WebSocket or Server-Sent Events
        // For now, return a simple polling mechanism
        Timer.publish(every: 2.0, on: .main, in: .common)
            .autoconnect()
            .asyncMap { _ in
                try? await self.getExecution(id: executionId)
            }
            .compactMap { $0 }
            .removeDuplicates { $0.status == $1.status && $0.updatedAt == $1.updatedAt }
            .eraseToAnyPublisher()
    }

    // MARK: - Private Methods

    private func loadCachedData() {
        Task {
            // Load cached workflows
            if let workflowData = await storageAdapter.getValue(for: "cached_workflows"),
               let workflows = try? JSONDecoder().decode([Workflow].self, from: workflowData.data(using: .utf8)!) {
                await MainActor.run {
                    self.workflows = workflows
                }
            }

            // Load cached executions
            if let executionData = await storageAdapter.getValue(for: "cached_executions"),
               let executions = try? JSONDecoder().decode([WorkflowExecution].self, from: executionData.data(using: .utf8)!) {
                await MainActor.run {
                    self.executions = executions
                }
            }
        }
    }

    private func cacheWorkflows(_ workflows: [Workflow]) async {
        if let data = try? JSONEncoder().encode(workflows),
           let jsonString = String(data: data, encoding: .utf8) {
            await storageAdapter.setValue(jsonString, for: "cached_workflows")
        }
    }

    private func cacheExecutions(_ executions: [WorkflowExecution]) async {
        if let data = try? JSONEncoder().encode(executions),
           let jsonString = String(data: data, encoding: .utf8) {
            await storageAdapter.setValue(jsonString, for: "cached_executions")
        }
    }

    private func updateCachedWorkflow(_ workflow: Workflow) async {
        await MainActor.run {
            if let index = self.workflows.firstIndex(where: { $0.id == workflow.id }) {
                self.workflows[index] = workflow
            } else {
                self.workflows.append(workflow)
            }
        }
        await cacheWorkflows(workflows)
    }

    private func updateCachedExecution(_ execution: WorkflowExecution) async {
        await MainActor.run {
            if let index = self.executions.firstIndex(where: { $0.id == execution.id }) {
                self.executions[index] = execution
            } else {
                self.executions.insert(execution, at: 0) // Most recent first
            }
        }
        await cacheExecutions(executions)
    }

    private func removeCachedWorkflow(_ id: String) async {
        await MainActor.run {
            self.workflows.removeAll { $0.id == id }
        }
        await cacheWorkflows(workflows)
    }

    private func mapWorkflowError(_ error: Error) -> SDKError {
        if let httpError = error as? HTTPError {
            switch httpError.statusCode {
            case 401:
                return .unauthorized(httpError.message)
            case 403:
                return .forbidden
            case 404:
                return .workflowNotFound
            case 409:
                return .workflowAlreadyExists
            case 422:
                return .invalidWorkflowConfiguration
            default:
                return .serverError(httpError.message ?? "Server error")
            }
        }

        if error is DecodingError {
            return .invalidResponse
        }

        return .networkError(error.localizedDescription)
    }
}

// MARK: - Request/Response Models

public struct CreateWorkflowRequest: Codable {
    let name: String
    let description: String?
    let definition: WorkflowDefinition
    let tags: [String]?
}

public struct UpdateWorkflowRequest: Codable {
    let name: String?
    let description: String?
    let definition: WorkflowDefinition?
    let tags: [String]?
    let status: WorkflowStatus?
}

public struct ExecuteWorkflowRequest: Codable {
    let inputs: [String: Any]

    enum CodingKeys: CodingKey {
        case inputs
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        let jsonData = try JSONSerialization.data(withJSONObject: inputs)
        let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
        try container.encode(jsonString, forKey: .inputs)
    }
}

public struct WorkflowListResponse: Codable {
    let workflows: [Workflow]
    let totalCount: Int
    let hasMore: Bool
}

public struct ExecutionListResponse: Codable {
    let executions: [WorkflowExecution]
    let totalCount: Int
    let hasMore: Bool
}

// MARK: - Publisher Extensions

extension Publisher {
    func asyncMap<T>(_ transform: @escaping (Output) async throws -> T) -> Publishers.FlatMap<Future<T, Error>, Self> {
        flatMap { value in
            Future { promise in
                Task {
                    do {
                        let result = try await transform(value)
                        promise(.success(result))
                    } catch {
                        promise(.failure(error))
                    }
                }
            }
        }
    }
}