import 'dart:async';

import '../core/sdk_error.dart';
import '../http/http_client.dart';
import '../models/agent_models.dart';

class AgentService {
  final HttpClient httpClient;
  final Map<String, StreamController<AgentMessage>> _conversationControllers = {};

  AgentService(this.httpClient);

  /// Get all available agents
  Future<List<Agent>> getAgents({
    int? page,
    int? limit,
    String? search,
    List<String>? capabilities,
    bool? isActive,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;
      if (search != null) queryParams['search'] = search;
      if (capabilities != null) queryParams['capabilities'] = capabilities.join(',');
      if (isActive != null) queryParams['isActive'] = isActive;

      final response = await httpClient.get<Map<String, dynamic>>(
        '/agents',
        queryParameters: queryParams,
      );

      final agents = (response['agents'] as List)
          .map((json) => Agent.fromJson(json))
          .toList();

      return agents;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch agents', originalError: e);
    }
  }

  /// Get agent by ID
  Future<Agent> getAgent(String agentId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/agents/$agentId',
      );

      return Agent.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch agent', originalError: e);
    }
  }

  /// Start a conversation with an agent
  Future<AgentConversation> startConversation(
    String agentId, {
    String? initialMessage,
    Map<String, dynamic>? context,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/agents/$agentId/conversations',
        data: {
          if (initialMessage != null) 'message': initialMessage,
          if (context != null) 'context': context,
        },
      );

      final conversation = AgentConversation.fromJson(response);

      // Set up real-time message streaming
      _setupConversationStreaming(conversation.id);

      return conversation;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to start conversation', originalError: e);
    }
  }

  /// Send a message to an agent
  Future<AgentMessage> sendMessage(
    String conversationId,
    String message, {
    List<String>? attachments,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        data: {
          'message': message,
          if (attachments != null) 'attachments': attachments,
          if (metadata != null) 'metadata': metadata,
        },
      );

      return AgentMessage.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to send message', originalError: e);
    }
  }

  /// Get conversation messages
  Future<List<AgentMessage>> getConversationMessages(
    String conversationId, {
    int? page,
    int? limit,
    DateTime? since,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;
      if (since != null) queryParams['since'] = since.toIso8601String();

      final response = await httpClient.get<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        queryParameters: queryParams,
      );

      final messages = (response['messages'] as List)
          .map((json) => AgentMessage.fromJson(json))
          .toList();

      return messages;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch messages', originalError: e);
    }
  }

  /// Get user's conversations
  Future<List<AgentConversation>> getConversations({
    String? agentId,
    int? page,
    int? limit,
    String? status,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (agentId != null) queryParams['agentId'] = agentId;
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;
      if (status != null) queryParams['status'] = status;

      final response = await httpClient.get<Map<String, dynamic>>(
        '/conversations',
        queryParameters: queryParams,
      );

      final conversations = (response['conversations'] as List)
          .map((json) => AgentConversation.fromJson(json))
          .toList();

      return conversations;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch conversations', originalError: e);
    }
  }

  /// End a conversation
  Future<void> endConversation(String conversationId) async {
    try {
      await httpClient.post('/conversations/$conversationId/end');
      
      // Clean up streaming
      final controller = _conversationControllers.remove(conversationId);
      controller?.close();
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to end conversation', originalError: e);
    }
  }

  /// Archive a conversation
  Future<void> archiveConversation(String conversationId) async {
    try {
      await httpClient.post('/conversations/$conversationId/archive');
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to archive conversation', originalError: e);
    }
  }

  /// Delete a conversation
  Future<void> deleteConversation(String conversationId) async {
    try {
      await httpClient.delete('/conversations/$conversationId');
      
      // Clean up streaming
      final controller = _conversationControllers.remove(conversationId);
      controller?.close();
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to delete conversation', originalError: e);
    }
  }

  /// Subscribe to conversation messages
  Stream<AgentMessage> subscribeToConversation(String conversationId) {
    if (!_conversationControllers.containsKey(conversationId)) {
      _setupConversationStreaming(conversationId);
    }

    return _conversationControllers[conversationId]!.stream;
  }

  /// Unsubscribe from conversation
  void unsubscribeFromConversation(String conversationId) {
    final controller = _conversationControllers.remove(conversationId);
    controller?.close();
  }

  void _setupConversationStreaming(String conversationId) {
    final controller = StreamController<AgentMessage>.broadcast();
    _conversationControllers[conversationId] = controller;

    // Poll for new messages (in a real implementation, this would use WebSockets)
    DateTime? lastMessageTime;
    
    Timer.periodic(const Duration(seconds: 1), (timer) async {
      try {
        if (controller.isClosed) {
          timer.cancel();
          return;
        }

        final messages = await getConversationMessages(
          conversationId,
          since: lastMessageTime,
          limit: 10,
        );

        for (final message in messages.reversed) {
          if (lastMessageTime == null || message.createdAt.isAfter(lastMessageTime)) {
            controller.add(message);
            lastMessageTime = message.createdAt;
          }
        }
      } catch (e) {
        if (!controller.isClosed) {
          controller.addError(e);
        }
      }
    });
  }

  /// Execute an agent task
  Future<AgentTaskResult> executeTask(
    String agentId, {
    required String task,
    Map<String, dynamic>? input,
    Map<String, dynamic>? config,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/agents/$agentId/tasks',
        data: {
          'task': task,
          if (input != null) 'input': input,
          if (config != null) 'config': config,
        },
      );

      return AgentTaskResult.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to execute agent task', originalError: e);
    }
  }

  /// Get agent capabilities
  Future<List<AgentCapability>> getAgentCapabilities(String agentId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/agents/$agentId/capabilities',
      );

      final capabilities = (response['capabilities'] as List)
          .map((json) => AgentCapability.fromJson(json))
          .toList();

      return capabilities;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch agent capabilities', originalError: e);
    }
  }

  /// Get agent metrics
  Future<AgentMetrics> getAgentMetrics(
    String agentId, {
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (startDate != null) queryParams['startDate'] = startDate.toIso8601String();
      if (endDate != null) queryParams['endDate'] = endDate.toIso8601String();

      final response = await httpClient.get<Map<String, dynamic>>(
        '/agents/$agentId/metrics',
        queryParameters: queryParams,
      );

      return AgentMetrics.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch agent metrics', originalError: e);
    }
  }

  /// Train an agent with feedback
  Future<void> trainAgent(
    String agentId, {
    required String conversationId,
    required String messageId,
    required AgentFeedback feedback,
    String? comments,
  }) async {
    try {
      await httpClient.post(
        '/agents/$agentId/training',
        data: {
          'conversationId': conversationId,
          'messageId': messageId,
          'feedback': feedback.toJson(),
          if (comments != null) 'comments': comments,
        },
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to train agent', originalError: e);
    }
  }

  /// Get agent training data
  Future<List<AgentTrainingData>> getAgentTrainingData(
    String agentId, {
    int? page,
    int? limit,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;

      final response = await httpClient.get<Map<String, dynamic>>(
        '/agents/$agentId/training',
        queryParameters: queryParams,
      );

      final trainingData = (response['trainingData'] as List)
          .map((json) => AgentTrainingData.fromJson(json))
          .toList();

      return trainingData;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch agent training data', originalError: e);
    }
  }

  /// Create a custom agent
  Future<Agent> createAgent({
    required String name,
    required String description,
    required List<String> capabilities,
    Map<String, dynamic>? config,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/agents',
        data: {
          'name': name,
          'description': description,
          'capabilities': capabilities,
          if (config != null) 'config': config,
          if (metadata != null) 'metadata': metadata,
        },
      );

      return Agent.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to create agent', originalError: e);
    }
  }

  /// Update an agent
  Future<Agent> updateAgent(
    String agentId, {
    String? name,
    String? description,
    List<String>? capabilities,
    Map<String, dynamic>? config,
    Map<String, dynamic>? metadata,
    bool? isActive,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (name != null) data['name'] = name;
      if (description != null) data['description'] = description;
      if (capabilities != null) data['capabilities'] = capabilities;
      if (config != null) data['config'] = config;
      if (metadata != null) data['metadata'] = metadata;
      if (isActive != null) data['isActive'] = isActive;

      final response = await httpClient.put<Map<String, dynamic>>(
        '/agents/$agentId',
        data: data,
      );

      return Agent.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to update agent', originalError: e);
    }
  }

  /// Delete an agent
  Future<void> deleteAgent(String agentId) async {
    try {
      await httpClient.delete('/agents/$agentId');
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to delete agent', originalError: e);
    }
  }

  /// Dispose resources
  void dispose() {
    for (final controller in _conversationControllers.values) {
      controller.close();
    }
    _conversationControllers.clear();
  }
}