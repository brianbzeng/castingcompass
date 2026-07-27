import Foundation

#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum NativeAuthCoordinatorError: Error, Equatable {
    case authorizationDispatchFailed
    case refreshDispatchFailed
    case unexpectedStatus(Int)
}

public enum NativeSignOutResult: String, Equatable, Sendable {
    case remoteRevocationConfirmed = "remote_revocation_confirmed"
    case localCredentialsClearedRemoteUnconfirmed =
        "local_credentials_cleared_remote_unconfirmed"
}

public actor NativeAuthCoordinator {
    private let session: NativeAuthSession
    private let transport: any NativeHTTPTransport

    public init(
        session: NativeAuthSession,
        transport: any NativeHTTPTransport
    ) {
        self.session = session
        self.transport = transport
    }

    @discardableResult
    public func exchangeAuthorizationCode(
        _ request: NativeAuthBackchannelRequest,
        receivedAt: Date = Date()
    ) async throws -> NativeAuthSessionSnapshot {
        let response: NativeHTTPResponse
        do {
            response = try await transport.send(
                request.makeURLRequest(),
                maximumResponseBytes:
                    NativeAuthContract.maximumResponseBytes
            )
        } catch {
            throw NativeAuthCoordinatorError
                .authorizationDispatchFailed
        }
        guard response.statusCode == 200 else {
            throw NativeAuthCoordinatorError.unexpectedStatus(
                response.statusCode
            )
        }
        return try await session.acceptAuthorizationCodeExchange(
            responseData: response.body,
            receivedAt: receivedAt
        )
    }

    @discardableResult
    public func refresh(
        now: Date = Date()
    ) async throws -> NativeAuthSessionSnapshot {
        let request = try await session.makeRefreshRequest(now: now)
        let response: NativeHTTPResponse
        do {
            response = try await transport.send(
                request.makeURLRequest(),
                maximumResponseBytes:
                    NativeAuthContract.maximumResponseBytes
            )
        } catch {
            _ = try await session
                .invalidateAfterRefreshWasDispatched()
            throw NativeAuthCoordinatorError.refreshDispatchFailed
        }
        guard response.statusCode == 200 else {
            _ = try await session
                .invalidateAfterRefreshWasDispatched()
            throw NativeAuthCoordinatorError.unexpectedStatus(
                response.statusCode
            )
        }
        return try await session.acceptRefreshResponse(
            response.body,
            receivedAt: now
        )
    }

    public func signOut() async throws -> NativeSignOutResult {
        let request = try await session.makeSignOutRequest()
        let response: NativeHTTPResponse
        do {
            response = try await transport.send(
                request.makeURLRequest(),
                maximumResponseBytes:
                    NativeAuthContract.maximumResponseBytes
            )
        } catch {
            _ = try await session
                .finishSignOutWithUnconfirmedRemoteResult()
            return .localCredentialsClearedRemoteUnconfirmed
        }
        guard response.statusCode == 200 else {
            _ = try await session
                .finishSignOutWithUnconfirmedRemoteResult()
            return .localCredentialsClearedRemoteUnconfirmed
        }
        do {
            _ = try await session.acceptSignOutResponse(response.body)
            return .remoteRevocationConfirmed
        } catch NativeAuthError.invalidResponse {
            return .localCredentialsClearedRemoteUnconfirmed
        }
    }
}

public struct NativeTripDispatchSnapshot: Equatable, Sendable {
    public let operation: NativeTripOperation
    public let tripID: String
    public let state: NativeTripRecoveryState
    public let responseStatusCode: Int?

    public init(
        operation: NativeTripOperation,
        tripID: String,
        state: NativeTripRecoveryState,
        responseStatusCode: Int?
    ) {
        self.operation = operation
        self.tripID = tripID
        self.state = state
        self.responseStatusCode = responseStatusCode
    }
}

public enum NativeTripDispatchError: Error, Equatable {
    case invalidConfiguration
    case submissionAlreadyExists
    case submissionNotFound
}

public actor NativeTripDispatchCoordinator {
    private let baseURL: URL
    private let builder: NativeTripRequestBuilder
    private let vault: any NativeTripCredentialVault
    private let store: NativeTripDurableStore
    private let authSession: NativeAuthSession
    private let transport: any NativeHTTPTransport

    public init(
        baseURL: URL,
        builder: NativeTripRequestBuilder,
        vault: any NativeTripCredentialVault,
        store: NativeTripDurableStore,
        authSession: NativeAuthSession,
        transport: any NativeHTTPTransport
    ) throws {
        guard
            let components = URLComponents(
                url: baseURL,
                resolvingAgainstBaseURL: false
            ),
            components.scheme == "https",
            components.host?.isEmpty == false,
            components.user == nil,
            components.password == nil,
            components.port == nil,
            components.query == nil,
            components.fragment == nil,
            components.path.isEmpty || components.path == "/"
        else {
            throw NativeTripDispatchError.invalidConfiguration
        }
        var canonical = components
        canonical.path = ""
        guard let canonicalURL = canonical.url else {
            throw NativeTripDispatchError.invalidConfiguration
        }
        self.baseURL = canonicalURL
        self.builder = builder
        self.vault = vault
        self.store = store
        self.authSession = authSession
        self.transport = transport
    }

    public func submitNew(
        _ plan: NativeTripRequestPlan,
        now: Date = Date()
    ) async throws -> NativeTripDispatchSnapshot {
        if try await store.load(
            operation: plan.operation,
            tripID: plan.tripID
        ) != nil {
            throw NativeTripDispatchError.submissionAlreadyExists
        }
        let builtRequest = try builder.materialize(plan, vault: vault)
        var submission = try NativeTripPersistedSubmission(
            plan: plan,
            builtRequest: builtRequest
        )
        try await store.save(submission)

        let accessToken = try await authSession
            .accessTokenForImmediateRequest(now: now)
        let request = try makeURLRequest(
            builtRequest,
            accessToken: accessToken
        )
        try submission.beginSubmission(using: builtRequest)
        try await store.save(submission)
        return try await dispatch(
            request,
            builtRequest: builtRequest,
            submission: &submission
        )
    }

    public func retryPending(
        operation: NativeTripOperation,
        tripID: String,
        now: Date = Date()
    ) async throws -> NativeTripDispatchSnapshot {
        guard var submission = try await store.load(
            operation: operation,
            tripID: tripID
        ) else {
            throw NativeTripDispatchError.submissionNotFound
        }
        let builtRequest = try builder.materialize(
            submission.plan,
            vault: vault
        )
        let accessToken = try await authSession
            .accessTokenForImmediateRequest(now: now)
        let request = try makeURLRequest(
            builtRequest,
            accessToken: accessToken
        )
        try submission.prepareExplicitRetry(using: builtRequest)
        try await store.save(submission)
        return try await dispatch(
            request,
            builtRequest: builtRequest,
            submission: &submission
        )
    }

    public func resumeDraft(
        operation: NativeTripOperation,
        tripID: String,
        now: Date = Date()
    ) async throws -> NativeTripDispatchSnapshot {
        guard var submission = try await store.load(
            operation: operation,
            tripID: tripID
        ) else {
            throw NativeTripDispatchError.submissionNotFound
        }
        guard submission.record.state == .draft else {
            throw NativeTripRecoveryError.invalidState
        }
        let builtRequest = try builder.materialize(
            submission.plan,
            vault: vault
        )
        let accessToken = try await authSession
            .accessTokenForImmediateRequest(now: now)
        let request = try makeURLRequest(
            builtRequest,
            accessToken: accessToken
        )
        try submission.beginSubmission(using: builtRequest)
        try await store.save(submission)
        return try await dispatch(
            request,
            builtRequest: builtRequest,
            submission: &submission
        )
    }

    public func load(
        operation: NativeTripOperation,
        tripID: String
    ) async throws -> NativeTripDispatchSnapshot? {
        guard let submission = try await store.load(
            operation: operation,
            tripID: tripID
        ) else {
            return nil
        }
        return snapshot(submission, statusCode: nil)
    }

    private func dispatch(
        _ request: URLRequest,
        builtRequest: NativeTripBuiltRequest,
        submission: inout NativeTripPersistedSubmission
    ) async throws -> NativeTripDispatchSnapshot {
        let response: NativeHTTPResponse
        do {
            response = try await transport.send(
                request,
                maximumResponseBytes: 4_096
            )
        } catch {
            try submission.apply(.ambiguousTransport)
            try await store.save(submission)
            return snapshot(submission, statusCode: nil)
        }

        if response.statusCode == expectedSuccessStatus(
            builtRequest.operation
        ) {
            do {
                let receipt = try NativeTripReceipt.parseExact(
                    response.body
                )
                try submission.apply(.exactReceipt(receipt))
                try await store.save(submission)
                return snapshot(
                    submission,
                    statusCode: response.statusCode
                )
            } catch {
                if submission.record.state == .pendingSubmission {
                    try submission.apply(.undecodableResponse)
                }
                try await store.save(submission)
                throw error
            }
        }

        switch response.statusCode {
        case 500...599:
            try submission.apply(.ambiguousTransport)
        case 409:
            try submission.apply(.conflict)
        case 400...499:
            try submission.apply(.rejected)
        default:
            try submission.apply(.undecodableResponse)
        }
        try await store.save(submission)
        return snapshot(
            submission,
            statusCode: response.statusCode
        )
    }

    private func makeURLRequest(
        _ builtRequest: NativeTripBuiltRequest,
        accessToken: String
    ) throws -> URLRequest {
        let path = try builtRequest.operation.path(
            tripID: builtRequest.tripID
        )
        guard
            path == builtRequest.path,
            let url = URL(
                string: String(path.dropFirst()),
                relativeTo: baseURL
            )?.absoluteURL,
            url.scheme == "https",
            url.host?.lowercased() == baseURL.host?.lowercased(),
            url.port == nil,
            url.path == path,
            url.query == nil,
            url.fragment == nil
        else {
            throw NativeTripDispatchError.invalidConfiguration
        }
        var request = URLRequest(
            url: url,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval:
                NativeEphemeralHTTPTransport.requestTimeoutSeconds
        )
        request.httpMethod = builtRequest.method
        request.httpBody = builtRequest.body
        for (name, value) in builtRequest.nonAuthorizationHeaders {
            request.setValue(value, forHTTPHeaderField: name)
        }
        request.setValue(
            "Bearer \(accessToken)",
            forHTTPHeaderField: "Authorization"
        )
        return request
    }

    private func expectedSuccessStatus(
        _ operation: NativeTripOperation
    ) -> Int {
        switch operation {
        case .start:
            201
        case .complete, .cancel:
            200
        }
    }

    private func snapshot(
        _ submission: NativeTripPersistedSubmission,
        statusCode: Int?
    ) -> NativeTripDispatchSnapshot {
        NativeTripDispatchSnapshot(
            operation: submission.plan.operation,
            tripID: submission.plan.tripID,
            state: submission.record.state,
            responseStatusCode: statusCode
        )
    }
}
