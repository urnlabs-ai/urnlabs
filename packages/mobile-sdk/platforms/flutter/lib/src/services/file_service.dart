import 'dart:io';
import 'dart:typed_data';

import '../core/sdk_error.dart';
import '../http/http_client.dart';
import '../models/file_models.dart';

class FileService {
  final HttpClient httpClient;

  FileService(this.httpClient);

  /// Upload a file
  Future<FileUploadResult> uploadFile(
    File file, {
    String? filename,
    String? description,
    Map<String, dynamic>? metadata,
    Function(int sent, int total)? onProgress,
  }) async {
    try {
      final response = await httpClient.uploadFile<Map<String, dynamic>>(
        '/files/upload',
        file,
        filename: filename,
        data: {
          if (description != null) 'description': description,
          if (metadata != null) 'metadata': metadata,
        },
        onProgress: onProgress,
      );

      return FileUploadResult.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to upload file', originalError: e);
    }
  }

  /// Upload file from bytes
  Future<FileUploadResult> uploadBytes(
    Uint8List bytes,
    String filename, {
    String? mimeType,
    String? description,
    Map<String, dynamic>? metadata,
    Function(int sent, int total)? onProgress,
  }) async {
    try {
      // Create temporary file from bytes
      final tempDir = Directory.systemTemp;
      final tempFile = File('${tempDir.path}/$filename');
      await tempFile.writeAsBytes(bytes);

      try {
        return await uploadFile(
          tempFile,
          filename: filename,
          description: description,
          metadata: metadata,
          onProgress: onProgress,
        );
      } finally {
        // Clean up temporary file
        if (await tempFile.exists()) {
          await tempFile.delete();
        }
      }
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to upload bytes', originalError: e);
    }
  }

  /// Download a file
  Future<void> downloadFile(
    String fileId,
    String savePath, {
    Function(int received, int total)? onProgress,
  }) async {
    try {
      await httpClient.downloadFile(
        '/files/$fileId/download',
        savePath,
        onProgress: onProgress,
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to download file', originalError: e);
    }
  }

  /// Download file as bytes
  Future<Uint8List> downloadBytes(String fileId) async {
    try {
      final response = await httpClient.get<List<int>>(
        '/files/$fileId/download',
      );

      return Uint8List.fromList(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to download file bytes', originalError: e);
    }
  }

  /// Get file information
  Future<FileInfo> getFileInfo(String fileId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/files/$fileId',
      );

      return FileInfo.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to get file info', originalError: e);
    }
  }

  /// List user's files
  Future<List<FileInfo>> listFiles({
    int? page,
    int? limit,
    String? search,
    String? mimeType,
    String? category,
    DateTime? uploadedSince,
    DateTime? uploadedUntil,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;
      if (search != null) queryParams['search'] = search;
      if (mimeType != null) queryParams['mimeType'] = mimeType;
      if (category != null) queryParams['category'] = category;
      if (uploadedSince != null) queryParams['uploadedSince'] = uploadedSince.toIso8601String();
      if (uploadedUntil != null) queryParams['uploadedUntil'] = uploadedUntil.toIso8601String();

      final response = await httpClient.get<Map<String, dynamic>>(
        '/files',
        queryParameters: queryParams,
      );

      final files = (response['files'] as List)
          .map((json) => FileInfo.fromJson(json))
          .toList();

      return files;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to list files', originalError: e);
    }
  }

  /// Update file metadata
  Future<FileInfo> updateFile(
    String fileId, {
    String? filename,
    String? description,
    Map<String, dynamic>? metadata,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (filename != null) data['filename'] = filename;
      if (description != null) data['description'] = description;
      if (metadata != null) data['metadata'] = metadata;

      final response = await httpClient.put<Map<String, dynamic>>(
        '/files/$fileId',
        data: data,
      );

      return FileInfo.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to update file', originalError: e);
    }
  }

  /// Delete a file
  Future<void> deleteFile(String fileId) async {
    try {
      await httpClient.delete('/files/$fileId');
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to delete file', originalError: e);
    }
  }

  /// Generate a signed URL for file access
  Future<String> generateSignedUrl(
    String fileId, {
    Duration? expiresIn,
    String? action, // 'read', 'write', 'delete'
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (expiresIn != null) queryParams['expiresIn'] = expiresIn.inSeconds;
      if (action != null) queryParams['action'] = action;

      final response = await httpClient.post<Map<String, dynamic>>(
        '/files/$fileId/signed-url',
        queryParameters: queryParams,
      );

      return response['url'] as String;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to generate signed URL', originalError: e);
    }
  }

  /// Share a file with other users
  Future<FileShareResult> shareFile(
    String fileId, {
    List<String>? userIds,
    List<String>? emails,
    String? permission, // 'read', 'write', 'admin'
    DateTime? expiresAt,
    String? message,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/files/$fileId/share',
        data: {
          if (userIds != null) 'userIds': userIds,
          if (emails != null) 'emails': emails,
          if (permission != null) 'permission': permission,
          if (expiresAt != null) 'expiresAt': expiresAt.toIso8601String(),
          if (message != null) 'message': message,
        },
      );

      return FileShareResult.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to share file', originalError: e);
    }
  }

  /// Get file sharing information
  Future<List<FileShare>> getFileShares(String fileId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/files/$fileId/shares',
      );

      final shares = (response['shares'] as List)
          .map((json) => FileShare.fromJson(json))
          .toList();

      return shares;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to get file shares', originalError: e);
    }
  }

  /// Revoke file sharing
  Future<void> revokeFileShare(String fileId, String shareId) async {
    try {
      await httpClient.delete('/files/$fileId/shares/$shareId');
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to revoke file share', originalError: e);
    }
  }

  /// Get file usage analytics
  Future<FileAnalytics> getFileAnalytics(
    String fileId, {
    DateTime? startDate,
    DateTime? endDate,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (startDate != null) queryParams['startDate'] = startDate.toIso8601String();
      if (endDate != null) queryParams['endDate'] = endDate.toIso8601String();

      final response = await httpClient.get<Map<String, dynamic>>(
        '/files/$fileId/analytics',
        queryParameters: queryParams,
      );

      return FileAnalytics.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to get file analytics', originalError: e);
    }
  }

  /// Process file with AI (OCR, analysis, etc.)
  Future<FileProcessingResult> processFile(
    String fileId, {
    required String processingType, // 'ocr', 'analyze', 'extract'
    Map<String, dynamic>? options,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/files/$fileId/process',
        data: {
          'processingType': processingType,
          if (options != null) 'options': options,
        },
      );

      return FileProcessingResult.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to process file', originalError: e);
    }
  }

  /// Get file processing status
  Future<FileProcessingStatus> getProcessingStatus(String processingId) async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/file-processing/$processingId',
      );

      return FileProcessingStatus.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to get processing status', originalError: e);
    }
  }

  /// Create a folder
  Future<FolderInfo> createFolder({
    required String name,
    String? parentFolderId,
    String? description,
  }) async {
    try {
      final response = await httpClient.post<Map<String, dynamic>>(
        '/folders',
        data: {
          'name': name,
          if (parentFolderId != null) 'parentFolderId': parentFolderId,
          if (description != null) 'description': description,
        },
      );

      return FolderInfo.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to create folder', originalError: e);
    }
  }

  /// List folders
  Future<List<FolderInfo>> listFolders({
    String? parentFolderId,
    int? page,
    int? limit,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (parentFolderId != null) queryParams['parentFolderId'] = parentFolderId;
      if (page != null) queryParams['page'] = page;
      if (limit != null) queryParams['limit'] = limit;

      final response = await httpClient.get<Map<String, dynamic>>(
        '/folders',
        queryParameters: queryParams,
      );

      final folders = (response['folders'] as List)
          .map((json) => FolderInfo.fromJson(json))
          .toList();

      return folders;
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to list folders', originalError: e);
    }
  }

  /// Move file to folder
  Future<void> moveFileToFolder(String fileId, String? folderId) async {
    try {
      await httpClient.put(
        '/files/$fileId/move',
        data: {'folderId': folderId},
      );
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to move file', originalError: e);
    }
  }

  /// Get storage quota information
  Future<StorageQuota> getStorageQuota() async {
    try {
      final response = await httpClient.get<Map<String, dynamic>>(
        '/storage/quota',
      );

      return StorageQuota.fromJson(response);
    } on SDKError {
      rethrow;
    } catch (e) {
      throw SDKError.unknown('Failed to get storage quota', originalError: e);
    }
  }

  /// Validate file before upload
  bool validateFile(File file, {
    int? maxSizeBytes,
    List<String>? allowedMimeTypes,
  }) {
    // Check file size
    if (maxSizeBytes != null && file.lengthSync() > maxSizeBytes) {
      return false;
    }

    // Check MIME type (basic check based on extension)
    if (allowedMimeTypes != null) {
      final extension = file.path.split('.').last.toLowerCase();
      final mimeType = _getMimeTypeFromExtension(extension);
      if (mimeType != null && !allowedMimeTypes.contains(mimeType)) {
        return false;
      }
    }

    return true;
  }

  String? _getMimeTypeFromExtension(String extension) {
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'json': 'application/json',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'zip': 'application/zip',
    };

    return mimeTypes[extension];
  }
}