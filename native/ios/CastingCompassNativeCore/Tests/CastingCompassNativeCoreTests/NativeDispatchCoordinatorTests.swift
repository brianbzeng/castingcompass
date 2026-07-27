import Foundation
import XCTest

@testable import CastingCompassNativeCore

final class NativeDispatchCoordinatorTests: XCTestCase {
    private let baseURL = URL(
        string: "https://staging.castingcompass.example"
    )!
    private let now = Date(timeIntervalSince1970: 1_786_291_200)
    private let accessToken = String(repeating: "A", count: 43)
    private let refreshToken = String(repeating: "B", count: 43)
    private let nextAccessToken = String(repeating: "C", count: 43)
    private let nextRefreshToken = String(repeating: "D", count: 43)
    private let tripID = "trip_123e4567-e89b-42d3-a456-426614174000"
    private let secondTripID =
        "trip_123e4567-e89b-42d3-a456-426614174001"
    private let requestToken = String(repeating: "R", count: 43)
    private let reporterKey = String(repeating: "P", count: 43)

    func testTransportConfigurationHasNoAmbientAuthority()
        throws
    {
        XCTAssertNoThrow(
            try NativeEphemeralHTTPTransport(baseURL: baseURL)
        )
        for invalid in [
            "http://staging.castingcompass.example",
            "https://user@staging.castingcompass.example",
            "https://staging.castingcompass.example:8443",
            "https://staging.castingcompass.example/base",
        ] {
            XCTAssertThrowsError(
                try NativeEphemeralHTTPTransport(
                    baseURL: try XCTUnwrap(URL(string: invalid))
                )
            )
        }
        let configuration =
            NativeEphemeralHTTPTransport.makeSessionConfiguration()
        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertEqual(configuration.httpCookieAcceptPolicy, .never)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        XCTAssertNil(configuration.urlCredentialStorage)
        XCTAssertNil(configuration.urlCache)
        XCTAssertEqual(
            configuration.requestCachePolicy,
            .reloadIgnoringLocalCacheData
        )
        XCTAssertFalse(configuration.waitsForConnectivity)
        XCTAssertEqual(configuration.httpMaximumConnectionsPerHost, 1)
        XCTAssertEqual(
            configuration.timeoutIntervalForRequest,
            NativeEphemeralHTTPTransport.requestTimeoutSeconds
        )
        XCTAssertEqual(
            configuration.timeoutIntervalForResource,
            NativeEphemeralHTTPTransport.requestTimeoutSeconds
        )
    }

    func testTransportRejectsInvalidRequestsBeforeDispatch()
        async throws
    {
        let transport = try NativeEphemeralHTTPTransport(
            baseURL: baseURL
        )
        var request = URLRequest(
            url: URL(
                string:
                    "https://staging.castingcompass.example/api/trips/start"
            )!
        )
        request.httpMethod = "GET"
        request.httpBody = Data(#"{"request":true}"#.utf8)
        do {
            _ = try await transport.send(
                request,
                maximumResponseBytes: 4_096
            )
            XCTFail("GET must be rejected before transport")
        } catch {
            XCTAssertEqual(
                error as? NativeHTTPTransportError,
                .invalidRequest
            )
        }

        request.httpMethod = "POST"
        request.setValue("ambient", forHTTPHeaderField: "Cookie")
        do {
            _ = try await transport.send(
                request,
                maximumResponseBytes: 4_096
            )
            XCTFail("ambient cookies must be rejected")
        } catch {
            XCTAssertEqual(
                error as? NativeHTTPTransportError,
                .invalidRequest
            )
        }

        request.setValue(nil, forHTTPHeaderField: "Cookie")
        request.url = URL(
            string: "https://other.example/api/trips/start"
        )
        do {
            _ = try await transport.send(
                request,
                maximumResponseBytes: 4_096
            )
            XCTFail("cross-origin requests must be rejected")
        } catch {
            XCTAssertEqual(
                error as? NativeHTTPTransportError,
                .invalidRequest
            )
        }
    }

    func testAuthCoordinatorExchangesAndRotatesExactlyOnce()
        async throws
    {
        let vault = CoordinatorMemoryVault()
        let session = try NativeAuthSession(
            configuration: try authConfiguration(),
            vault: vault
        )
        let transport = ScriptedNativeTransport([
            .response(200, tokenResponse()),
            .response(
                200,
                tokenResponse(
                    accessToken: nextAccessToken,
                    refreshToken: nextRefreshToken,
                    refreshExpiresIn: 2_591_000
                )
            ),
        ])
        let coordinator = NativeAuthCoordinator(
            session: session,
            transport: transport
        )
        let exchangeRequest = try await authorizationExchangeRequest()
        let authorized = try await coordinator
            .exchangeAuthorizationCode(
                exchangeRequest,
                receivedAt: now
            )
        XCTAssertEqual(authorized.status, .authorized)
        let refreshed = try await coordinator.refresh(
            now: now.addingTimeInterval(1_000)
        )
        XCTAssertEqual(refreshed.status, .authorized)
        let rotatedAccessToken = try await session
            .accessTokenForImmediateRequest(
                now: now.addingTimeInterval(1_000)
            )
        XCTAssertEqual(
            rotatedAccessToken,
            nextAccessToken
        )
        let requests = await transport.capturedRequests()
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(
            requests.map { $0.url?.path },
            ["/api/native/oauth/token", "/api/native/oauth/token"]
        )
        XCTAssertNil(
            requests[0].value(forHTTPHeaderField: "Authorization")
        )
        XCTAssertNil(requests[0].value(forHTTPHeaderField: "Cookie"))
        XCTAssertNil(requests[1].value(forHTTPHeaderField: "Cookie"))
    }

    func testLostRefreshInvalidatesFamilyWithoutRetry()
        async throws
    {
        let session = try await authorizedSession()
        let transport = ScriptedNativeTransport([
            .failure(.transportFailure),
        ])
        let coordinator = NativeAuthCoordinator(
            session: session,
            transport: transport
        )
        do {
            _ = try await coordinator.refresh(now: now)
            XCTFail("a lost refresh must not succeed")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthCoordinatorError,
                .refreshDispatchFailed
            )
        }
        let failedRefreshSnapshot = await session.snapshot()
        let failedRefreshRequests = await transport.capturedRequests()
        XCTAssertEqual(
            failedRefreshSnapshot.status,
            .requiresSignIn
        )
        XCTAssertEqual(
            failedRefreshRequests.count,
            1
        )
    }

    func testAmbiguousSignOutClearsLocalAuthority()
        async throws
    {
        let session = try await authorizedSession()
        let transport = ScriptedNativeTransport([
            .response(200, Data(#"{"revoked":false}"#.utf8)),
        ])
        let coordinator = NativeAuthCoordinator(
            session: session,
            transport: transport
        )
        let signOutResult = try await coordinator.signOut()
        XCTAssertEqual(
            signOutResult,
            .localCredentialsClearedRemoteUnconfirmed
        )
        let signedOutSnapshot = await session.snapshot()
        let signOutRequests = await transport.capturedRequests()
        XCTAssertEqual(
            signedOutSnapshot.status,
            .requiresSignIn
        )
        XCTAssertEqual(
            signOutRequests.count,
            1
        )
    }

    func testTripCoordinatorPersistsBeforeOneShotConfirmation()
        async throws
    {
        let fixture = try await makeTripFixture(
            steps: [
                .response(
                    201,
                    receipt(operation: .start, tripID: tripID)
                ),
            ]
        )
        let result = try await fixture.coordinator.submitNew(
            fixture.plan,
            now: now
        )
        XCTAssertEqual(result.state, .confirmed)
        XCTAssertEqual(result.responseStatusCode, 201)
        let restored = try await fixture.store.load(
            operation: .start,
            tripID: tripID
        )
        XCTAssertEqual(restored?.record.state, .confirmed)

        let requests = await fixture.transport.capturedRequests()
        XCTAssertEqual(requests.count, 1)
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(request.url?.path, "/api/trips/start")
        XCTAssertEqual(
            request.value(forHTTPHeaderField: "Authorization"),
            "Bearer \(accessToken)"
        )
        XCTAssertEqual(
            request.value(
                forHTTPHeaderField:
                    NativeTripContract.apiVersionHeader
            ),
            NativeTripContract.apiCompatibilityVersion
        )
        XCTAssertNil(request.value(forHTTPHeaderField: "Cookie"))
        XCTAssertNil(request.value(forHTTPHeaderField: "Origin"))
        XCTAssertEqual(
            request.httpBody,
            try fixture.builder.materialize(
                fixture.plan,
                vault: fixture.vault
            ).body
        )
    }

    func testAmbiguousTripRequiresExplicitByteIdenticalRetry()
        async throws
    {
        let fixture = try await makeTripFixture(
            steps: [
                .failure(.transportFailure),
                .response(
                    201,
                    receipt(operation: .start, tripID: tripID)
                ),
            ]
        )
        let first = try await fixture.coordinator.submitNew(
            fixture.plan,
            now: now
        )
        XCTAssertEqual(first.state, .pendingSubmission)
        XCTAssertNil(first.responseStatusCode)

        let retried = try await fixture.coordinator.retryPending(
            operation: .start,
            tripID: tripID,
            now: now
        )
        XCTAssertEqual(retried.state, .confirmed)
        let requests = await fixture.transport.capturedRequests()
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests[0].url, requests[1].url)
        XCTAssertEqual(requests[0].httpBody, requests[1].httpBody)
        XCTAssertEqual(
            requests[0].allHTTPHeaderFields,
            requests[1].allHTTPHeaderFields
        )
    }

    func testChangedRetryPersistsAttentionWithoutSecondDispatch()
        async throws
    {
        let fixture = try await makeTripFixture(
            steps: [.failure(.transportFailure)]
        )
        let first = try await fixture.coordinator.submitNew(
            fixture.plan,
            now: now
        )
        XCTAssertEqual(first.state, .pendingSubmission)

        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        try fixture.vault.store(
            Data(String(repeating: "Z", count: 43).utf8),
            in: requestSlot
        )

        do {
            _ = try await fixture.coordinator.retryPending(
                operation: .start,
                tripID: tripID,
                now: now
            )
            XCTFail("changed request material must not dispatch")
        } catch {
            XCTAssertEqual(
                error as? NativeTripRecoveryError,
                .requestChanged
            )
        }

        let persisted = try await fixture.store.load(
            operation: .start,
            tripID: tripID
        )
        XCTAssertEqual(
            persisted?.record.state,
            .needsUserAttention
        )
        let requests = await fixture.transport.capturedRequests()
        XCTAssertEqual(requests.count, 1)
    }

    func testSignedOutSubmissionRemainsDraftAndCanResumeAfterAuthorization()
        async throws
    {
        let fixture = try await makeTripFixture(
            authorized: false,
            steps: [
                .response(
                    201,
                    receipt(operation: .start, tripID: tripID)
                ),
            ]
        )
        do {
            _ = try await fixture.coordinator.submitNew(
                fixture.plan,
                now: now
            )
            XCTFail("a signed-out client must not dispatch")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .invalidSessionState
            )
        }
        let savedDraft = try await fixture.store.load(
            operation: .start,
            tripID: tripID
        )
        let requestsBeforeAuthorization =
            await fixture.transport.capturedRequests()
        XCTAssertEqual(
            savedDraft?.record.state,
            .draft
        )
        XCTAssertEqual(
            requestsBeforeAuthorization.count,
            0
        )

        _ = try await fixture.authSession
            .acceptAuthorizationCodeExchange(
                responseData: tokenResponse(),
                receivedAt: now
            )
        let resumed = try await fixture.coordinator.resumeDraft(
            operation: .start,
            tripID: tripID,
            now: now
        )
        XCTAssertEqual(resumed.state, .confirmed)
        let requestsAfterResume =
            await fixture.transport.capturedRequests()
        XCTAssertEqual(
            requestsAfterResume.count,
            1
        )
    }

    func testMalformedSuccessAndConflictNeedAttention()
        async throws
    {
        let malformed = try await makeTripFixture(
            steps: [
                .response(
                    201,
                    Data(
                        #"{"receipt":{"operation":"start","tripId":"\#(tripID)"},"trip":{}}"#
                            .utf8
                    )
                ),
            ]
        )
        do {
            _ = try await malformed.coordinator.submitNew(
                malformed.plan,
                now: now
            )
            XCTFail("an expanded success body must fail closed")
        } catch {
            XCTAssertEqual(
                error as? NativeTripRecoveryError,
                .invalidReceipt
            )
        }
        let malformedSaved = try await malformed.store.load(
            operation: .start,
            tripID: tripID
        )
        XCTAssertEqual(
            malformedSaved?.record.state,
            .needsUserAttention
        )

        let conflict = try await makeTripFixture(
            tripID: secondTripID,
            steps: [.response(409, Data(#"{"error":{}}"#.utf8))]
        )
        let conflictResult = try await conflict.coordinator
            .submitNew(conflict.plan, now: now)
        XCTAssertEqual(
            conflictResult.state,
            .needsUserAttention
        )
        XCTAssertEqual(conflictResult.responseStatusCode, 409)
    }

    private func makeTripFixture(
        tripID: String? = nil,
        authorized: Bool = true,
        steps: [ScriptedNativeTransport.Step]
    ) async throws -> TripFixture {
        let tripID = tripID ?? self.tripID
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "NativeDispatchCoordinatorTests-\(UUID().uuidString)",
                isDirectory: true
            )
        addTeardownBlock {
            try? FileManager.default.removeItem(at: root)
        }
        let vault = CoordinatorMemoryVault()
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let reporterSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        try vault.store(Data(requestToken.utf8), in: requestSlot)
        try vault.store(Data(reporterKey.utf8), in: reporterSlot)
        let authSession = try NativeAuthSession(
            configuration: try authConfiguration(),
            vault: vault
        )
        if authorized {
            _ = try await authSession.acceptAuthorizationCodeExchange(
                responseData: tokenResponse(),
                receivedAt: now
            )
        }
        let plan = NativeTripRequestPlan.start(
            try NativeTripStartPlan(
                tripID: tripID,
                requestTokenSlot: requestSlot,
                reporterKeySlot: reporterSlot,
                siteID: "goleta-beach",
                startedAt: now,
                anglerCount: 1,
                mode: .beach,
                scoreInfluencedChoice: false,
                primaryTargetConfirmed: true,
                consent: true
            )
        )
        let builder = try NativeTripRequestBuilder(
            allowedSiteIDs: ["goleta-beach"]
        )
        let store = try NativeTripDurableStore(rootDirectory: root)
        let transport = ScriptedNativeTransport(steps)
        let coordinator = try NativeTripDispatchCoordinator(
            baseURL: baseURL,
            builder: builder,
            vault: vault,
            store: store,
            authSession: authSession,
            transport: transport
        )
        return TripFixture(
            vault: vault,
            store: store,
            transport: transport,
            builder: builder,
            coordinator: coordinator,
            authSession: authSession,
            plan: plan
        )
    }

    private func authorizedSession() async throws -> NativeAuthSession {
        let session = try NativeAuthSession(
            configuration: try authConfiguration(),
            vault: CoordinatorMemoryVault()
        )
        _ = try await session.acceptAuthorizationCodeExchange(
            responseData: tokenResponse(),
            receivedAt: now
        )
        return session
    }

    private func authorizationExchangeRequest()
        async throws -> NativeAuthBackchannelRequest
    {
        let verifier = String(repeating: "v", count: 43)
        let state = String(repeating: "s", count: 43)
        let code = String(repeating: "E", count: 43)
        let attempt = try NativeAuthorizationAttempt(
            configuration: try authConfiguration(),
            verifier: verifier,
            state: state
        )
        return try await attempt.consumeCallback(
            URL(
                string:
                    "castingcompass://oauth/callback?code=\(code)&state=\(state)"
            )!
        )
    }

    private func authConfiguration() throws
        -> NativeAuthConfiguration
    {
        try NativeAuthConfiguration(baseURL: baseURL)
    }

    private func tokenResponse(
        accessToken: String? = nil,
        refreshToken: String? = nil,
        refreshExpiresIn: Int = 2_592_000
    ) -> Data {
        Data(
            #"{"accessToken":"\#(accessToken ?? self.accessToken)","expiresIn":600,"refreshExpiresIn":\#(refreshExpiresIn),"refreshToken":"\#(refreshToken ?? self.refreshToken)","scope":"profile:read trips:write","tokenType":"Bearer"}"#
                .utf8
        )
    }

    private func receipt(
        operation: NativeTripOperation,
        tripID: String
    ) -> Data {
        Data(
            #"{"receipt":{"operation":"\#(operation.rawValue)","tripId":"\#(tripID)"}}"#
                .utf8
        )
    }
}

private struct TripFixture {
    let vault: CoordinatorMemoryVault
    let store: NativeTripDurableStore
    let transport: ScriptedNativeTransport
    let builder: NativeTripRequestBuilder
    let coordinator: NativeTripDispatchCoordinator
    let authSession: NativeAuthSession
    let plan: NativeTripRequestPlan
}

private actor ScriptedNativeTransport: NativeHTTPTransport {
    enum Step: Sendable {
        case response(Int, Data)
        case failure(NativeHTTPTransportError)
    }

    private var steps: [Step]
    private var requests: [URLRequest] = []

    init(_ steps: [Step]) {
        self.steps = steps
    }

    func send(
        _ request: URLRequest,
        maximumResponseBytes: Int
    ) async throws -> NativeHTTPResponse {
        requests.append(request)
        guard !steps.isEmpty else {
            throw NativeHTTPTransportError.transportFailure
        }
        let step = steps.removeFirst()
        switch step {
        case let .response(status, body):
            guard body.count <= maximumResponseBytes else {
                throw NativeHTTPTransportError.responseTooLarge
            }
            return NativeHTTPResponse(
                statusCode: status,
                body: body
            )
        case let .failure(error):
            throw error
        }
    }

    func capturedRequests() -> [URLRequest] {
        requests
    }
}

private final class CoordinatorMemoryVault:
    NativeTripCredentialVault,
    @unchecked Sendable
{
    private let lock = NSLock()
    private var values: [NativeTripCredentialSlot: Data] = [:]

    func store(
        _ value: Data,
        in slot: NativeTripCredentialSlot
    ) throws {
        guard !value.isEmpty else {
            throw NativeTripCredentialVaultError.emptyCredential
        }
        lock.lock()
        values[slot] = value
        lock.unlock()
    }

    func read(from slot: NativeTripCredentialSlot) throws -> Data {
        lock.lock()
        let value = values[slot]
        lock.unlock()
        guard let value else {
            throw NativeTripCredentialVaultError.notFound
        }
        return value
    }

    func delete(_ slot: NativeTripCredentialSlot) throws {
        lock.lock()
        values.removeValue(forKey: slot)
        lock.unlock()
    }
}
