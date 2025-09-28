import Foundation
import Combine

/// Service responsible for managing AI agents and their interactions
public class AgentService: ObservableObject {
    // MARK: - Published Properties
    @Published public private(set) var agents: [Agent] = []
    @Published public private(set) var conversations: [Conversation] = []
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

    // MARK: - Agent Management

    /// Get all available agents
    public func getAgents(category: AgentCategory? = nil) async throws -> [Agent] {
        isLoading = true
        defer { isLoading = false }

        var path = "/agents"
        if let category = category {
            path += "?category=\(category.rawValue)"
        }

        do {
            let response: AgentListResponse = try await httpClient.get(path)
            let agents = response.agents

            await cacheAgents(agents)
            await MainActor.run {
                self.agents = agents
            }

            return agents
        } catch {
            // Return cached data if network fails
            if !agents.isEmpty {
                return agents
            }
            throw mapAgentError(error)
        }
    }

    /// Get agent by ID
    public func getAgent(id: String) async throws -> Agent {
        // Check cache first
        if let cached = agents.first(where: { $0.id == id }) {
            return cached
        }

        do {
            let agent: Agent = try await httpClient.get("/agents/\(id)")
            await updateCachedAgent(agent)
            return agent
        } catch {
            throw mapAgentError(error)
        }
    }

    // MARK: - Conversation Management

    /// Create new conversation with agent
    public func createConversation(agentId: String, context: ConversationContext? = nil) async throws -> Conversation {
        isLoading = true
        defer { isLoading = false }

        let request = CreateConversationRequest(agentId: agentId, context: context)

        do {
            let conversation: Conversation = try await httpClient.post("/conversations", body: request)
            await updateCachedConversation(conversation)
            return conversation
        } catch {
            throw mapAgentError(error)
        }
    }

    /// Get conversations
    public func getConversations(agentId: String? = nil, limit: Int = 50) async throws -> [Conversation] {
        var path = "/conversations?limit=\(limit)"
        if let agentId = agentId {
            path += "&agent_id=\(agentId)"
        }

        do {
            let response: ConversationListResponse = try await httpClient.get(path)
            let conversations = response.conversations

            await cacheConversations(conversations)
            await MainActor.run {
                self.conversations = conversations
            }

            return conversations
        } catch {
            // Return cached data if network fails
            if !conversations.isEmpty {
                return conversations
            }
            throw mapAgentError(error)
        }
    }

    /// Get conversation by ID
    public func getConversation(id: String) async throws -> Conversation {
        // Check cache first
        if let cached = conversations.first(where: { $0.id == id }) {
            return cached
        }

        do {
            let conversation: Conversation = try await httpClient.get("/conversations/\(id)")
            await updateCachedConversation(conversation)
            return conversation
        } catch {
            throw mapAgentError(error)
        }
    }

    // MARK: - Message Handling

    /// Send message to agent
    public func sendMessage(
        conversationId: String,
        content: String,
        attachments: [MessageAttachment] = []
    ) async throws -> Message {
        isLoading = true
        defer { isLoading = false }

        let request = SendMessageRequest(
            content: content,
            attachments: attachments
        )

        do {
            let message: Message = try await httpClient.post("/conversations/\(conversationId)/messages", body: request)

            // Update conversation in cache
            if let conversationIndex = conversations.firstIndex(where: { $0.id == conversationId }) {
                await MainActor.run {
                    self.conversations[conversationIndex].messages.append(message)
                    self.conversations[conversationIndex].updatedAt = message.createdAt
                }
                await cacheConversations(conversations)
            }

            return message
        } catch {
            throw mapAgentError(error)
        }
    }

    /// Get messages for conversation
    public func getMessages(conversationId: String, limit: Int = 50, offset: Int = 0) async throws -> [Message] {
        let path = "/conversations/\(conversationId)/messages?limit=\(limit)&offset=\(offset)"

        do {
            let response: MessageListResponse = try await httpClient.get(path)
            return response.messages
        } catch {
            throw mapAgentError(error)
        }
    }

    // MARK: - Real-time Communication

    /// Subscribe to real-time messages for a conversation
    public func subscribeToMessages(conversationId: String) -> AnyPublisher<Message, Never> {
        // This would typically use WebSocket connection
        // For now, return a simple polling mechanism
        Timer.publish(every: 1.0, on: .main, in: .common)
            .autoconnect()
            .asyncMap { _ in
                try? await self.getConversation(id: conversationId)
            }
            .compactMap { $0 }
            .map(\.messages)
            .scan([]) { previous, current in
                // Return only new messages
                let previousIds = Set(previous.map(\.id))
                return current.filter { !previousIds.contains($0.id) }
            }
            .flatMap { $0.publisher }
            .eraseToAnyPublisher()
    }

    /// Subscribe to agent status updates
    public func subscribeToAgentStatus(agentId: String) -> AnyPublisher<AgentStatus, Never> {
        Timer.publish(every: 5.0, on: .main, in: .common)
            .autoconnect()
            .asyncMap { _ in
                try? await self.getAgent(id: agentId)
            }
            .compactMap { $0?.status }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    // MARK: - Agent Capabilities

    /// Execute agent capability
    public func executeCapability(
        agentId: String,
        capability: String,
        parameters: [String: Any]
    ) async throws -> CapabilityResult {
        let request = ExecuteCapabilityRequest(
            capability: capability,
            parameters: parameters
        )

        do {
            let result: CapabilityResult = try await httpClient.post("/agents/\(agentId)/capabilities/\(capability)", body: request)
            return result
        } catch {
            throw mapAgentError(error)
        }
    }

    /// Get agent capabilities
    public func getCapabilities(agentId: String) async throws -> [AgentCapability] {
        do {
            let response: CapabilityListResponse = try await httpClient.get("/agents/\(agentId)/capabilities")
            return response.capabilities
        } catch {
            throw mapAgentError(error)
        }
    }

    // MARK: - Private Methods

    private func loadCachedData() {
        Task {
            // Load cached agents
            if let agentData = await storageAdapter.getValue(for: "cached_agents"),
               let agents = try? JSONDecoder().decode([Agent].self, from: agentData.data(using: .utf8)!) {
                await MainActor.run {
                    self.agents = agents
                }
            }

            // Load cached conversations
            if let conversationData = await storageAdapter.getValue(for: "cached_conversations"),
               let conversations = try? JSONDecoder().decode([Conversation].self, from: conversationData.data(using: .utf8)!) {
                await MainActor.run {
                    self.conversations = conversations
                }
            }
        }
    }

    private func cacheAgents(_ agents: [Agent]) async {
        if let data = try? JSONEncoder().encode(agents),
           let jsonString = String(data: data, encoding: .utf8) {
            await storageAdapter.setValue(jsonString, for: "cached_agents")
        }
    }

    private func cacheConversations(_ conversations: [Conversation]) async {
        if let data = try? JSONEncoder().encode(conversations),
           let jsonString = String(data: data, encoding: .utf8) {
            await storageAdapter.setValue(jsonString, for: "cached_conversations")
        }
    }

    private func updateCachedAgent(_ agent: Agent) async {
        await MainActor.run {
            if let index = self.agents.firstIndex(where: { $0.id == agent.id }) {
                self.agents[index] = agent
            } else {
                self.agents.append(agent)
            }
        }
        await cacheAgents(agents)
    }

    private func updateCachedConversation(_ conversation: Conversation) async {
        await MainActor.run {
            if let index = self.conversations.firstIndex(where: { $0.id == conversation.id }) {
                self.conversations[index] = conversation
            } else {
                self.conversations.insert(conversation, at: 0) // Most recent first
            }
        }
        await cacheConversations(conversations)
    }

    private func mapAgentError(_ error: Error) -> SDKError {
        if let httpError = error as? HTTPError {
            switch httpError.statusCode {
            case 401:
                return .unauthorized(httpError.message)
            case 403:
                return .forbidden
            case 404:
                return .agentNotFound
            case 409:
                return .conversationAlreadyExists
            case 422:
                return .invalidAgentConfiguration
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

public struct CreateConversationRequest: Codable {
    let agentId: String
    let context: ConversationContext?
}

public struct SendMessageRequest: Codable {
    let content: String
    let attachments: [MessageAttachment]
}

public struct ExecuteCapabilityRequest: Codable {
    let capability: String
    let parameters: [String: Any]

    enum CodingKeys: CodingKey {
        case capability, parameters
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(capability, forKey: .capability)

        let jsonData = try JSONSerialization.data(withJSONObject: parameters)
        let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
        try container.encode(jsonString, forKey: .parameters)
    }
}

public struct AgentListResponse: Codable {
    let agents: [Agent]
    let totalCount: Int
}

public struct ConversationListResponse: Codable {
    let conversations: [Conversation]
    let totalCount: Int
}

public struct MessageListResponse: Codable {
    let messages: [Message]
    let totalCount: Int
    let hasMore: Bool
}

public struct CapabilityListResponse: Codable {
    let capabilities: [AgentCapability]
}

public struct CapabilityResult: Codable {
    let success: Bool
    let result: [String: Any]?
    let error: String?

    enum CodingKeys: CodingKey {
        case success, result, error
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        success = try container.decode(Bool.self, forKey: .success)
        error = try container.decodeIfPresent(String.self, forKey: .error)

        if let resultString = try container.decodeIfPresent(String.self, forKey: .result),
           let resultData = resultString.data(using: .utf8),
           let resultObject = try? JSONSerialization.jsonObject(with: resultData) as? [String: Any] {
            result = resultObject
        } else {
            result = nil
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(success, forKey: .success)
        try container.encodeIfPresent(error, forKey: .error)

        if let result = result {
            let jsonData = try JSONSerialization.data(withJSONObject: result)
            let jsonString = String(data: jsonData, encoding: .utf8)
            try container.encode(jsonString, forKey: .result)
        }
    }
}

// MARK: - Supporting Types

public enum AgentCategory: String, Codable, CaseIterable {
    case assistant = "assistant"
    case analyst = "analyst"
    case developer = "developer"
    case designer = "designer"
    case writer = "writer"
    case researcher = "researcher"
}

public enum AgentStatus: String, Codable {
    case available = "available"
    case busy = "busy"
    case offline = "offline"
    case maintenance = "maintenance"
}

public struct ConversationContext: Codable {
    let workflowId: String?
    let projectId: String?
    let metadata: [String: String]?
}

public struct MessageAttachment: Codable {
    let id: String
    let name: String
    let type: String
    let size: Int
    let url: String?
}

public struct AgentCapability: Codable {
    let name: String
    let description: String
    let parameters: [CapabilityParameter]
    let examples: [String]?
}

public struct CapabilityParameter: Codable {
    let name: String
    let type: String
    let description: String
    let required: Bool
    let defaultValue: String?
}