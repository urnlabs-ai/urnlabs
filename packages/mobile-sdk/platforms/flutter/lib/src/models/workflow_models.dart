/// Workflow models for Flutter SDK
import 'package:json_annotation/json_annotation.dart';

part 'workflow_models.g.dart';

/// Workflow definition
@JsonSerializable()
class Workflow {
  final String id;
  final String name;
  final String description;
  final String version;
  final List<String> tags;
  final Map<String, dynamic> definition;
  final Map<String, dynamic>? metadata;
  final bool isActive;
  final String createdBy;
  final DateTime createdAt;
  final DateTime updatedAt;

  Workflow({
    required this.id,
    required this.name,
    required this.description,
    required this.version,
    required this.tags,
    required this.definition,
    this.metadata,
    required this.isActive,
    required this.createdBy,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Workflow.fromJson(Map<String, dynamic> json) => _$WorkflowFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowToJson(this);
}

/// Workflow run
@JsonSerializable()
class WorkflowRun {
  final String id;
  final String workflowId;
  final String workflowVersion;
  final String status;
  final Map<String, dynamic>? input;
  final Map<String, dynamic>? output;
  final Map<String, dynamic>? error;
  final String? currentStep;
  final double? progress;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? completedAt;

  WorkflowRun({
    required this.id,
    required this.workflowId,
    required this.workflowVersion,
    required this.status,
    this.input,
    this.output,
    this.error,
    this.currentStep,
    this.progress,
    required this.createdAt,
    required this.updatedAt,
    this.completedAt,
  });

  factory WorkflowRun.fromJson(Map<String, dynamic> json) => _$WorkflowRunFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowRunToJson(this);

  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isRunning => status == 'running';
  bool get isPending => status == 'pending';
  bool get isCancelled => status == 'cancelled';
}

/// Workflow run status update
@JsonSerializable()
class WorkflowRunStatus {
  final String runId;
  final String status;
  final double? progress;
  final String? currentStep;
  final Map<String, dynamic>? error;
  final DateTime updatedAt;

  WorkflowRunStatus({
    required this.runId,
    required this.status,
    this.progress,
    this.currentStep,
    this.error,
    required this.updatedAt,
  });

  factory WorkflowRunStatus.fromJson(Map<String, dynamic> json) => _$WorkflowRunStatusFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowRunStatusToJson(this);
}

/// Workflow log entry
@JsonSerializable()
class WorkflowLog {
  final String id;
  final String runId;
  final String level;
  final String message;
  final String? step;
  final Map<String, dynamic>? data;
  final DateTime timestamp;

  WorkflowLog({
    required this.id,
    required this.runId,
    required this.level,
    required this.message,
    this.step,
    this.data,
    required this.timestamp,
  });

  factory WorkflowLog.fromJson(Map<String, dynamic> json) => _$WorkflowLogFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowLogToJson(this);
}

/// Workflow template
@JsonSerializable()
class WorkflowTemplate {
  final String id;
  final String name;
  final String description;
  final String category;
  final List<String> tags;
  final Map<String, dynamic> definition;
  final List<WorkflowParameter> parameters;
  final Map<String, dynamic>? metadata;
  final DateTime createdAt;
  final DateTime updatedAt;

  WorkflowTemplate({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.tags,
    required this.definition,
    required this.parameters,
    this.metadata,
    required this.createdAt,
    required this.updatedAt,
  });

  factory WorkflowTemplate.fromJson(Map<String, dynamic> json) => _$WorkflowTemplateFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowTemplateToJson(this);
}

/// Workflow parameter
@JsonSerializable()
class WorkflowParameter {
  final String name;
  final String type;
  final String description;
  final dynamic defaultValue;
  final bool required;
  final Map<String, dynamic>? validation;

  WorkflowParameter({
    required this.name,
    required this.type,
    required this.description,
    this.defaultValue,
    required this.required,
    this.validation,
  });

  factory WorkflowParameter.fromJson(Map<String, dynamic> json) => _$WorkflowParameterFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowParameterToJson(this);
}

/// Workflow validation result
@JsonSerializable()
class WorkflowValidationResult {
  final bool isValid;
  final List<WorkflowValidationError> errors;
  final List<WorkflowValidationWarning> warnings;

  WorkflowValidationResult({
    required this.isValid,
    required this.errors,
    required this.warnings,
  });

  factory WorkflowValidationResult.fromJson(Map<String, dynamic> json) => _$WorkflowValidationResultFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowValidationResultToJson(this);
}

/// Workflow validation error
@JsonSerializable()
class WorkflowValidationError {
  final String code;
  final String message;
  final String? path;
  final Map<String, dynamic>? context;

  WorkflowValidationError({
    required this.code,
    required this.message,
    this.path,
    this.context,
  });

  factory WorkflowValidationError.fromJson(Map<String, dynamic> json) => _$WorkflowValidationErrorFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowValidationErrorToJson(this);
}

/// Workflow validation warning
@JsonSerializable()
class WorkflowValidationWarning {
  final String code;
  final String message;
  final String? path;
  final Map<String, dynamic>? context;

  WorkflowValidationWarning({
    required this.code,
    required this.message,
    this.path,
    this.context,
  });

  factory WorkflowValidationWarning.fromJson(Map<String, dynamic> json) => _$WorkflowValidationWarningFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowValidationWarningToJson(this);
}

/// Workflow step definition
@JsonSerializable()
class WorkflowStep {
  final String id;
  final String type;
  final String name;
  final Map<String, dynamic> config;
  final List<String> dependencies;
  final Map<String, dynamic>? conditions;

  WorkflowStep({
    required this.id,
    required this.type,
    required this.name,
    required this.config,
    required this.dependencies,
    this.conditions,
  });

  factory WorkflowStep.fromJson(Map<String, dynamic> json) => _$WorkflowStepFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowStepToJson(this);
}

/// Workflow execution context
@JsonSerializable()
class WorkflowExecutionContext {
  final String runId;
  final String workflowId;
  final Map<String, dynamic> variables;
  final Map<String, dynamic> stepOutputs;
  final DateTime startTime;
  final String? currentStepId;

  WorkflowExecutionContext({
    required this.runId,
    required this.workflowId,
    required this.variables,
    required this.stepOutputs,
    required this.startTime,
    this.currentStepId,
  });

  factory WorkflowExecutionContext.fromJson(Map<String, dynamic> json) => _$WorkflowExecutionContextFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowExecutionContextToJson(this);
}

/// Workflow metrics
@JsonSerializable()
class WorkflowMetrics {
  final String workflowId;
  final int totalRuns;
  final int successfulRuns;
  final int failedRuns;
  final double successRate;
  final double averageDuration;
  final DateTime? lastRun;
  final Map<String, int> statusCounts;

  WorkflowMetrics({
    required this.workflowId,
    required this.totalRuns,
    required this.successfulRuns,
    required this.failedRuns,
    required this.successRate,
    required this.averageDuration,
    this.lastRun,
    required this.statusCounts,
  });

  factory WorkflowMetrics.fromJson(Map<String, dynamic> json) => _$WorkflowMetricsFromJson(json);
  Map<String, dynamic> toJson() => _$WorkflowMetricsToJson(this);
}