/**
 * React Native file operations hook with upload/download capabilities
 */

import { useState, useCallback } from 'react';
import RNFS from 'react-native-fs';
import DocumentPicker from 'react-native-document-picker';
import { launchImageLibrary, launchCamera, ImagePickerResponse, MediaType } from 'react-native-image-picker';
import { useUrnlabsSDK } from './useUrnlabsSDK';
import { useOfflineData } from './useOfflineData';

export interface FileUploadOptions {
  onProgress?: (progress: number) => void;
  resumable?: boolean;
  quality?: number; // For images (0-1)
  maxWidth?: number; // For images
  maxHeight?: number; // For images
}

export interface FileDownloadOptions {
  onProgress?: (progress: number) => void;
  resumable?: boolean;
  destination?: string; // Local file path
}

export interface FileInfo {
  id: string;
  name: string;
  size: number;
  type: string;
  uri: string;
  uploadedAt?: string;
  localPath?: string;
}

export interface UploadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface DownloadProgress {
  fileId: string;
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  localPath?: string;
  error?: string;
}

/**
 * Main file operations hook
 */
export function useFileOperations() {
  const { sdk } = useUrnlabsSDK();
  const { queueOperation, isOnline } = useOfflineData();
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [downloads, setDownloads] = useState<Map<string, DownloadProgress>>(new Map());

  // Generate unique file ID
  const generateFileId = useCallback(() => {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Update upload progress
  const updateUploadProgress = useCallback((fileId: string, update: Partial<UploadProgress>) => {
    setUploads(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(fileId) || { fileId, progress: 0, status: 'pending' as const };
      newMap.set(fileId, { ...current, ...update });
      return newMap;
    });
  }, []);

  // Update download progress
  const updateDownloadProgress = useCallback((fileId: string, update: Partial<DownloadProgress>) => {
    setDownloads(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(fileId) || { fileId, progress: 0, status: 'pending' as const };
      newMap.set(fileId, { ...current, ...update });
      return newMap;
    });
  }, []);

  // Pick files from device
  const pickFile = useCallback(async (options: {
    type?: string[];
    allowMultiSelection?: boolean;
  } = {}): Promise<FileInfo[]> => {
    try {
      const result = await DocumentPicker.pick({
        type: options.type || [DocumentPicker.types.allFiles],
        allowMultiSelection: options.allowMultiSelection || false,
      });

      return result.map(file => ({
        id: generateFileId(),
        name: file.name || 'unknown',
        size: file.size || 0,
        type: file.type || 'application/octet-stream',
        uri: file.uri,
        localPath: file.uri
      }));
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        return [];
      }
      throw error;
    }
  }, [generateFileId]);

  // Pick image from camera or gallery
  const pickImage = useCallback(async (options: {
    source?: 'camera' | 'gallery';
    quality?: number;
    maxWidth?: number;
    maxHeight?: number;
    mediaType?: MediaType;
  } = {}): Promise<FileInfo | null> => {
    const imageOptions = {
      quality: options.quality || 0.8,
      maxWidth: options.maxWidth || 2048,
      maxHeight: options.maxHeight || 2048,
      mediaType: options.mediaType || ('photo' as MediaType),
      includeBase64: false,
    };

    return new Promise((resolve, reject) => {
      const callback = (response: ImagePickerResponse) => {
        if (response.didCancel) {
          resolve(null);
          return;
        }

        if (response.errorMessage) {
          reject(new Error(response.errorMessage));
          return;
        }

        const asset = response.assets?.[0];
        if (!asset) {
          resolve(null);
          return;
        }

        resolve({
          id: generateFileId(),
          name: asset.fileName || 'image.jpg',
          size: asset.fileSize || 0,
          type: asset.type || 'image/jpeg',
          uri: asset.uri || '',
          localPath: asset.uri
        });
      };

      if (options.source === 'camera') {
        launchCamera(imageOptions, callback);
      } else {
        launchImageLibrary(imageOptions, callback);
      }
    });
  }, [generateFileId]);

  // Upload file
  const uploadFile = useCallback(async (
    file: FileInfo,
    options: FileUploadOptions = {}
  ): Promise<FileInfo> => {
    const fileId = file.id;

    updateUploadProgress(fileId, {
      status: 'pending',
      progress: 0
    });

    try {
      if (!isOnline) {
        // Queue upload for when online
        await queueOperation('CREATE', '/api/files/upload', {
          file: {
            name: file.name,
            type: file.type,
            size: file.size,
            localPath: file.localPath
          }
        });

        updateUploadProgress(fileId, {
          status: 'completed',
          progress: 100
        });

        return file;
      }

      updateUploadProgress(fileId, {
        status: 'uploading',
        progress: 0
      });

      // Create upload request
      const uploadData = new FormData();
      uploadData.append('file', {
        uri: file.uri,
        type: file.type,
        name: file.name
      } as any);

      // Upload with progress tracking
      const response = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            updateUploadProgress(fileId, { progress });
            options.onProgress?.(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (error) {
              reject(new Error('Invalid response format'));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', `${sdk.config.apiUrl}/api/files/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${sdk.auth.getAccessToken()}`);
        xhr.send(uploadData);
      });

      const uploadedFile: FileInfo = {
        ...file,
        id: response.data.id,
        uri: response.data.url,
        uploadedAt: response.data.uploadedAt
      };

      updateUploadProgress(fileId, {
        status: 'completed',
        progress: 100
      });

      return uploadedFile;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      updateUploadProgress(fileId, {
        status: 'failed',
        error: errorMessage
      });

      throw error;
    }
  }, [sdk, isOnline, queueOperation, updateUploadProgress]);

  // Download file
  const downloadFile = useCallback(async (
    fileId: string,
    url: string,
    options: FileDownloadOptions = {}
  ): Promise<string> => {
    const destination = options.destination || `${RNFS.DocumentDirectoryPath}/${fileId}`;

    updateDownloadProgress(fileId, {
      status: 'pending',
      progress: 0
    });

    try {
      updateDownloadProgress(fileId, {
        status: 'downloading',
        progress: 0
      });

      // Download with progress tracking
      const downloadOptions = {
        fromUrl: url,
        toFile: destination,
        headers: {
          Authorization: `Bearer ${sdk.auth.getAccessToken()}`
        },
        progress: (res: any) => {
          const progress = Math.round((res.bytesWritten / res.contentLength) * 100);
          updateDownloadProgress(fileId, { progress });
          options.onProgress?.(progress);
        }
      };

      const result = await RNFS.downloadFile(downloadOptions).promise;

      if (result.statusCode === 200) {
        updateDownloadProgress(fileId, {
          status: 'completed',
          progress: 100,
          localPath: destination
        });

        return destination;
      } else {
        throw new Error(`Download failed with status ${result.statusCode}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';

      updateDownloadProgress(fileId, {
        status: 'failed',
        error: errorMessage
      });

      throw error;
    }
  }, [sdk, updateDownloadProgress]);

  // Cancel upload
  const cancelUpload = useCallback((fileId: string) => {
    updateUploadProgress(fileId, {
      status: 'cancelled'
    });
  }, [updateUploadProgress]);

  // Cancel download
  const cancelDownload = useCallback((fileId: string) => {
    updateDownloadProgress(fileId, {
      status: 'cancelled'
    });
  }, [updateDownloadProgress]);

  // Remove upload from list
  const removeUpload = useCallback((fileId: string) => {
    setUploads(prev => {
      const newMap = new Map(prev);
      newMap.delete(fileId);
      return newMap;
    });
  }, []);

  // Remove download from list
  const removeDownload = useCallback((fileId: string) => {
    setDownloads(prev => {
      const newMap = new Map(prev);
      newMap.delete(fileId);
      return newMap;
    });
  }, []);

  // Get file info
  const getFileInfo = useCallback(async (filePath: string) => {
    try {
      const stat = await RNFS.stat(filePath);
      return {
        name: stat.name,
        size: stat.size,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        mtime: stat.mtime,
        path: stat.path
      };
    } catch (error) {
      throw new Error(`File not found: ${filePath}`);
    }
  }, []);

  // Delete file
  const deleteFile = useCallback(async (filePath: string) => {
    try {
      await RNFS.unlink(filePath);
    } catch (error) {
      throw new Error(`Failed to delete file: ${filePath}`);
    }
  }, []);

  return {
    // File selection
    pickFile,
    pickImage,

    // Upload operations
    uploadFile,
    uploads: Array.from(uploads.values()),
    cancelUpload,
    removeUpload,

    // Download operations
    downloadFile,
    downloads: Array.from(downloads.values()),
    cancelDownload,
    removeDownload,

    // File management
    getFileInfo,
    deleteFile,

    // State
    hasActiveUploads: Array.from(uploads.values()).some(u => u.status === 'uploading'),
    hasActiveDownloads: Array.from(downloads.values()).some(d => d.status === 'downloading')
  };
}