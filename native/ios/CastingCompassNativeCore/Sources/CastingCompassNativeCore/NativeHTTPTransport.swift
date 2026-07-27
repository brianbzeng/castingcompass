import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum NativeHTTPTransportError: Error, Equatable {
    case invalidConfiguration
    case invalidRequest
    case invalidResponseLimit
    case nonHTTPResponse
    case redirectRejected
    case authenticationChallengeRejected
    case responseTooLarge
    case cancelled
    case transportFailure
}

public struct NativeHTTPResponse: Equatable, Sendable {
    public let statusCode: Int
    public let body: Data

    public init(statusCode: Int, body: Data) {
        self.statusCode = statusCode
        self.body = body
    }
}

public protocol NativeHTTPTransport: Sendable {
    func send(
        _ request: URLRequest,
        maximumResponseBytes: Int
    ) async throws -> NativeHTTPResponse
}

public struct NativeEphemeralHTTPTransport:
    NativeHTTPTransport,
    Sendable
{
    public static let maximumAllowedResponseBytes = 65_536
    public static let maximumRequestBytes = 65_536
    public static let requestTimeoutSeconds: TimeInterval = 30

    private let allowedScheme: String
    private let allowedHost: String
    private let allowedPort: Int?

    public init(baseURL: URL) throws {
        guard
            let components = URLComponents(
                url: baseURL,
                resolvingAgainstBaseURL: false
            ),
            components.scheme == "https",
            let host = components.host,
            !host.isEmpty,
            components.user == nil,
            components.password == nil,
            components.port == nil,
            components.query == nil,
            components.fragment == nil,
            components.path.isEmpty || components.path == "/"
        else {
            throw NativeHTTPTransportError.invalidConfiguration
        }
        self.allowedScheme = "https"
        self.allowedHost = host.lowercased()
        self.allowedPort = nil
    }

    public func send(
        _ request: URLRequest,
        maximumResponseBytes: Int
    ) async throws -> NativeHTTPResponse {
        try validate(
            request,
            maximumResponseBytes: maximumResponseBytes
        )
        let exchange = NativeOneShotHTTPExchange(
            maximumResponseBytes: maximumResponseBytes
        )
        return try await exchange.run(
            request: request,
            configuration: Self.makeSessionConfiguration()
        )
    }

    public static func makeSessionConfiguration()
        -> URLSessionConfiguration
    {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpAdditionalHeaders = [:]
        configuration.timeoutIntervalForRequest = requestTimeoutSeconds
        configuration.timeoutIntervalForResource = requestTimeoutSeconds
        configuration.httpMaximumConnectionsPerHost = 1
        configuration.waitsForConnectivity = false
        return configuration
    }

    private func validate(
        _ request: URLRequest,
        maximumResponseBytes: Int
    ) throws {
        guard
            maximumResponseBytes > 0,
            maximumResponseBytes <= Self.maximumAllowedResponseBytes
        else {
            throw NativeHTTPTransportError.invalidResponseLimit
        }
        guard
            request.httpMethod == "POST",
            request.httpBodyStream == nil,
            let body = request.httpBody,
            !body.isEmpty,
            body.count <= Self.maximumRequestBytes,
            let url = request.url,
            let components = URLComponents(
                url: url,
                resolvingAgainstBaseURL: false
            ),
            components.scheme == allowedScheme,
            components.host?.lowercased() == allowedHost,
            components.port == allowedPort,
            components.user == nil,
            components.password == nil,
            components.query == nil,
            components.fragment == nil,
            components.path.hasPrefix("/api/"),
            request.timeoutInterval > 0,
            request.timeoutInterval <= Self.requestTimeoutSeconds
        else {
            throw NativeHTTPTransportError.invalidRequest
        }
        let prohibitedHeaders = Set([
            "cookie",
            "origin",
            "proxy-authorization",
        ])
        guard !(request.allHTTPHeaderFields ?? [:]).keys.contains(where: {
            prohibitedHeaders.contains($0.lowercased())
        }) else {
            throw NativeHTTPTransportError.invalidRequest
        }
    }
}

private final class NativeOneShotHTTPExchange:
    NSObject,
    URLSessionDataDelegate,
    URLSessionTaskDelegate,
    @unchecked Sendable
{
    private let maximumResponseBytes: Int
    private let lock = NSLock()

    private var continuation:
        CheckedContinuation<NativeHTTPResponse, Error>?
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var response: HTTPURLResponse?
    private var responseBody = Data()
    private var finished = false
    private var cancellationRequested = false

    init(maximumResponseBytes: Int) {
        self.maximumResponseBytes = maximumResponseBytes
    }

    func run(
        request: URLRequest,
        configuration: URLSessionConfiguration
    ) async throws -> NativeHTTPResponse {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                if cancellationRequested {
                    finished = true
                    lock.unlock()
                    continuation.resume(
                        throwing: NativeHTTPTransportError.cancelled
                    )
                    return
                }
                self.continuation = continuation
                let queue = OperationQueue()
                queue.maxConcurrentOperationCount = 1
                queue.qualityOfService = .userInitiated
                let session = URLSession(
                    configuration: configuration,
                    delegate: self,
                    delegateQueue: queue
                )
                let task = session.dataTask(with: request)
                self.session = session
                self.task = task
                lock.unlock()
                task.resume()
            }
        } onCancel: {
            self.cancel()
        }
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        guard let httpResponse = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            finish(.failure(NativeHTTPTransportError.nonHTTPResponse))
            return
        }
        lock.lock()
        self.response = httpResponse
        lock.unlock()
        completionHandler(.allow)
    }

    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive data: Data
    ) {
        lock.lock()
        let exceedsLimit =
            data.count > maximumResponseBytes - responseBody.count
        if !exceedsLimit {
            responseBody.append(data)
        }
        lock.unlock()
        if exceedsLimit {
            dataTask.cancel()
            finish(.failure(NativeHTTPTransportError.responseTooLarge))
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
        finish(.failure(NativeHTTPTransportError.redirectRejected))
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (
            URLSession.AuthChallengeDisposition,
            URLCredential?
        ) -> Void
    ) {
        if challenge.protectionSpace.authenticationMethod ==
            NSURLAuthenticationMethodServerTrust
        {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        completionHandler(.cancelAuthenticationChallenge, nil)
        finish(
            .failure(
                NativeHTTPTransportError.authenticationChallengeRejected
            )
        )
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if error != nil {
            finish(.failure(NativeHTTPTransportError.transportFailure))
            return
        }
        lock.lock()
        let response = self.response
        let body = responseBody
        lock.unlock()
        guard let response else {
            finish(.failure(NativeHTTPTransportError.nonHTTPResponse))
            return
        }
        finish(
            .success(
                NativeHTTPResponse(
                    statusCode: response.statusCode,
                    body: body
                )
            )
        )
    }

    private func cancel() {
        lock.lock()
        cancellationRequested = true
        let hasContinuation = continuation != nil
        lock.unlock()
        if hasContinuation {
            finish(.failure(NativeHTTPTransportError.cancelled))
        }
    }

    private func finish(
        _ result: Result<NativeHTTPResponse, Error>
    ) {
        lock.lock()
        guard !finished else {
            lock.unlock()
            return
        }
        finished = true
        let continuation = self.continuation
        self.continuation = nil
        let session = self.session
        self.session = nil
        self.task = nil
        lock.unlock()

        session?.invalidateAndCancel()
        continuation?.resume(with: result)
    }
}
