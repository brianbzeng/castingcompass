import AuthenticationServices
import Foundation
import XCTest

@testable import CastingCompassNativeCore

final class NativeSystemBrowserAuthorizationTests: XCTestCase {
    private let baseURL = URL(
        string: "https://staging.castingcompass.example"
    )!
    private let receivedAt = Date(
        timeIntervalSince1970: 1_786_291_200
    )

    func testFlowIsSingleFlightAndCancelledAttemptCannotReturn()
        async throws
    {
        let configuration = try NativeAuthConfiguration(
            baseURL: baseURL
        )
        let flow = NativeSystemBrowserAuthorizationFlow(
            configuration: configuration
        )
        let first = try await flow.begin()
        XCTAssertEqual(
            first.callbackURLScheme,
            "castingcompass"
        )
        XCTAssertEqual(
            first.authorizationURL.path,
            "/native/authorize"
        )
        XCTAssertEqual(
            first.description,
            "NativeSystemBrowserAuthorizationRequest(redacted)"
        )

        do {
            _ = try await flow.begin()
            XCTFail("a second browser attempt must fail closed")
        } catch {
            XCTAssertEqual(
                error as? NativeSystemBrowserAuthorizationError,
                .signInAlreadyActive
            )
        }

        await flow.cancel()
        let callback = try callbackURL(
            for: first.authorizationURL
        )
        do {
            _ = try await flow.consumeCallback(callback)
            XCTFail("a cancelled attempt cannot consume a callback")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .invalidSessionState
            )
        }

        let replacement = try await flow.begin()
        XCTAssertNotEqual(
            replacement.authorizationURL,
            first.authorizationURL
        )
        await flow.cancel()
    }

    @MainActor
    func testEphemeralBrowserCallbackExchangesInsideCoordinator()
        async throws
    {
        let fixture = try makeFixture(
            tokenResponse: tokenResponse()
        )
        let task = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let browser = try await fixture.factory.nextSession()
        XCTAssertTrue(browser.startWasCalled)
        XCTAssertTrue(browser.prefersEphemeralWebBrowserSession)
        XCTAssertNotNil(browser.presentationContextProvider)
        XCTAssertEqual(
            browser.callbackURLScheme,
            "castingcompass"
        )
        XCTAssertEqual(
            browser.authorizationURL.path,
            "/native/authorize"
        )

        browser.complete(
            callbackURL: try callbackURL(
                for: browser.authorizationURL
            ),
            error: nil
        )
        let snapshot = try await task.value
        XCTAssertEqual(snapshot.status, .authorized)
        XCTAssertNil(browser.presentationContextProvider)

        let requests = await fixture.transport
            .capturedRequests()
        XCTAssertEqual(requests.count, 1)
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(
            request.url?.path,
            "/api/native/oauth/token"
        )
        XCTAssertNil(
            request.value(forHTTPHeaderField: "Cookie")
        )
        XCTAssertNil(
            request.value(forHTTPHeaderField: "Origin")
        )
        XCTAssertNil(
            request.value(forHTTPHeaderField: "Authorization")
        )
    }

    @MainActor
    func testTaskCancellationCancelsBrowserWithoutDispatch()
        async throws
    {
        let fixture = try makeFixture(
            tokenResponse: tokenResponse()
        )
        let task = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let browser = try await fixture.factory.nextSession()
        task.cancel()

        do {
            _ = try await task.value
            XCTFail("task cancellation must fail closed")
        } catch {
            XCTAssertEqual(
                error as? NativeSystemBrowserAuthorizationError,
                .cancelled
            )
        }
        XCTAssertTrue(browser.cancelWasCalled)
        XCTAssertNil(browser.presentationContextProvider)
        let requests = await fixture.transport
            .capturedRequests()
        XCTAssertEqual(
            requests.count,
            0
        )
    }

    @MainActor
    func testBrowserCancellationDoesNotDispatchAndAllowsRetry()
        async throws
    {
        let fixture = try makeFixture(
            startResults: [true, true],
            tokenResponse: tokenResponse()
        )
        let first = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let cancelledBrowser = try await fixture.factory
            .nextSession()
        cancelledBrowser.complete(
            callbackURL: nil,
            error: NSError(
                domain:
                    ASWebAuthenticationSessionError
                        .errorDomain,
                code:
                    ASWebAuthenticationSessionError.Code
                        .canceledLogin.rawValue
            )
        )
        do {
            _ = try await first.value
            XCTFail("browser cancellation must not authorize")
        } catch {
            XCTAssertEqual(
                error as? NativeSystemBrowserAuthorizationError,
                .cancelled
            )
        }
        let requestsAfterCancellation =
            await fixture.transport.capturedRequests()
        XCTAssertEqual(requestsAfterCancellation.count, 0)

        let retry = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let retryBrowser = try await fixture.factory.nextSession(
            after: 1
        )
        retryBrowser.complete(
            callbackURL: try callbackURL(
                for: retryBrowser.authorizationURL
            ),
            error: nil
        )
        let snapshot = try await retry.value
        XCTAssertEqual(snapshot.status, .authorized)
    }

    @MainActor
    func testInvalidCallbackCannotExchangeOrReturnLate()
        async throws
    {
        let fixture = try makeFixture(
            tokenResponse: tokenResponse()
        )
        let task = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let browser = try await fixture.factory.nextSession()
        let mismatchedCallback = try XCTUnwrap(
            URL(
                string:
                    "castingcompass://oauth/callback?code=\(String(repeating: "E", count: 43))&state=\(String(repeating: "x", count: 43))"
            )
        )
        browser.complete(
            callbackURL: mismatchedCallback,
            error: nil
        )
        do {
            _ = try await task.value
            XCTFail("a state mismatch must fail closed")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .invalidCallback
            )
        }
        browser.complete(
            callbackURL: try callbackURL(
                for: browser.authorizationURL
            ),
            error: nil
        )
        await Task.yield()
        let requests = await fixture.transport
            .capturedRequests()
        XCTAssertEqual(requests.count, 0)
    }

    @MainActor
    func testSecondSignInAndInvalidCompletionFailClosed()
        async throws
    {
        let fixture = try makeFixture(
            tokenResponse: tokenResponse()
        )
        let first = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let browser = try await fixture.factory.nextSession()

        do {
            _ = try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
            XCTFail("concurrent sign-in must be rejected")
        } catch {
            XCTAssertEqual(
                error as? NativeSystemBrowserAuthorizationError,
                .signInAlreadyActive
            )
        }

        browser.complete(
            callbackURL: try callbackURL(
                for: browser.authorizationURL
            ),
            error: NSError(
                domain: "test.invalid-completion",
                code: 1
            )
        )
        do {
            _ = try await first.value
            XCTFail("callback plus error must be rejected")
        } catch {
            XCTAssertEqual(
                error as? NativeSystemBrowserAuthorizationError,
                .invalidCompletion
            )
        }
        let requests = await fixture.transport
            .capturedRequests()
        XCTAssertEqual(
            requests.count,
            0
        )
    }

    @MainActor
    func testFailedPresentationClearsAttemptForExplicitRetry()
        async throws
    {
        let fixture = try makeFixture(
            startResults: [false, true],
            tokenResponse: tokenResponse()
        )

        do {
            _ = try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
            XCTFail("a browser that does not start must fail")
        } catch {
            XCTAssertEqual(
                error as? NativeSystemBrowserAuthorizationError,
                .sessionDidNotStart
            )
        }

        let task = Task { @MainActor in
            try await fixture.authorizer.signIn(
                receivedAt: receivedAt
            )
        }
        let browser = try await fixture.factory.nextSession(
            after: 1
        )
        browser.complete(
            callbackURL: try callbackURL(
                for: browser.authorizationURL
            ),
            error: nil
        )
        let snapshot = try await task.value
        XCTAssertEqual(snapshot.status, .authorized)
    }

    private func callbackURL(
        for authorizationURL: URL
    ) throws -> URL {
        let components = try XCTUnwrap(
            URLComponents(
                url: authorizationURL,
                resolvingAgainstBaseURL: false
            )
        )
        let state = try XCTUnwrap(
            components.queryItems?
                .first(where: { $0.name == "state" })?
                .value
        )
        return try XCTUnwrap(
            URL(
                string:
                    "castingcompass://oauth/callback?code=\(String(repeating: "E", count: 43))&state=\(state)"
            )
        )
    }

    @MainActor
    private func makeFixture(
        startResults: [Bool] = [true],
        tokenResponse: Data
    ) throws -> BrowserFixture {
        let configuration = try NativeAuthConfiguration(
            baseURL: baseURL
        )
        let vault = BrowserMemoryVault()
        let session = try NativeAuthSession(
            configuration: configuration,
            vault: vault
        )
        let transport = BrowserScriptedTransport([
            .init(statusCode: 200, body: tokenResponse),
        ])
        let authCoordinator = NativeAuthCoordinator(
            session: session,
            transport: transport
        )
        let factory = BrowserSessionFactory(
            startResults: startResults
        )
        let authorizer = NativeSystemBrowserAuthorizer(
            flow: NativeSystemBrowserAuthorizationFlow(
                configuration: configuration
            ),
            authCoordinator: authCoordinator,
            presentationAnchorProvider: {
                ASPresentationAnchor()
            },
            makeSession: factory.makeSession
        )
        return BrowserFixture(
            authorizer: authorizer,
            transport: transport,
            factory: factory
        )
    }

    private func tokenResponse() -> Data {
        Data(
            #"{"accessToken":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","expiresIn":600,"refreshExpiresIn":2592000,"refreshToken":"BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB","scope":"profile:read trips:write","tokenType":"Bearer"}"#
                .utf8
        )
    }
}

@MainActor
private struct BrowserFixture {
    let authorizer: NativeSystemBrowserAuthorizer
    let transport: BrowserScriptedTransport
    let factory: BrowserSessionFactory
}

@MainActor
private final class BrowserSessionFactory {
    private var startResults: [Bool]
    private(set) var sessions:
        [FakeNativeSystemBrowserSession] = []

    init(startResults: [Bool]) {
        self.startResults = startResults
    }

    func makeSession(
        authorizationURL: URL,
        callbackURLScheme: String,
        completionHandler:
            @escaping ASWebAuthenticationSession.CompletionHandler
    ) -> any NativeSystemBrowserSession {
        let startResult = startResults.isEmpty
            ? true
            : startResults.removeFirst()
        let session = FakeNativeSystemBrowserSession(
            authorizationURL: authorizationURL,
            callbackURLScheme: callbackURLScheme,
            startResult: startResult,
            completionHandler: completionHandler
        )
        sessions.append(session)
        return session
    }

    func nextSession(
        after index: Int = 0
    ) async throws -> FakeNativeSystemBrowserSession {
        for _ in 0..<100 {
            if sessions.indices.contains(index) {
                return sessions[index]
            }
            await Task.yield()
        }
        throw BrowserTestError.sessionWasNotCreated
    }
}

@MainActor
private final class FakeNativeSystemBrowserSession:
    NativeSystemBrowserSession
{
    let authorizationURL: URL
    let callbackURLScheme: String
    var presentationContextProvider:
        (any ASWebAuthenticationPresentationContextProviding)?
    var prefersEphemeralWebBrowserSession = false
    private(set) var startWasCalled = false
    private(set) var cancelWasCalled = false

    private let startResult: Bool
    private let completionHandler:
        ASWebAuthenticationSession.CompletionHandler

    init(
        authorizationURL: URL,
        callbackURLScheme: String,
        startResult: Bool,
        completionHandler:
            @escaping ASWebAuthenticationSession.CompletionHandler
    ) {
        self.authorizationURL = authorizationURL
        self.callbackURLScheme = callbackURLScheme
        self.startResult = startResult
        self.completionHandler = completionHandler
    }

    func start() -> Bool {
        startWasCalled = true
        return startResult
    }

    func cancel() {
        cancelWasCalled = true
    }

    func complete(
        callbackURL: URL?,
        error: Error?
    ) {
        completionHandler(callbackURL, error)
    }
}

private actor BrowserScriptedTransport: NativeHTTPTransport {
    private var responses: [NativeHTTPResponse]
    private var requests: [URLRequest] = []

    init(_ responses: [NativeHTTPResponse]) {
        self.responses = responses
    }

    func send(
        _ request: URLRequest,
        maximumResponseBytes: Int
    ) async throws -> NativeHTTPResponse {
        requests.append(request)
        guard !responses.isEmpty else {
            throw NativeHTTPTransportError.transportFailure
        }
        let response = responses.removeFirst()
        guard response.body.count <= maximumResponseBytes else {
            throw NativeHTTPTransportError.responseTooLarge
        }
        return response
    }

    func capturedRequests() -> [URLRequest] {
        requests
    }
}

private final class BrowserMemoryVault:
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

private enum BrowserTestError: Error {
    case sessionWasNotCreated
}
