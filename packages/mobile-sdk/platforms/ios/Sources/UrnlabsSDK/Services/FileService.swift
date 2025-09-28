import Foundation
import Combine
import UniformTypeIdentifiers

/// Service responsible for file operations and cloud storage
public class FileService: ObservableObject {
    // MARK: - Published Properties
    @Published public private(set) var files: [FileItem] = []
    @Published public private(set) var uploadProgress: [String: Double] = [:]
    @Published public private(set) var downloadProgress: [String: Double] = [:]
    @Published public private(set) var isLoading = false

    // MARK: - Private Properties
    private let httpClient: HTTPClient
    private let storageAdapter: StorageAdapter
    private var cancellables = Set<AnyCancellable>()
    private let fileManager = FileManager.default
    private let cacheDirectory: URL

    // MARK: - Initialization
    public init(httpClient: HTTPClient, storageAdapter: StorageAdapter) {
        self.httpClient = httpClient
        self.storageAdapter = storageAdapter

        // Create cache directory
        let cachesURL = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        self.cacheDirectory = cachesURL.appendingPathComponent("UrnlabsSDK/Files")

        createCacheDirectoryIfNeeded()
        loadCachedData()
    }

    // MARK: - File Management

    /// Get files with optional filtering
    public func getFiles(
        folderId: String? = nil,
        type: FileType? = nil,
        searchQuery: String? = nil
    ) async throws -> [FileItem] {
        isLoading = true
        defer { isLoading = false }

        var path = "/files"
        var queryParams: [String] = []

        if let folderId = folderId {
            queryParams.append("folder_id=\(folderId)")
        }
        if let type = type {
            queryParams.append("type=\(type.rawValue)")
        }
        if let searchQuery = searchQuery {
            queryParams.append("search=\(searchQuery.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
        }

        if !queryParams.isEmpty {
            path += "?" + queryParams.joined(separator: "&")
        }

        do {
            let response: FileListResponse = try await httpClient.get(path)
            let files = response.files

            await cacheFiles(files)
            await MainActor.run {
                self.files = files
            }

            return files
        } catch {
            // Return cached data if network fails
            if !files.isEmpty {
                return files
            }
            throw mapFileError(error)
        }
    }

    /// Get file by ID
    public func getFile(id: String) async throws -> FileItem {
        // Check cache first
        if let cached = files.first(where: { $0.id == id }) {
            return cached
        }

        do {
            let file: FileItem = try await httpClient.get("/files/\(id)")
            await updateCachedFile(file)
            return file
        } catch {
            throw mapFileError(error)
        }
    }

    /// Upload file from local URL
    public func uploadFile(
        from localURL: URL,
        to folderId: String? = nil,
        name: String? = nil,
        description: String? = nil
    ) async throws -> FileItem {
        let fileId = UUID().uuidString

        // Start progress tracking
        await MainActor.run {
            self.uploadProgress[fileId] = 0.0
        }

        defer {
            Task { @MainActor in
                self.uploadProgress.removeValue(forKey: fileId)
            }
        }

        do {
            // Read file data
            let fileData = try Data(contentsOf: localURL)
            let fileName = name ?? localURL.lastPathComponent
            let mimeType = await getMimeType(for: localURL)

            // Create multipart form data
            let boundary = "Boundary-\(UUID().uuidString)"
            var formData = Data()

            // Add metadata fields
            if let folderId = folderId {
                formData.append("--\(boundary)\r\n".data(using: .utf8)!)
                formData.append("Content-Disposition: form-data; name=\"folder_id\"\r\n\r\n".data(using: .utf8)!)
                formData.append("\(folderId)\r\n".data(using: .utf8)!)
            }

            if let description = description {
                formData.append("--\(boundary)\r\n".data(using: .utf8)!)
                formData.append("Content-Disposition: form-data; name=\"description\"\r\n\r\n".data(using: .utf8)!)
                formData.append("\(description)\r\n".data(using: .utf8)!)
            }

            // Add file data
            formData.append("--\(boundary)\r\n".data(using: .utf8)!)
            formData.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            formData.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            formData.append(fileData)
            formData.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

            // Upload with progress tracking
            let file: FileItem = try await httpClient.upload(
                "/files",
                data: formData,
                contentType: "multipart/form-data; boundary=\(boundary)"
            ) { progress in
                Task { @MainActor in
                    self.uploadProgress[fileId] = progress
                }
            }

            await updateCachedFile(file)
            return file

        } catch {
            throw mapFileError(error)
        }
    }

    /// Upload file from Data
    public func uploadFile(
        data: Data,
        fileName: String,
        mimeType: String,
        to folderId: String? = nil,
        description: String? = nil
    ) async throws -> FileItem {
        let fileId = UUID().uuidString

        await MainActor.run {
            self.uploadProgress[fileId] = 0.0
        }

        defer {
            Task { @MainActor in
                self.uploadProgress.removeValue(forKey: fileId)
            }
        }

        do {
            // Create multipart form data
            let boundary = "Boundary-\(UUID().uuidString)"
            var formData = Data()

            // Add metadata fields
            if let folderId = folderId {
                formData.append("--\(boundary)\r\n".data(using: .utf8)!)
                formData.append("Content-Disposition: form-data; name=\"folder_id\"\r\n\r\n".data(using: .utf8)!)
                formData.append("\(folderId)\r\n".data(using: .utf8)!)
            }

            if let description = description {
                formData.append("--\(boundary)\r\n".data(using: .utf8)!)
                formData.append("Content-Disposition: form-data; name=\"description\"\r\n\r\n".data(using: .utf8)!)
                formData.append("\(description)\r\n".data(using: .utf8)!)
            }

            // Add file data
            formData.append("--\(boundary)\r\n".data(using: .utf8)!)
            formData.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
            formData.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            formData.append(data)
            formData.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

            let file: FileItem = try await httpClient.upload(
                "/files",
                data: formData,
                contentType: "multipart/form-data; boundary=\(boundary)"
            ) { progress in
                Task { @MainActor in
                    self.uploadProgress[fileId] = progress
                }
            }

            await updateCachedFile(file)
            return file

        } catch {
            throw mapFileError(error)
        }
    }

    /// Download file to local cache
    public func downloadFile(id: String) async throws -> URL {
        // Check if already cached
        let cachedURL = cacheDirectory.appendingPathComponent(id)
        if fileManager.fileExists(atPath: cachedURL.path) {
            return cachedURL
        }

        await MainActor.run {
            self.downloadProgress[id] = 0.0
        }

        defer {
            Task { @MainActor in
                self.downloadProgress.removeValue(forKey: id)
            }
        }

        do {
            let data = try await httpClient.download("/files/\(id)/download") { progress in
                Task { @MainActor in
                    self.downloadProgress[id] = progress
                }
            }

            try data.write(to: cachedURL)
            return cachedURL

        } catch {
            throw mapFileError(error)
        }
    }

    /// Get download URL for file
    public func getDownloadURL(id: String) async throws -> URL {
        do {
            let response: DownloadURLResponse = try await httpClient.get("/files/\(id)/download-url")
            guard let url = URL(string: response.url) else {
                throw SDKError.invalidResponse
            }
            return url
        } catch {
            throw mapFileError(error)
        }
    }

    /// Delete file
    public func deleteFile(id: String) async throws {
        isLoading = true
        defer { isLoading = false }

        do {
            _ = try await httpClient.delete("/files/\(id)")

            // Remove from cache
            await removeCachedFile(id)

            // Remove local cached file
            let cachedURL = cacheDirectory.appendingPathComponent(id)
            try? fileManager.removeItem(at: cachedURL)

        } catch {
            throw mapFileError(error)
        }
    }

    /// Update file metadata
    public func updateFile(id: String, request: UpdateFileRequest) async throws -> FileItem {
        isLoading = true
        defer { isLoading = false }

        do {
            let file: FileItem = try await httpClient.put("/files/\(id)", body: request)
            await updateCachedFile(file)
            return file
        } catch {
            throw mapFileError(error)
        }
    }

    // MARK: - Folder Management

    /// Create folder
    public func createFolder(name: String, parentId: String? = nil) async throws -> FileItem {
        let request = CreateFolderRequest(name: name, parentId: parentId)

        do {
            let folder: FileItem = try await httpClient.post("/folders", body: request)
            await updateCachedFile(folder)
            return folder
        } catch {
            throw mapFileError(error)
        }
    }

    /// Get folder contents
    public func getFolderContents(id: String) async throws -> [FileItem] {
        return try await getFiles(folderId: id)
    }

    // MARK: - Sharing

    /// Share file with others
    public func shareFile(id: String, request: ShareFileRequest) async throws -> ShareResult {
        do {
            let result: ShareResult = try await httpClient.post("/files/\(id)/share", body: request)
            return result
        } catch {
            throw mapFileError(error)
        }
    }

    /// Get file sharing info
    public func getFileSharing(id: String) async throws -> [SharePermission] {
        do {
            let response: ShareListResponse = try await httpClient.get("/files/\(id)/share")
            return response.permissions
        } catch {
            throw mapFileError(error)
        }
    }

    // MARK: - Search and Filters

    /// Search files
    public func searchFiles(query: String, filters: SearchFilters? = nil) async throws -> [FileItem] {
        var path = "/files/search?q=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"

        if let filters = filters {
            if let type = filters.type {
                path += "&type=\(type.rawValue)"
            }
            if let minSize = filters.minSize {
                path += "&min_size=\(minSize)"
            }
            if let maxSize = filters.maxSize {
                path += "&max_size=\(maxSize)"
            }
            if let dateFrom = filters.dateFrom {
                path += "&date_from=\(ISO8601DateFormatter().string(from: dateFrom))"
            }
            if let dateTo = filters.dateTo {
                path += "&date_to=\(ISO8601DateFormatter().string(from: dateTo))"
            }
        }

        do {
            let response: FileListResponse = try await httpClient.get(path)
            return response.files
        } catch {
            throw mapFileError(error)
        }
    }

    // MARK: - Private Methods

    private func createCacheDirectoryIfNeeded() {
        try? fileManager.createDirectory(
            at: cacheDirectory,
            withIntermediateDirectories: true,
            attributes: nil
        )
    }

    private func loadCachedData() {
        Task {
            if let fileData = await storageAdapter.getValue(for: "cached_files"),
               let files = try? JSONDecoder().decode([FileItem].self, from: fileData.data(using: .utf8)!) {
                await MainActor.run {
                    self.files = files
                }
            }
        }
    }

    private func cacheFiles(_ files: [FileItem]) async {
        if let data = try? JSONEncoder().encode(files),
           let jsonString = String(data: data, encoding: .utf8) {
            await storageAdapter.setValue(jsonString, for: "cached_files")
        }
    }

    private func updateCachedFile(_ file: FileItem) async {
        await MainActor.run {
            if let index = self.files.firstIndex(where: { $0.id == file.id }) {
                self.files[index] = file
            } else {
                self.files.append(file)
            }
        }
        await cacheFiles(files)
    }

    private func removeCachedFile(_ id: String) async {
        await MainActor.run {
            self.files.removeAll { $0.id == id }
        }
        await cacheFiles(files)
    }

    private func getMimeType(for url: URL) async -> String {
        if let type = UTType(filenameExtension: url.pathExtension) {
            return type.preferredMIMEType ?? "application/octet-stream"
        }
        return "application/octet-stream"
    }

    private func mapFileError(_ error: Error) -> SDKError {
        if let httpError = error as? HTTPError {
            switch httpError.statusCode {
            case 401:
                return .unauthorized(httpError.message)
            case 403:
                return .forbidden
            case 404:
                return .fileNotFound
            case 409:
                return .fileAlreadyExists
            case 413:
                return .fileTooLarge
            case 415:
                return .unsupportedFileType
            case 507:
                return .storageQuotaExceeded
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

public struct UpdateFileRequest: Codable {
    let name: String?
    let description: String?
    let folderId: String?
}

public struct CreateFolderRequest: Codable {
    let name: String
    let parentId: String?
}

public struct ShareFileRequest: Codable {
    let emails: [String]
    let permission: SharePermissionType
    let message: String?
}

public struct FileListResponse: Codable {
    let files: [FileItem]
    let totalCount: Int
    let hasMore: Bool
}

public struct DownloadURLResponse: Codable {
    let url: String
    let expiresAt: Date
}

public struct ShareResult: Codable {
    let shareId: String
    let shareURL: String
    let expiresAt: Date?
}

public struct ShareListResponse: Codable {
    let permissions: [SharePermission]
}

public struct SharePermission: Codable {
    let id: String
    let email: String
    let permission: SharePermissionType
    let createdAt: Date
}

public struct SearchFilters {
    let type: FileType?
    let minSize: Int?
    let maxSize: Int?
    let dateFrom: Date?
    let dateTo: Date?

    public init(
        type: FileType? = nil,
        minSize: Int? = nil,
        maxSize: Int? = nil,
        dateFrom: Date? = nil,
        dateTo: Date? = nil
    ) {
        self.type = type
        self.minSize = minSize
        self.maxSize = maxSize
        self.dateFrom = dateFrom
        self.dateTo = dateTo
    }
}

// MARK: - Supporting Types

public enum FileType: String, Codable, CaseIterable {
    case document = "document"
    case image = "image"
    case video = "video"
    case audio = "audio"
    case archive = "archive"
    case folder = "folder"
    case other = "other"
}

public enum SharePermissionType: String, Codable {
    case read = "read"
    case write = "write"
    case admin = "admin"
}