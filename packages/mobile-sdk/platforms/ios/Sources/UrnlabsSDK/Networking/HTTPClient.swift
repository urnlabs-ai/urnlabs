import Foundation
import Combine
import Network

/// HTTP client for Urnlabs SDK using URLSession and Combine
public final class HTTPClient: NSObject {
    
    // MARK: - Properties
    
    private let config: SDKConfig
    private let storage: StorageAdapter
    private let session: URLSession
    private let sessionDelegate: HTTPClientDelegate
    
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    public init(config: SDKConfig, storage: StorageAdapter) {
        self.config = config
        self.storage = storage
        self.sessionDelegate = HTTPClientDelegate(config: config)
        
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = config.timeout
        configuration.timeoutIntervalForResource = config.timeout * 2
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        
        self.session = URLSession(
            configuration: configuration,
            delegate: sessionDelegate,
            delegateQueue: nil
        )
        
        super.init()
    }
    
    // MARK: - Public API
    
    /// Perform GET request
    public func get<T: Decodable>(
        _ path: String,
        parameters: [String: Any]? = nil,
        headers: [String: String]? = nil,
        responseType: T.Type
    ) -> AnyPublisher<T, SDKError> {
        request(
            method: .GET,
            path: path,
            parameters: parameters,
            headers: headers,
            responseType: responseType
        )
    }
    
    /// Perform POST request
    public func post<T: Decodable>(
        _ path: String,
        body: Data? = nil,
        parameters: [String: Any]? = nil,
        headers: [String: String]? = nil,
        responseType: T.Type
    ) -> AnyPublisher<T, SDKError> {
        request(
            method: .POST,
            path: path,
            body: body,
            parameters: parameters,
            headers: headers,
            responseType: responseType
        )
    }
    
    /// Perform PUT request
    public func put<T: Decodable>(
        _ path: String,
        body: Data? = nil,
        parameters: [String: Any]? = nil,
        headers: [String: String]? = nil,
        responseType: T.Type
    ) -> AnyPublisher<T, SDKError> {
        request(
            method: .PUT,
            path: path,
            body: body,
            parameters: parameters,
            headers: headers,
            responseType: responseType
        )
    }
    
    /// Perform DELETE request
    public func delete<T: Decodable>(
        _ path: String,
        parameters: [String: Any]? = nil,
        headers: [String: String]? = nil,
        responseType: T.Type
    ) -> AnyPublisher<T, SDKError> {
        request(
            method: .DELETE,
            path: path,
            parameters: parameters,
            headers: headers,
            responseType: responseType
        )
    }
    
    /// Upload file
    public func uploadFile<T: Decodable>(
        _ path: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
        additionalData: [String: Any]? = nil,
        headers: [String: String]? = nil,
        responseType: T.Type,
        progressHandler: ((Double) -> Void)? = nil
    ) -> AnyPublisher<T, SDKError> {
        
        return Future<T, SDKError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("HTTPClient deallocated", nil)))
                return
            }
            
            Task {
                do {
                    let url = try self.buildURL(path: path)
                    var request = URLRequest(url: url)
                    request.httpMethod = "POST"
                    
                    // Set headers
                    await self.setHeaders(&request, additional: headers)
                    
                    // Create multipart form data
                    let boundary = UUID().uuidString
                    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
                    
                    let body = self.createMultipartBody(
                        boundary: boundary,
                        fileData: fileData,
                        fileName: fileName,
                        mimeType: mimeType,
                        additionalData: additionalData
                    )
                    
                    // Create upload task
                    let task = self.session.uploadTask(with: request, from: body) { data, response, error in
                        if let error = error {
                            promise(.failure(.uploadFailed(error.localizedDescription)))
                            return
                        }
                        
                        guard let httpResponse = response as? HTTPURLResponse else {
                            promise(.failure(.invalidResponse))
                            return
                        }
                        
                        guard let data = data else {
                            promise(.failure(.invalidData("No data received")))
                            return
                        }
                        
                        do {
                            if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                                let result = try JSONDecoder().decode(T.self, from: data)
                                promise(.success(result))
                            } else {
                                let error = self.handleHTTPError(httpResponse, data: data)
                                promise(.failure(error))
                            }
                        } catch {
                            promise(.failure(.decodingFailed(error.localizedDescription)))
                        }
                    }
                    
                    task.resume()
                    
                } catch {
                    promise(.failure(.operationFailed(error.localizedDescription)))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    /// Download file
    public func downloadFile(
        from url: URL,
        to destinationURL: URL,
        progressHandler: ((Double) -> Void)? = nil
    ) -> AnyPublisher<URL, SDKError> {
        
        return Future<URL, SDKError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("HTTPClient deallocated", nil)))
                return
            }
            
            let task = self.session.downloadTask(with: url) { tempURL, response, error in
                if let error = error {
                    promise(.failure(.downloadFailed(error.localizedDescription)))
                    return
                }
                
                guard let tempURL = tempURL else {
                    promise(.failure(.downloadFailed("No file downloaded")))
                    return
                }
                
                do {
                    // Move file to destination
                    if FileManager.default.fileExists(atPath: destinationURL.path) {
                        try FileManager.default.removeItem(at: destinationURL)
                    }
                    
                    try FileManager.default.moveItem(at: tempURL, to: destinationURL)
                    promise(.success(destinationURL))
                } catch {
                    promise(.failure(.downloadFailed(error.localizedDescription)))
                }
            }
            
            task.resume()
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func request<T: Decodable>(
        method: HTTPMethod,
        path: String,
        body: Data? = nil,
        parameters: [String: Any]? = nil,
        headers: [String: String]? = nil,
        responseType: T.Type
    ) -> AnyPublisher<T, SDKError> {
        
        return Future<T, SDKError> { [weak self] promise in
            guard let self = self else {
                promise(.failure(.unknown("HTTPClient deallocated", nil)))
                return
            }
            
            Task {
                do {
                    var url = try self.buildURL(path: path)
                    
                    // Add query parameters for GET requests
                    if method == .GET, let parameters = parameters {
                        url = try self.addQueryParameters(to: url, parameters: parameters)
                    }
                    
                    var request = URLRequest(url: url)
                    request.httpMethod = method.rawValue
                    
                    // Set headers
                    await self.setHeaders(&request, additional: headers)
                    
                    // Set body for non-GET requests
                    if method != .GET {
                        if let body = body {
                            request.httpBody = body
                        } else if let parameters = parameters {
                            request.httpBody = try JSONSerialization.data(withJSONObject: parameters)
                            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                        }
                    }
                    
                    // Perform request with retry logic
                    let result = await self.performRequestWithRetry(request: request)
                    
                    switch result {
                    case .success(let data):
                        do {
                            let decodedResponse = try JSONDecoder().decode(T.self, from: data)
                            promise(.success(decodedResponse))
                        } catch {
                            promise(.failure(.decodingFailed(error.localizedDescription)))
                        }
                    case .failure(let error):
                        promise(.failure(error))
                    }
                    
                } catch {
                    promise(.failure(.operationFailed(error.localizedDescription)))
                }
            }
        }.eraseToAnyPublisher()
    }
    
    private func performRequestWithRetry(request: URLRequest) async -> Result<Data, SDKError> {
        var lastError: SDKError?
        
        for attempt in 0..<config.retryAttempts {
            let result = await performSingleRequest(request: request)
            
            switch result {
            case .success(let data):
                return .success(data)
            case .failure(let error):
                lastError = error
                
                // Don't retry for certain errors
                if !error.isRecoverable {
                    return .failure(error)
                }
                
                // Wait before retry (except for last attempt)
                if attempt < config.retryAttempts - 1 {
                    let delay = config.retryDelay * Double(attempt + 1)
                    try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                }
            }
        }
        
        return .failure(lastError ?? .operationFailed("All retry attempts failed"))
    }
    
    private func performSingleRequest(request: URLRequest) async -> Result<Data, SDKError> {
        return await withCheckedContinuation { continuation in
            let task = session.dataTask(with: request) { [weak self] data, response, error in
                guard let self = self else {
                    continuation.resume(returning: .failure(.unknown("HTTPClient deallocated", nil)))
                    return
                }
                
                if let error = error {
                    let sdkError = self.handleNetworkError(error)
                    continuation.resume(returning: .failure(sdkError))
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    continuation.resume(returning: .failure(.invalidResponse))
                    return
                }
                
                guard let data = data else {
                    continuation.resume(returning: .failure(.invalidData("No data received")))
                    return
                }
                
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    continuation.resume(returning: .success(data))
                } else {
                    let error = self.handleHTTPError(httpResponse, data: data)
                    continuation.resume(returning: .failure(error))
                }
            }
            
            task.resume()
        }
    }
    
    private func buildURL(path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: config.baseURL) else {
            throw SDKError.invalidURL(path)
        }
        return url
    }
    
    private func addQueryParameters(to url: URL, parameters: [String: Any]) throws -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            throw SDKError.invalidURL(url.absoluteString)
        }
        
        components.queryItems = parameters.map { key, value in
            URLQueryItem(name: key, value: String(describing: value))
        }
        
        guard let finalURL = components.url else {
            throw SDKError.invalidURL(url.absoluteString)
        }
        
        return finalURL
    }
    
    private func setHeaders(_ request: inout URLRequest, additional: [String: String]?) async {
        // Set default headers
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("UrnlabsSDK/1.0.0 iOS", forHTTPHeaderField: "User-Agent")
        
        // Set API key if available
        if let apiKey = config.apiKey {
            request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        }
        
        // Set auth token if available
        if let authToken = await storage.getString(forKey: "auth_token") {
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
        }
        
        // Set additional headers
        additional?.forEach { key, value in
            request.setValue(value, forHTTPHeaderField: key)
        }
    }
    
    private func createMultipartBody(
        boundary: String,
        fileData: Data,
        fileName: String,
        mimeType: String,
        additionalData: [String: Any]?
    ) -> Data {
        var body = Data()
        let boundaryString = "--\(boundary)\r\n"
        
        // Add additional data fields
        additionalData?.forEach { key, value in
            body.append(boundaryString.data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        // Add file data
        body.append(boundaryString.data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        return body
    }
    
    private func handleNetworkError(_ error: Error) -> SDKError {
        let nsError = error as NSError
        
        switch nsError.code {
        case NSURLErrorTimedOut:
            return .requestTimeout
        case NSURLErrorCannotConnectToHost, NSURLErrorCannotFindHost:
            return .connectionFailed(error.localizedDescription)
        case NSURLErrorNotConnectedToInternet:
            return .networkUnavailable
        case NSURLErrorSecureConnectionFailed:
            return .sslError(error.localizedDescription)
        case NSURLErrorCancelled:
            return .operationCancelled
        default:
            return .unknown("Network error", error)
        }
    }
    
    private func handleHTTPError(_ response: HTTPURLResponse, data: Data) -> SDKError {
        // Try to parse error message from response
        var errorMessage: String?
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let message = json["message"] as? String ?? json["error"] as? String {
            errorMessage = message
        }
        
        switch response.statusCode {
        case 400:
            return .invalidData(errorMessage ?? "Bad request")
        case 401:
            return .unauthorized(errorMessage)
        case 403:
            return .forbidden(errorMessage)
        case 404:
            return .notFound(errorMessage ?? "Resource not found")
        case 409:
            return .conflict(errorMessage ?? "Conflict")
        case 429:
            let retryAfter = response.allHeaderFields["Retry-After"] as? String
            let retryInterval = retryAfter.flatMap(TimeInterval.init)
            return .rateLimited(retryAfter: retryInterval)
        case 500...599:
            return .serverError(response.statusCode, errorMessage)
        default:
            return .serverError(response.statusCode, errorMessage)
        }
    }
}

// MARK: - Supporting Types

private enum HTTPMethod: String {
    case GET = "GET"
    case POST = "POST"
    case PUT = "PUT"
    case DELETE = "DELETE"
}

// MARK: - URL Session Delegate

private final class HTTPClientDelegate: NSObject, URLSessionDelegate {
    private let config: SDKConfig
    
    init(config: SDKConfig) {
        self.config = config
        super.init()
    }
    
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        // Handle certificate pinning if configured
        guard let certificatePinning = config.certificatePinning,
              !certificatePinning.certificates.isEmpty else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        
        // Implement certificate pinning logic here
        // For now, use default handling
        completionHandler(.performDefaultHandling, nil)
    }
}