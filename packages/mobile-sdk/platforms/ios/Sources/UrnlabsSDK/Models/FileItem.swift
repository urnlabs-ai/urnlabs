import Foundation

/// Represents a file or folder in the Urnlabs platform
public struct FileItem: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let name: String
    public let path: String
    public let type: FileType
    public let mimeType: String?
    public let size: Int
    public let description: String?
    public let folderId: String?
    public let createdBy: String
    public let createdAt: Date
    public let updatedAt: Date
    public let downloadUrl: String?
    public let thumbnailUrl: String?
    public let metadata: FileMetadata?
    public let permissions: FilePermissions
    public let isShared: Bool
    public let shareCount: Int
    public let downloadCount: Int

    public init(
        id: String,
        name: String,
        path: String,
        type: FileType,
        mimeType: String? = nil,
        size: Int,
        description: String? = nil,
        folderId: String? = nil,
        createdBy: String,
        createdAt: Date,
        updatedAt: Date,
        downloadUrl: String? = nil,
        thumbnailUrl: String? = nil,
        metadata: FileMetadata? = nil,
        permissions: FilePermissions = FilePermissions(),
        isShared: Bool = false,
        shareCount: Int = 0,
        downloadCount: Int = 0
    ) {
        self.id = id
        self.name = name
        self.path = path
        self.type = type
        self.mimeType = mimeType
        self.size = size
        self.description = description
        self.folderId = folderId
        self.createdBy = createdBy
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.downloadUrl = downloadUrl
        self.thumbnailUrl = thumbnailUrl
        self.metadata = metadata
        self.permissions = permissions
        self.isShared = isShared
        self.shareCount = shareCount
        self.downloadCount = downloadCount
    }

    // MARK: - Computed Properties

    /// File extension from name
    public var fileExtension: String {
        return (name as NSString).pathExtension.lowercased()
    }

    /// File name without extension
    public var nameWithoutExtension: String {
        return (name as NSString).deletingPathExtension
    }

    /// Human-readable file size
    public var formattedSize: String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(size))
    }

    /// Whether the file is an image
    public var isImage: Bool {
        guard let mimeType = mimeType else {
            return ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].contains(fileExtension)
        }
        return mimeType.hasPrefix("image/")
    }

    /// Whether the file is a video
    public var isVideo: Bool {
        guard let mimeType = mimeType else {
            return ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv"].contains(fileExtension)
        }
        return mimeType.hasPrefix("video/")
    }

    /// Whether the file is audio
    public var isAudio: Bool {
        guard let mimeType = mimeType else {
            return ["mp3", "wav", "aac", "ogg", "m4a", "flac", "wma"].contains(fileExtension)
        }
        return mimeType.hasPrefix("audio/")
    }

    /// Whether the file is a document
    public var isDocument: Bool {
        guard let mimeType = mimeType else {
            return ["pdf", "doc", "docx", "txt", "rtf", "odt", "pages"].contains(fileExtension)
        }
        return mimeType.hasPrefix("application/") || mimeType.hasPrefix("text/")
    }

    /// Whether the file is an archive
    public var isArchive: Bool {
        guard let mimeType = mimeType else {
            return ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].contains(fileExtension)
        }
        return mimeType.contains("zip") || mimeType.contains("archive") || mimeType.contains("compressed")
    }

    /// Whether this is a folder
    public var isFolder: Bool {
        return type == .folder
    }

    /// Icon name for UI representation
    public var iconName: String {
        if isFolder {
            return "folder"
        }

        switch type {
        case .image:
            return "photo"
        case .video:
            return "video"
        case .audio:
            return "music.note"
        case .document:
            return "doc.text"
        case .archive:
            return "archivebox"
        case .folder:
            return "folder"
        case .other:
            return "doc"
        }
    }

    /// Color for UI representation
    public var color: String {
        switch type {
        case .image:
            return "green"
        case .video:
            return "red"
        case .audio:
            return "purple"
        case .document:
            return "blue"
        case .archive:
            return "orange"
        case .folder:
            return "blue"
        case .other:
            return "gray"
        }
    }

    /// Whether the file can be previewed
    public var canPreview: Bool {
        return isImage || isDocument && ["pdf", "txt"].contains(fileExtension)
    }

    /// Whether the file can be shared
    public var canShare: Bool {
        return permissions.canShare
    }

    /// Whether the file can be deleted
    public var canDelete: Bool {
        return permissions.canDelete
    }

    /// Whether the file can be edited
    public var canEdit: Bool {
        return permissions.canEdit
    }
}

/// File permissions for the current user
public struct FilePermissions: Codable, Equatable, Hashable {
    public let canRead: Bool
    public let canWrite: Bool
    public let canDelete: Bool
    public let canShare: Bool
    public let canEdit: Bool
    public let isOwner: Bool

    public init(
        canRead: Bool = true,
        canWrite: Bool = false,
        canDelete: Bool = false,
        canShare: Bool = false,
        canEdit: Bool = false,
        isOwner: Bool = false
    ) {
        self.canRead = canRead
        self.canWrite = canWrite
        self.canDelete = canDelete
        self.canShare = canShare
        self.canEdit = canEdit
        self.isOwner = isOwner
    }

    /// Full permissions (for file owner)
    public static let owner = FilePermissions(
        canRead: true,
        canWrite: true,
        canDelete: true,
        canShare: true,
        canEdit: true,
        isOwner: true
    )

    /// Read-only permissions
    public static let readOnly = FilePermissions(
        canRead: true,
        canWrite: false,
        canDelete: false,
        canShare: false,
        canEdit: false,
        isOwner: false
    )

    /// Editor permissions
    public static let editor = FilePermissions(
        canRead: true,
        canWrite: true,
        canDelete: false,
        canShare: false,
        canEdit: true,
        isOwner: false
    )
}

/// Metadata about a file
public struct FileMetadata: Codable, Equatable, Hashable {
    public let checksum: String?
    public let lastAccessed: Date?
    public let tags: [String]?
    public let customProperties: [String: String]?

    // Media-specific metadata
    public let duration: TimeInterval?
    public let dimensions: FileDimensions?
    public let bitrate: Int?
    public let sampleRate: Int?

    // Document-specific metadata
    public let pageCount: Int?
    public let wordCount: Int?
    public let language: String?
    public let author: String?

    public init(
        checksum: String? = nil,
        lastAccessed: Date? = nil,
        tags: [String]? = nil,
        customProperties: [String: String]? = nil,
        duration: TimeInterval? = nil,
        dimensions: FileDimensions? = nil,
        bitrate: Int? = nil,
        sampleRate: Int? = nil,
        pageCount: Int? = nil,
        wordCount: Int? = nil,
        language: String? = nil,
        author: String? = nil
    ) {
        self.checksum = checksum
        self.lastAccessed = lastAccessed
        self.tags = tags
        self.customProperties = customProperties
        self.duration = duration
        self.dimensions = dimensions
        self.bitrate = bitrate
        self.sampleRate = sampleRate
        self.pageCount = pageCount
        self.wordCount = wordCount
        self.language = language
        self.author = author
    }

    /// Formatted duration for display
    public var formattedDuration: String? {
        guard let duration = duration else { return nil }

        let hours = Int(duration) / 3600
        let minutes = Int(duration % 3600) / 60
        let seconds = Int(duration % 60)

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        } else {
            return String(format: "%d:%02d", minutes, seconds)
        }
    }

    /// Formatted bitrate for display
    public var formattedBitrate: String? {
        guard let bitrate = bitrate else { return nil }

        if bitrate >= 1_000_000 {
            return String(format: "%.1f Mbps", Double(bitrate) / 1_000_000)
        } else {
            return String(format: "%.1f kbps", Double(bitrate) / 1_000)
        }
    }

    /// Formatted sample rate for display
    public var formattedSampleRate: String? {
        guard let sampleRate = sampleRate else { return nil }
        return "\(sampleRate) Hz"
    }
}

/// Dimensions for image/video files
public struct FileDimensions: Codable, Equatable, Hashable {
    public let width: Int
    public let height: Int

    public init(width: Int, height: Int) {
        self.width = width
        self.height = height
    }

    /// Aspect ratio
    public var aspectRatio: Double {
        guard height > 0 else { return 1.0 }
        return Double(width) / Double(height)
    }

    /// Total pixel count
    public var pixelCount: Int {
        return width * height
    }

    /// Formatted resolution for display
    public var formattedResolution: String {
        return "\(width) × \(height)"
    }

    /// Megapixel count for display
    public var megapixels: Double {
        return Double(pixelCount) / 1_000_000
    }

    /// Formatted megapixel count
    public var formattedMegapixels: String {
        return String(format: "%.1f MP", megapixels)
    }
}

/// File sharing information
public struct FileShare: Codable, Identifiable, Equatable, Hashable {
    public let id: String
    public let fileId: String
    public let sharedBy: String
    public let sharedWith: String?
    public let shareType: ShareType
    public let permissions: SharePermissions
    public let expiresAt: Date?
    public let accessCount: Int
    public let lastAccessedAt: Date?
    public let createdAt: Date
    public let isActive: Bool

    public init(
        id: String,
        fileId: String,
        sharedBy: String,
        sharedWith: String? = nil,
        shareType: ShareType,
        permissions: SharePermissions,
        expiresAt: Date? = nil,
        accessCount: Int = 0,
        lastAccessedAt: Date? = nil,
        createdAt: Date,
        isActive: Bool = true
    ) {
        self.id = id
        self.fileId = fileId
        self.sharedBy = sharedBy
        self.sharedWith = sharedWith
        self.shareType = shareType
        self.permissions = permissions
        self.expiresAt = expiresAt
        self.accessCount = accessCount
        self.lastAccessedAt = lastAccessedAt
        self.createdAt = createdAt
        self.isActive = isActive
    }

    /// Whether the share has expired
    public var isExpired: Bool {
        guard let expiresAt = expiresAt else { return false }
        return expiresAt < Date()
    }

    /// Whether the share is currently valid
    public var isValid: Bool {
        return isActive && !isExpired
    }

    /// Time remaining until expiration
    public var timeUntilExpiration: TimeInterval? {
        guard let expiresAt = expiresAt else { return nil }
        let remaining = expiresAt.timeIntervalSinceNow
        return remaining > 0 ? remaining : 0
    }
}

/// Types of file sharing
public enum ShareType: String, Codable, CaseIterable {
    case link = "link"
    case email = "email"
    case user = "user"
    case team = "team"

    public var displayName: String {
        switch self {
        case .link:
            return "Share Link"
        case .email:
            return "Email Share"
        case .user:
            return "User Share"
        case .team:
            return "Team Share"
        }
    }

    /// Icon name for UI
    public var iconName: String {
        switch self {
        case .link:
            return "link"
        case .email:
            return "envelope"
        case .user:
            return "person"
        case .team:
            return "person.3"
        }
    }
}

/// Permissions for shared files
public struct SharePermissions: Codable, Equatable, Hashable {
    public let canView: Bool
    public let canDownload: Bool
    public let canEdit: Bool
    public let canComment: Bool
    public let canReshare: Bool

    public init(
        canView: Bool = true,
        canDownload: Bool = false,
        canEdit: Bool = false,
        canComment: Bool = false,
        canReshare: Bool = false
    ) {
        self.canView = canView
        self.canDownload = canDownload
        self.canEdit = canEdit
        self.canComment = canComment
        self.canReshare = canReshare
    }

    /// View-only permissions
    public static let viewOnly = SharePermissions(
        canView: true,
        canDownload: false,
        canEdit: false,
        canComment: false,
        canReshare: false
    )

    /// Download permissions
    public static let download = SharePermissions(
        canView: true,
        canDownload: true,
        canEdit: false,
        canComment: false,
        canReshare: false
    )

    /// Editor permissions
    public static let editor = SharePermissions(
        canView: true,
        canDownload: true,
        canEdit: true,
        canComment: true,
        canReshare: false
    )

    /// Full permissions
    public static let full = SharePermissions(
        canView: true,
        canDownload: true,
        canEdit: true,
        canComment: true,
        canReshare: true
    )
}

/// File upload progress information
public struct FileUploadProgress: Identifiable {
    public let id: String
    public let fileName: String
    public let totalBytes: Int
    public var uploadedBytes: Int
    public var isCompleted: Bool
    public var error: Error?

    public init(
        id: String,
        fileName: String,
        totalBytes: Int,
        uploadedBytes: Int = 0,
        isCompleted: Bool = false,
        error: Error? = nil
    ) {
        self.id = id
        self.fileName = fileName
        self.totalBytes = totalBytes
        self.uploadedBytes = uploadedBytes
        self.isCompleted = isCompleted
        self.error = error
    }

    /// Upload progress as percentage (0.0 to 1.0)
    public var progress: Double {
        guard totalBytes > 0 else { return 0.0 }
        return Double(uploadedBytes) / Double(totalBytes)
    }

    /// Upload progress as percentage (0 to 100)
    public var progressPercentage: Int {
        return Int(progress * 100)
    }

    /// Formatted progress string
    public var progressString: String {
        let uploaded = ByteCountFormatter().string(fromByteCount: Int64(uploadedBytes))
        let total = ByteCountFormatter().string(fromByteCount: Int64(totalBytes))
        return "\(uploaded) / \(total) (\(progressPercentage)%)"
    }
}