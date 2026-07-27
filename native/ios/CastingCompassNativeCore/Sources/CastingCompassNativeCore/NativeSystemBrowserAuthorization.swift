import AuthenticationServices
import Foundation

public enum NativeSystemBrowserAuthorizationError: Error, Equatable {
    case signInAlreadyActive
    case sessionDidNotStart
    case cancelled
    case invalidCompletion
    case browserFailure
}

public struct NativeSystemBrowserAuthorizationRequest:
    Equatable,
    Sendable,
    CustomStringConvertible,
    CustomDebugStringConvertible
{
    public let authorizationURL: URL
    public let callbackURLScheme: String

    public init(
        authorizationURL: URL,
        callbackURLScheme: String
    ) {
        self.authorizationURL = authorizationURL
        self.callbackURLScheme = callbackURLScheme
    }

    public var description: String {
        "NativeSystemBrowserAuthorizationRequest(redacted)"
    }

    public var debugDescription: String {
        description
    }
}

public actor NativeSystemBrowserAuthorizationFlow {
    private let configuration: NativeAuthConfiguration
    private var activeAttempt: NativeAuthorizationAttempt?

    public init(configuration: NativeAuthConfiguration) {
        self.configuration = configuration
    }

    public func begin()
        throws -> NativeSystemBrowserAuthorizationRequest
    {
        guard activeAttempt == nil else {
            throw NativeSystemBrowserAuthorizationError
                .signInAlreadyActive
        }
        guard
            let callback = URLComponents(
                string: configuration.redirectURI
            ),
            let callbackURLScheme = callback.scheme,
            callbackURLScheme == "castingcompass",
            callback.host == "oauth",
            callback.path == "/callback",
            callback.user == nil,
            callback.password == nil,
            callback.port == nil,
            callback.query == nil,
            callback.fragment == nil
        else {
            throw NativeAuthError.invalidConfiguration
        }
        let attempt = try NativeAuthorizationAttempt(
            configuration: configuration
        )
        activeAttempt = attempt
        return NativeSystemBrowserAuthorizationRequest(
            authorizationURL: attempt.authorizationURL,
            callbackURLScheme: callbackURLScheme
        )
    }

    public func consumeCallback(
        _ callbackURL: URL
    ) async throws -> NativeAuthBackchannelRequest {
        guard let attempt = activeAttempt else {
            throw NativeAuthError.invalidSessionState
        }
        activeAttempt = nil
        return try await attempt.consumeCallback(callbackURL)
    }

    public func cancel() async {
        guard let attempt = activeAttempt else {
            return
        }
        activeAttempt = nil
        await attempt.cancel()
    }
}

@MainActor
protocol NativeSystemBrowserSession: AnyObject {
    var presentationContextProvider:
        (any ASWebAuthenticationPresentationContextProviding)? { get set }
    var prefersEphemeralWebBrowserSession: Bool { get set }

    func start() -> Bool
    func cancel()
}

extension ASWebAuthenticationSession: NativeSystemBrowserSession {}

typealias NativeSystemBrowserSessionFactory = @MainActor (
    URL,
    String,
    @escaping ASWebAuthenticationSession.CompletionHandler
) -> any NativeSystemBrowserSession

@MainActor
public final class NativeSystemBrowserAuthorizer:
    NSObject,
    ASWebAuthenticationPresentationContextProviding
{
    public typealias PresentationAnchorProvider =
        @MainActor () -> ASPresentationAnchor

    private struct ActiveSession {
        let id: UUID
        let session: any NativeSystemBrowserSession
        let continuation: CheckedContinuation<
            NativeAuthBackchannelRequest,
            Error
        >
    }

    private let flow: NativeSystemBrowserAuthorizationFlow
    private let authCoordinator: NativeAuthCoordinator
    private let presentationAnchorProvider:
        PresentationAnchorProvider
    private let makeSession: NativeSystemBrowserSessionFactory

    private var activeSession: ActiveSession?
    private var signInIsActive = false

    public init(
        configuration: NativeAuthConfiguration,
        authCoordinator: NativeAuthCoordinator,
        presentationAnchorProvider:
            @escaping PresentationAnchorProvider
    ) {
        self.flow = NativeSystemBrowserAuthorizationFlow(
            configuration: configuration
        )
        self.authCoordinator = authCoordinator
        self.presentationAnchorProvider =
            presentationAnchorProvider
        self.makeSession = {
            authorizationURL,
            callbackURLScheme,
            completionHandler in
            ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: callbackURLScheme,
                completionHandler: completionHandler
            )
        }
        super.init()
    }

    init(
        flow: NativeSystemBrowserAuthorizationFlow,
        authCoordinator: NativeAuthCoordinator,
        presentationAnchorProvider:
            @escaping PresentationAnchorProvider,
        makeSession:
            @escaping NativeSystemBrowserSessionFactory
    ) {
        self.flow = flow
        self.authCoordinator = authCoordinator
        self.presentationAnchorProvider =
            presentationAnchorProvider
        self.makeSession = makeSession
        super.init()
    }

    @discardableResult
    public func signIn(
        receivedAt: Date = Date()
    ) async throws -> NativeAuthSessionSnapshot {
        guard !signInIsActive else {
            throw NativeSystemBrowserAuthorizationError
                .signInAlreadyActive
        }
        signInIsActive = true
        defer {
            signInIsActive = false
        }

        let request = try await waitForBackchannelRequest()
        guard !Task.isCancelled else {
            throw NativeSystemBrowserAuthorizationError.cancelled
        }
        return try await authCoordinator.exchangeAuthorizationCode(
            request,
            receivedAt: receivedAt
        )
    }

    @discardableResult
    public func cancel() async -> Bool {
        guard let id = activeSession?.id else {
            return false
        }
        await cancelSession(id: id)
        return true
    }

    public nonisolated func presentationAnchor(
        for session: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            presentationAnchorProvider()
        }
    }

    private func waitForBackchannelRequest()
        async throws -> NativeAuthBackchannelRequest
    {
        guard !Task.isCancelled else {
            throw NativeSystemBrowserAuthorizationError.cancelled
        }
        let request = try await flow.begin()
        let sessionID = UUID()

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation {
                continuation in
                let session = makeSession(
                    request.authorizationURL,
                    request.callbackURLScheme
                ) {
                    [self] callbackURL, error in
                    Task { @MainActor in
                        await handleCompletion(
                            sessionID: sessionID,
                            callbackURL: callbackURL,
                            error: error
                        )
                    }
                }
                session.presentationContextProvider = self
                session.prefersEphemeralWebBrowserSession = true
                activeSession = ActiveSession(
                    id: sessionID,
                    session: session,
                    continuation: continuation
                )

                if Task.isCancelled {
                    Task { @MainActor in
                        await cancelSession(id: sessionID)
                    }
                    return
                }
                guard session.start() else {
                    Task { @MainActor in
                        await failSessionStart(id: sessionID)
                    }
                    return
                }
            }
        } onCancel: {
            Task { @MainActor [weak self] in
                await self?.cancelSession(id: sessionID)
            }
        }
    }

    private func handleCompletion(
        sessionID: UUID,
        callbackURL: URL?,
        error: Error?
    ) async {
        guard
            let active = activeSession,
            active.id == sessionID
        else {
            return
        }
        activeSession = nil
        active.session.presentationContextProvider = nil

        guard (callbackURL == nil) != (error == nil) else {
            await flow.cancel()
            active.continuation.resume(
                throwing:
                    NativeSystemBrowserAuthorizationError
                        .invalidCompletion
            )
            return
        }

        if let callbackURL {
            do {
                let request = try await flow.consumeCallback(
                    callbackURL
                )
                active.continuation.resume(returning: request)
            } catch {
                active.continuation.resume(throwing: error)
            }
            return
        }

        await flow.cancel()
        guard let error else {
            active.continuation.resume(
                throwing:
                    NativeSystemBrowserAuthorizationError
                        .invalidCompletion
            )
            return
        }
        let browserError = error as NSError
        if browserError.domain ==
            ASWebAuthenticationSessionError.errorDomain,
            browserError.code ==
                ASWebAuthenticationSessionError.Code
                    .canceledLogin.rawValue
        {
            active.continuation.resume(
                throwing:
                    NativeSystemBrowserAuthorizationError
                        .cancelled
            )
        } else {
            active.continuation.resume(
                throwing:
                    NativeSystemBrowserAuthorizationError
                        .browserFailure
            )
        }
    }

    private func failSessionStart(id: UUID) async {
        guard
            let active = activeSession,
            active.id == id
        else {
            return
        }
        activeSession = nil
        active.session.presentationContextProvider = nil
        await flow.cancel()
        active.continuation.resume(
            throwing:
                NativeSystemBrowserAuthorizationError
                    .sessionDidNotStart
        )
    }

    private func cancelSession(id: UUID) async {
        guard
            let active = activeSession,
            active.id == id
        else {
            return
        }
        activeSession = nil
        active.session.presentationContextProvider = nil
        active.session.cancel()
        await flow.cancel()
        active.continuation.resume(
            throwing:
                NativeSystemBrowserAuthorizationError.cancelled
        )
    }
}
