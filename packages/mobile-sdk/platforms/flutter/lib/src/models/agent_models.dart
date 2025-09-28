/// Agent models for Flutter SDK
import 'package:json_annotation/json_annotation.dart';

part 'agent_models.g.dart';

/// Agent definition
@JsonSerializable()
class Agent {
  final String id;
  final String name;
  final String description;
  final String type;
  final List<String> capabilities;
  final Map<String, dynamic> config;
  final Map<String, dynamic>? metadata;
  final bool isActive;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  Agent({
    required this.id,
    required this.name,
    required this.description,
    required this.type,
    required this.capabilities,
    required this.config,
    this.metadata,
    required this.isActive,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Agent.fromJson(Map<String, dynamic> json) => _$AgentFromJson(json);
  Map<String, dynamic> toJson() => _$AgentToJson(this);
}

/// Agent conversation
@JsonSerializable()
class AgentConversation {
  final String id;
  final String agentId;
  final String userId;
  final String status;
  final Map<String, dynamic>? context;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? endedAt;

  AgentConversation({
    required this.id,
    required this.agentId,
    required this.userId,
    required this.status,
    this.context,
    this.metadata,
    required this.createdAt,
    required this.updatedAt,
    this.endedAt,
  });

  factory AgentConversation.fromJson(Map<String, dynamic> json) => _$AgentConversationFromJson(json);
  Map<String, dynamic> toJson() => _$AgentConversationToJson(this);

  bool get isActive => status == 'active';
  bool get isEnded => status == 'ended';
  bool get isArchived => status == 'archived';
}

/// Agent message
@JsonSerializable()
class AgentMessage {
  final String id;
  final String conversationId;
  final String role; // 'user', 'agent', 'system'
  final String content;
  final String? type; // 'text', 'image', 'file', 'action'
  final List<String>? attachments;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final DateTime? updatedAt;

  AgentMessage({
    required this.id,
    required this.conversationId,
    required this.role,
    required this.content,
    this.type,
    this.attachments,
    this.metadata,
    required this.createdAt,
    this.updatedAt,
  });

  factory AgentMessage.fromJson(Map<String, dynamic> json) => _$AgentMessageFromJson(json);
  Map<String, dynamic> toJson() => _$AgentMessageToJson(this);

  bool get isFromUser => role == 'user';
  bool get isFromAgent => role == 'agent';
  bool get isFromSystem => role == 'system';
}

/// Agent capability
@JsonSerializable()
class AgentCapability {
  final String name;
  final String description;
  final String type;
  final Map<String, dynamic>? parameters;
  final List<String>? requiredPermissions;

  AgentCapability({
    required this.name,
    required this.description,
    required this.type,
    this.parameters,
    this.requiredPermissions,
  });

  factory AgentCapability.fromJson(Map<String, dynamic> json) => _$AgentCapabilityFromJson(json);
  Map<String, dynamic> toJson() => _$AgentCapabilityToJson(this);
}

/// Agent task result
@JsonSerializable()
class AgentTaskResult {
  final String id;
  final String agentId;
  final String task;
  final String status;
  final Map<String, dynamic>? input;
  final Map<String, dynamic>? output;
  final Map<String, dynamic>? error;
  final DateTime createdAt;
  final DateTime? completedAt;

  AgentTaskResult({
    required this.id,
    required this.agentId,
    required this.task,
    required this.status,
    this.input,
    this.output,
    this.error,
    required this.createdAt,
    this.completedAt,
  });

  factory AgentTaskResult.fromJson(Map<String, dynamic> json) => _$AgentTaskResultFromJson(json);
  Map<String, dynamic> toJson() => _$AgentTaskResultToJson(this);

  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isRunning => status == 'running';
  bool get isPending => status == 'pending';
}

/// Agent metrics
@JsonSerializable()
class AgentMetrics {
  final String agentId;
  final int totalConversations;
  final int activeConversations;
  final int totalMessages;
  final double averageResponseTime;
  final double satisfactionScore;
  final Map<String, int> taskCounts;
  final DateTime? lastActivity;

  AgentMetrics({
    required this.agentId,
    required this.totalConversations,
    required this.activeConversations,
    required this.totalMessages,
    required this.averageResponseTime,
    required this.satisfactionScore,
    required this.taskCounts,
    this.lastActivity,
  });

  factory AgentMetrics.fromJson(Map<String, dynamic> json) => _$AgentMetricsFromJson(json);
  Map<String, dynamic> toJson() => _$AgentMetricsToJson(this);
}

/// Agent feedback
@JsonSerializable()
class AgentFeedback {
  final int rating; // 1-5 stars
  final String? feedback;
  final List<String>? categories; // 'helpful', 'accurate', 'fast', etc.
  final bool? isHelpful;

  AgentFeedback({
    required this.rating,
    this.feedback,
    this.categories,
    this.isHelpful,
  });

  factory AgentFeedback.fromJson(Map<String, dynamic> json) => _$AgentFeedbackFromJson(json);
  Map<String, dynamic> toJson() => _$AgentFeedbackToJson(this);
}

/// Agent training data
@JsonSerializable()
class AgentTrainingData {
  final String id;
  final String agentId;
  final String conversationId;
  final String messageId;
  final AgentFeedback feedback;
  final String? comments;
  final DateTime createdAt;

  AgentTrainingData({
    required this.id,
    required this.agentId,
    required this.conversationId,
    required this.messageId,
    required this.feedback,
    this.comments,
    required this.createdAt,
  });

  factory AgentTrainingData.fromJson(Map<String, dynamic> json) => _$AgentTrainingDataFromJson(json);
  Map<String, dynamic> toJson() => _$AgentTrainingDataToJson(this);
}

/// Agent configuration
@JsonSerializable()
class AgentConfig {
  final String model;
  final double temperature;
  final int maxTokens;
  final String? systemPrompt;
  final List<String>? tools;
  final Map<String, dynamic>? parameters;

  AgentConfig({
    required this.model,
    required this.temperature,
    required this.maxTokens,
    this.systemPrompt,
    this.tools,
    this.parameters,
  });

  factory AgentConfig.fromJson(Map<String, dynamic> json) => _$AgentConfigFromJson(json);
  Map<String, dynamic> toJson() => _$AgentConfigToJson(this);
}

/// Agent status
enum AgentStatus {
  @JsonValue('online')
  online,
  @JsonValue('offline')
  offline,
  @JsonValue('busy')
  busy,
  @JsonValue('maintenance')
  maintenance,
}

/// Agent type
enum AgentType {
  @JsonValue('conversational')
  conversational,
  @JsonValue('task')
  task,
  @JsonValue('workflow')
  workflow,
  @JsonValue('analysis')
  analysis,
  @JsonValue('custom')
  custom,
}

/// Message type
enum MessageType {
  @JsonValue('text')
  text,
  @JsonValue('image')
  image,
  @JsonValue('file')
  file,
  @JsonValue('action')
  action,
  @JsonValue('system')
  system,
}

/// Conversation event
@JsonSerializable()
class ConversationEvent {
  final String type;
  final String conversationId;
  final String? messageId;
  final Map<String, dynamic> data;
  final DateTime timestamp;

  ConversationEvent({
    required this.type,
    required this.conversationId,
    this.messageId,
    required this.data,
    required this.timestamp,
  });

  factory ConversationEvent.fromJson(Map<String, dynamic> json) => _$ConversationEventFromJson(json);
  Map<String, dynamic> toJson() => _$ConversationEventToJson(this);
}

/// Agent action
@JsonSerializable()
class AgentAction {
  final String type;
  final String name;
  final Map<String, dynamic> parameters;
  final String? description;
  final bool requiresConfirmation;

  AgentAction({
    required this.type,
    required this.name,
    required this.parameters,
    this.description,
    required this.requiresConfirmation,
  });

  factory AgentAction.fromJson(Map<String, dynamic> json) => _$AgentActionFromJson(json);
  Map<String, dynamic> toJson() => _$AgentActionToJson(this);
}

/// Agent performance metrics
@JsonSerializable()
class AgentPerformance {
  final String agentId;
  final DateTime period;
  final int messagesProcessed;
  final double averageResponseTime;
  final double successRate;
  final double userSatisfaction;
  final Map<String, dynamic> detailedMetrics;

  AgentPerformance({
    required this.agentId,
    required this.period,
    required this.messagesProcessed,
    required this.averageResponseTime,
    required this.successRate,
    required this.userSatisfaction,
    required this.detailedMetrics,
  });

  factory AgentPerformance.fromJson(Map<String, dynamic> json) => _$AgentPerformanceFromJson(json);
  Map<String, dynamic> toJson() => _$AgentPerformanceToJson(this);
}