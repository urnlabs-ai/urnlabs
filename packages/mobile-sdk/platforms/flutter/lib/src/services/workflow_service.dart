import 'dart:async';

import '../core/sdk_error.dart';
import '../http/http_client.dart';
import '../models/workflow_models.dart';

class WorkflowService {
  final HttpClient httpClient;
  final Map<String, StreamController<WorkflowRunStatus>> _runStatusControllers = {};

  WorkflowService(this.httpClient);

  /// Get all available workflows
  Future<List<Workflow>> getWorkflows({
    int? page,
    int? limit,
    String? search,
    List<String>? tags,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;
      if (search != null) queryParams['search'] = search;
      if (tags != null) queryParams['tags'] = tags.join(',');

      final response = await httpClient.get<Map<String, dynamic>>(
        '/workflows',
        queryParameters: queryParams,
      );

      final workflows = (response['workflows'] as List)
          .map((json) => Workflow.fromJson(json))
          .toList();

      return workflows;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch workflows', originalError: e);
    }
  }

  /// Get workflow by ID
  Future<Workflow> getWorkflow(String workflowId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/workflows/$workflowId',
      );

      return Workflow.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch workflow', originalError: e);
    }
  }

  /// Execute a workflow
  Future<WorkflowRun> executeWorkflow(
    String workflowId, {
    Map<String, dynamic>? input,
    Map<String, dynamic>? config,
    bool? async,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/workflows/$workflowId/execute',
        data: {
          if (input != null) 'input': input,
          if (config != null) 'config': config,
          if (async != null) 'async': async,
        },
      );

      final workflowRun = WorkflowRun.fromJson(response);

      // Set up status monitoring for this run
      _setupRunStatusMonitoring(workflowRun.id);

      return workflowRun;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to execute workflow', originalError: e);
    }
  }

  /// Get workflow run status
  Future<WorkflowRun> getWorkflowRun(String runId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/workflow-runs/$runId',
      );

      return WorkflowRun.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch workflow run', originalError: e);
    }
  }

  /// Get workflow run history
  Future<List<WorkflowRun>> getWorkflowRunHistory({
    String? workflowId,
    String? status,
    int? page,
    int? limit,
    DateTime? since,
    DateTime? until,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (workflowId != null) queryParams['workflowId'] = workflowId;
      if (status != null) queryParams['status'] = status;
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;
      if (since != null) queryParams['since'] = since.toIso8601String();
      if (until != null) queryParams['until'] = until.toIso8601String();

      final response = await httpClient.get<Map<String, dynamic>>(
        '/workflow-runs',
        queryParameters: queryParams,
      );

      final runs = (response['runs'] as List)
          .map((json) => WorkflowRun.fromJson(json))
          .toList();

      return runs;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch workflow runs', originalError: e);
    }
  }

  /// Cancel a running workflow
  Future<void> cancelWorkflow(String runId) async {
    try {
      await httpClient.post('/workflow-runs/$runId/cancel');
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to cancel workflow', originalError: e);
    }
  }

  /// Retry a failed workflow
  Future<WorkflowRun> retryWorkflow(String runId) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/workflow-runs/$runId/retry',
      );

      return WorkflowRun.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to retry workflow', originalError: e);
    }
  }

  /// Get workflow run logs
  Future<List<WorkflowLog>> getWorkflowLogs(
    String runId, {
    String? level,
    int? page,
    int? limit,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (level != null) queryParams['level'] = level;
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;

      final response = await httpClient.get<Map<String, dynamic>>(
        '/workflow-runs/$runId/logs',
        queryParameters: queryParams,
      );

      final logs = (response['logs'] as List)
          .map((json) => WorkflowLog.fromJson(json))
          .toList();

      return logs;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch workflow logs', originalError: e);
    }
  }

  /// Subscribe to workflow run status updates
  Stream<WorkflowRunStatus> subscribeToWorkflowRun(String runId) {
    if (!_runStatusControllers.containsKey(runId)) {
      _setupRunStatusMonitoring(runId);
    }

    return _runStatusControllers[runId]!.stream;
  }

  /// Unsubscribe from workflow run status updates
  void unsubscribeFromWorkflowRun(String runId) {
    final controller = _runStatusControllers.remove(runId);
    controller?.close();
  }

  void _setupRunStatusMonitoring(String runId) {
    final controller = StreamController<WorkflowRunStatus>.broadcast();
    _runStatusControllers[runId] = controller;

    // Poll for status updates
    Timer.periodic(const Duration(seconds: 2), (timer) async {
      try {
        if (controller.isClosed) {
          timer.cancel();
          return;
        }

        final workflowRun = await getWorkflowRun(runId);
        final status = WorkflowRunStatus(
          runId: runId,
          status: workflowRun.status,
          progress: workflowRun.progress,
          currentStep: workflowRun.currentStep,
          error: workflowRun.error,
          updatedAt: workflowRun.updatedAt,
        );

        controller.add(status);

        // Stop polling if workflow is complete
        if (workflowRun.status == 'completed' || 
            workflowRun.status == 'failed' || 
            workflowRun.status == 'cancelled') {
          timer.cancel();
          
          // Keep controller open for a bit in case client needs final status
          Timer(const Duration(seconds: 10), () {
            _runStatusControllers.remove(runId);
            controller.close();
          });
        }
      } catch (e) {
        if (!controller.isClosed) {
          controller.addError(e);
        }
      }
    });
  }

  /// Create a custom workflow
  Future<Workflow> createWorkflow({
    required String name,
    required String description,
    required Map<String, dynamic> definition,
    List<String>? tags,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/workflows',
        data: {
          'name': name,
          'description': description,
          'definition': definition,
          if (tags != null) 'tags': tags,
          if (metadata != null) 'metadata': metadata,
        },
      );

      return Workflow.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to create workflow', originalError: e);
    }
  }

  /// Update a workflow
  Future<Workflow> updateWorkflow(
    String workflowId, {
    String? name,
    String? description,
    Map<String, dynamic>? definition,
    List<String>? tags,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (name != null) data['name'] = name;
      if (description != null) data['description'] = description;
      if (definition != null) data['definition'] = definition;
      if (tags != null) data['tags'] = tags;
      if (metadata != null) data['metadata'] = metadata;

      final response = await httpClient.put<Map<String, dynamic>>(
        '/workflows/$workflowId',
        data: data,
      );

      return Workflow.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to update workflow', originalError: e);
    }
  }

  /// Delete a workflow
  Future<void> deleteWorkflow(String workflowId) async {
    try {
      await httpClient.delete('/workflows/$workflowId');
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to delete workflow', originalError: e);
    }
  }

  /// Validate workflow definition
  Future<WorkflowValidationResult> validateWorkflow(
    Map<String, dynamic> definition,
  ) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/workflows/validate',
        data: {'definition': definition},
      );

      return WorkflowValidationResult.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to validate workflow', originalError: e);
    }
  }

  /// Get workflow templates
  Future<List<WorkflowTemplate>> getWorkflowTemplates({
    String? category,
    String? search,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (category != null) queryParams['category'] = category;
      if (search != null) queryParams['search'] = search;

      final response = await httpClient.get<Map<String, dynamic>>(
        '/workflow-templates',
        queryParameters: queryParams,
      );

      final templates = (response['templates'] as List)
          .map((json) => WorkflowTemplate.fromJson(json))
          .toList();

      return templates;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to fetch workflow templates', originalError: e);
    }
  }

  /// Create workflow from template
  Future<Workflow> createFromTemplate(
    String templateId, {
    required String name,
    Map<String, dynamic>? parameters,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/workflow-templates/$templateId/create',
        data: {
          'name': name,
          if (parameters != null) 'parameters': parameters,
        },
      );

      return Workflow.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to create workflow from template', originalError: e);
    }
  }

  /// Dispose resources
  void dispose() {
    for (final controller in _runStatusControllers.values) {
      controller.close();
    }
    _runStatusControllers.clear();
  }
}