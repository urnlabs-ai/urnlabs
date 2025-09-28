/// File models for Flutter SDK
import 'package:json_annotation/json_annotation.dart';

part 'file_models.g.dart';

/// File upload result
@JsonSerializable()
class FileUploadResult {
  final String id;
  final String filename;
  final String mimeType;
  final int size;
  final String url;
  final String? thumbnailUrl;
  final Map<String, dynamic>? metadata;
  final DateTime uploadedAt;

  FileUploadResult({
    required this.id,
    required this.filename,
    required this.mimeType,
    required this.size,
    required this.url,
    this.thumbnailUrl,
    this.metadata,
    required this.uploadedAt,
  });

  factory FileUploadResult.fromJson(Map<String, dynamic> json) => _$FileUploadResultFromJson(json);
  Map<String, dynamic> toJson() => _$FileUploadResultToJson(this);
}

/// File information
@JsonSerializable()
class FileInfo {
  final String id;
  final String filename;
  final String originalFilename;
  final String mimeType;
  final int size;
  final String? description;
  final String? category;
  final List<String> tags;
  final String url;
  final String? thumbnailUrl;
  final String? folderId;
  final Map<String, dynamic>? metadata;
  final String uploadedBy;
  final DateTime uploadedAt;
  final DateTime? updatedAt;
  final bool isPublic;
  final DateTime? expiresAt;

  FileInfo({
    required this.id,
    required this.filename,
    required this.originalFilename,
    required this.mimeType,
    required this.size,
    this.description,
    this.category,
    required this.tags,
    required this.url,
    this.thumbnailUrl,
    this.folderId,
    this.metadata,
    required this.uploadedBy,
    required this.uploadedAt,
    this.updatedAt,
    required this.isPublic,
    this.expiresAt,
  });

  factory FileInfo.fromJson(Map<String, dynamic> json) => _$FileInfoFromJson(json);
  Map<String, dynamic> toJson() => _$FileInfoToJson(this);

  bool get isImage => mimeType.startsWith('image/');
  bool get isVideo => mimeType.startsWith('video/');
  bool get isAudio => mimeType.startsWith('audio/');
  bool get isDocument => mimeType.startsWith('application/') || mimeType.startsWith('text/');
  
  String get sizeFormatted => _formatFileSize(size);
  
  bool get isExpired => expiresAt != null && DateTime.now().isAfter(expiresAt!);
}

/// File share result
@JsonSerializable()
class FileShareResult {
  final List<FileShare> shares;
  final String shareUrl;
  final DateTime expiresAt;

  FileShareResult({
    required this.shares,
    required this.shareUrl,
    required this.expiresAt,
  });

  factory FileShareResult.fromJson(Map<String, dynamic> json) => _$FileShareResultFromJson(json);
  Map<String, dynamic> toJson() => _$FileShareResultToJson(this);
}

/// File share
@JsonSerializable()
class FileShare {
  final String id;
  final String fileId;
  final String? userId;
  final String? email;
  final String permission; // 'read', 'write', 'admin'
  final DateTime createdAt;
  final DateTime? expiresAt;
  final String createdBy;

  FileShare({
    required this.id,
    required this.fileId,
    this.userId,
    this.email,
    required this.permission,
    required this.createdAt,
    this.expiresAt,
    required this.createdBy,
  });

  factory FileShare.fromJson(Map<String, dynamic> json) => _$FileShareFromJson(json);
  Map<String, dynamic> toJson() => _$FileShareToJson(this);

  bool get isExpired => expiresAt != null && DateTime.now().isAfter(expiresAt!);
}

/// File analytics
@JsonSerializable()
class FileAnalytics {
  final String fileId;
  final int totalViews;
  final int totalDownloads;
  final int uniqueViewers;
  final Map<String, int> viewsByDate;
  final Map<String, int> downloadsByDate;
  final List<FileAccessLog> recentAccess;
  final DateTime? lastAccess;

  FileAnalytics({
    required this.fileId,
    required this.totalViews,
    required this.totalDownloads,
    required this.uniqueViewers,
    required this.viewsByDate,
    required this.downloadsByDate,
    required this.recentAccess,
    this.lastAccess,
  });

  factory FileAnalytics.fromJson(Map<String, dynamic> json) => _$FileAnalyticsFromJson(json);
  Map<String, dynamic> toJson() => _$FileAnalyticsToJson(this);
}

/// File access log
@JsonSerializable()
class FileAccessLog {
  final String id;
  final String fileId;
  final String? userId;
  final String action; // 'view', 'download', 'share'
  final String ipAddress;
  final String userAgent;
  final DateTime timestamp;

  FileAccessLog({
    required this.id,
    required this.fileId,
    this.userId,
    required this.action,
    required this.ipAddress,
    required this.userAgent,
    required this.timestamp,
  });

  factory FileAccessLog.fromJson(Map<String, dynamic> json) => _$FileAccessLogFromJson(json);
  Map<String, dynamic> toJson() => _$FileAccessLogToJson(this);
}

/// File processing result
@JsonSerializable()
class FileProcessingResult {
  final String id;
  final String fileId;
  final String processingType;
  final String status;
  final Map<String, dynamic>? result;
  final Map<String, dynamic>? error;
  final DateTime startedAt;
  final DateTime? completedAt;

  FileProcessingResult({
    required this.id,
    required this.fileId,
    required this.processingType,
    required this.status,
    this.result,
    this.error,
    required this.startedAt,
    this.completedAt,
  });

  factory FileProcessingResult.fromJson(Map<String, dynamic> json) => _$FileProcessingResultFromJson(json);
  Map<String, dynamic> toJson() => _$FileProcessingResultToJson(this);

  bool get isCompleted => status == 'completed';
  bool get isFailed => status == 'failed';
  bool get isProcessing => status == 'processing';
  bool get isPending => status == 'pending';
}

/// File processing status
@JsonSerializable()
class FileProcessingStatus {
  final String id;
  final String status;
  final double? progress;
  final String? currentStep;
  final Map<String, dynamic>? error;
  final DateTime? estimatedCompletion;

  FileProcessingStatus({
    required this.id,
    required this.status,
    this.progress,
    this.currentStep,
    this.error,
    this.estimatedCompletion,
  });

  factory FileProcessingStatus.fromJson(Map<String, dynamic> json) => _$FileProcessingStatusFromJson(json);
  Map<String, dynamic> toJson() => _$FileProcessingStatusToJson(this);
}

/// Folder information
@JsonSerializable()
class FolderInfo {
  final String id;
  final String name;
  final String? description;
  final String? parentFolderId;
  final String path;
  final int fileCount;
  final int folderCount;
  final int totalSize;
  final String createdBy;
  final DateTime createdAt;
  final DateTime? updatedAt;

  FolderInfo({
    required this.id,
    required this.name,
    this.description,
    this.parentFolderId,
    required this.path,
    required this.fileCount,
    required this.folderCount,
    required this.totalSize,
    required this.createdBy,
    required this.createdAt,
    this.updatedAt,
  });

  factory FolderInfo.fromJson(Map<String, dynamic> json) => _$FolderInfoFromJson(json);
  Map<String, dynamic> toJson() => _$FolderInfoToJson(this);

  String get sizeFormatted => _formatFileSize(totalSize);
}

/// Storage quota
@JsonSerializable()
class StorageQuota {
  final int totalBytes;
  final int usedBytes;
  final int availableBytes;
  final double usagePercentage;
  final Map<String, int> usageByType;
  final DateTime? lastUpdated;

  StorageQuota({
    required this.totalBytes,
    required this.usedBytes,
    required this.availableBytes,
    required this.usagePercentage,
    required this.usageByType,
    this.lastUpdated,
  });

  factory StorageQuota.fromJson(Map<String, dynamic> json) => _$StorageQuotaFromJson(json);
  Map<String, dynamic> toJson() => _$StorageQuotaToJson(this);

  String get totalFormatted => _formatFileSize(totalBytes);
  String get usedFormatted => _formatFileSize(usedBytes);
  String get availableFormatted => _formatFileSize(availableBytes);
  
  bool get isNearLimit => usagePercentage > 80;
  bool get isOverLimit => usagePercentage >= 100;
}

/// File filter options
@JsonSerializable()
class FileFilter {
  final String? mimeType;
  final String? category;
  final List<String>? tags;
  final int? minSize;
  final int? maxSize;
  final DateTime? uploadedSince;
  final DateTime? uploadedUntil;
  final String? uploadedBy;
  final bool? isPublic;

  FileFilter({
    this.mimeType,
    this.category,
    this.tags,
    this.minSize,
    this.maxSize,
    this.uploadedSince,
    this.uploadedUntil,
    this.uploadedBy,
    this.isPublic,
  });

  factory FileFilter.fromJson(Map<String, dynamic> json) => _$FileFilterFromJson(json);
  Map<String, dynamic> toJson() => _$FileFilterToJson(this);
}

/// File sort options
enum FileSortBy {
  @JsonValue('name')
  name,
  @JsonValue('size')
  size,
  @JsonValue('uploadedAt')
  uploadedAt,
  @JsonValue('updatedAt')
  updatedAt,
  @JsonValue('type')
  type,
}

enum SortOrder {
  @JsonValue('asc')
  ascending,
  @JsonValue('desc')
  descending,
}

/// File validation result
class FileValidationResult {
  final bool isValid;
  final List<String> errors;
  final List<String> warnings;

  FileValidationResult({
    required this.isValid,
    required this.errors,
    required this.warnings,
  });
}

/// Helper function to format file size
String _formatFileSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
  if (bytes < 1024 * 1024 * 1024) return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
}