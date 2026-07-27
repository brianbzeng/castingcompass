import Foundation
import XCTest

@testable import CastingCompassNativeCore

final class NativeAuthSessionTests: XCTestCase {
    private let baseURL = URL(string: "https://staging.castingcompass.example")!
    private let accessToken = String(repeating: "A", count: 43)
    private let refreshToken = String(repeating: "B", count: 43)
    private let nextAccessToken = String(repeating: "C", count: 43)
    private let nextRefreshToken = String(repeating: "D", count: 43)
    private let code = String(repeating: "E", count: 43)
    private let verifier = String(repeating: "v", count: 43)
    private let state = String(repeating: "s", count: 43)
    private let receivedAt = Date(timeIntervalSince1970: 1_786_291_200)

    func testConfigurationIsHTTPSRootAndCallbackExact() throws {
        let configuration = try makeConfiguration()
        XCTAssertEqual(configuration.clientID, "com.castingcompass.app")
        XCTAssertEqual(
            configuration.redirectURI,
            "castingcompass://oauth/callback"
        )
        for invalid in [
            "http://staging.castingcompass.example",
            "https://user@staging.castingcompass.example",
            "https://staging.castingcompass.example:8443",
            "https://staging.castingcompass.example/base",
            "https://staging.castingcompass.example/?query=true",
        ] {
            XCTAssertThrowsError(
                try NativeAuthConfiguration(
                    baseURL: try XCTUnwrap(URL(string: invalid))
                )
            )
        }
        XCTAssertThrowsError(
            try NativeAuthConfiguration(
                baseURL: baseURL,
                redirectURI: "castingcompass://oauth/other"
            )
        )
    }

    func testPKCEAuthorizationAndCallbackProduceExactBackchannelRequest()
        async throws
    {
        let configuration = try makeConfiguration()
        let attempt = try NativeAuthorizationAttempt(
            configuration: configuration,
            verifier: verifier,
            state: state
        )
        let authorizationURL = await attempt.authorizationURL
        let components = try XCTUnwrap(
            URLComponents(
                url: authorizationURL,
                resolvingAgainstBaseURL: false
            )
        )
        XCTAssertEqual(components.path, "/native/authorize")
        let items = try XCTUnwrap(components.queryItems)
        XCTAssertEqual(items.count, 6)
        XCTAssertEqual(
            Dictionary(uniqueKeysWithValues: items.map {
                ($0.name, $0.value ?? "")
            }),
            [
                "client_id": "com.castingcompass.app",
                "redirect_uri": "castingcompass://oauth/callback",
                "code_challenge":
                    "7w_YNF9DSfIdPf_pRjSq646_kPr-2-o9NAl16JGghdM",
                "code_challenge_method": "S256",
                "state": state,
                "scope": "profile:read trips:write",
            ]
        )

        let callback = try XCTUnwrap(URL(
            string:
                "castingcompass://oauth/callback?code=\(code)&state=\(state)"
        ))
        let request = try await attempt.consumeCallback(callback)
        XCTAssertEqual(request.method, "POST")
        XCTAssertEqual(request.url.path, "/api/native/oauth/token")
        XCTAssertEqual(
            request.headers,
            [
                "Content-Type": "application/json",
                "X-CastingCompass-API-Version": "1",
            ]
        )
        XCTAssertEqual(request.description, "NativeAuthBackchannelRequest(redacted)")
        let body = try XCTUnwrap(
            JSONSerialization.jsonObject(with: request.body)
                as? [String: String]
        )
        XCTAssertEqual(
            body,
            [
                "grantType": "authorization_code",
                "clientId": "com.castingcompass.app",
                "redirectUri": "castingcompass://oauth/callback",
                "code": code,
                "codeVerifier": verifier,
            ]
        )
        let urlRequest = try request.makeURLRequest()
        XCTAssertNil(urlRequest.value(forHTTPHeaderField: "Cookie"))
        XCTAssertNil(urlRequest.value(forHTTPHeaderField: "Origin"))
        XCTAssertNil(urlRequest.value(forHTTPHeaderField: "Authorization"))

        do {
            _ = try await attempt.consumeCallback(callback)
            XCTFail("a callback must be single-use")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .callbackAlreadyConsumed
            )
        }
    }

    func testCallbackMismatchInvalidatesAttempt() async throws {
        let attempt = try NativeAuthorizationAttempt(
            configuration: try makeConfiguration(),
            verifier: verifier,
            state: state
        )
        let mismatch = try XCTUnwrap(URL(
            string:
                "castingcompass://oauth/callback?code=\(code)&state=\(String(repeating: "x", count: 43))"
        ))
        do {
            _ = try await attempt.consumeCallback(mismatch)
            XCTFail("a mismatched callback must fail")
        } catch {
            XCTAssertEqual(error as? NativeAuthError, .invalidCallback)
        }
        let correct = try XCTUnwrap(URL(
            string:
                "castingcompass://oauth/callback?code=\(code)&state=\(state)"
        ))
        do {
            _ = try await attempt.consumeCallback(correct)
            XCTFail("a failed attempt must remain invalidated")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .callbackAlreadyConsumed
            )
        }
    }

    func testEphemeralBackchannelHasNoAmbientStores() {
        let configuration =
            NativeAuthBackchannel.makeEphemeralSessionConfiguration()
        XCTAssertNil(configuration.httpCookieStorage)
        XCTAssertFalse(configuration.httpShouldSetCookies)
        XCTAssertNil(configuration.urlCredentialStorage)
        XCTAssertNil(configuration.urlCache)
        XCTAssertEqual(
            configuration.requestCachePolicy,
            .reloadIgnoringLocalCacheData
        )
        XCTAssertEqual(
            configuration.httpAdditionalHeaders as? [String: String],
            [:]
        )
    }

    func testExactTokenResponseStoresOneAtomicKeychainEnvelope()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        let session = try NativeAuthSession(
            configuration: try makeConfiguration(),
            vault: vault
        )
        let snapshot = try await session.acceptAuthorizationCodeExchange(
            responseData: tokenResponse(),
            receivedAt: receivedAt
        )
        XCTAssertEqual(snapshot.status, .authorized)
        let immediateAccessToken = try await session
            .accessTokenForImmediateRequest(
                now: receivedAt
            )
        XCTAssertEqual(
            immediateAccessToken,
            accessToken
        )
        XCTAssertEqual(vault.allSlots().count, 1)
        let slot = try XCTUnwrap(vault.allSlots().first)
        XCTAssertEqual(slot.kind, .oauthSession)
        let stored = try XCTUnwrap(vault.value(for: slot))
        XCTAssertTrue(stored.contains(Data(accessToken.utf8)))
        XCTAssertTrue(stored.contains(Data(refreshToken.utf8)))
    }

    func testRefreshIsSingleFlightAndLostOutcomeDestroysFamily()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        let session = try await authorizedSession(vault: vault)
        let request = try await session.makeRefreshRequest(now: receivedAt)
        let body = try XCTUnwrap(
            JSONSerialization.jsonObject(with: request.body)
                as? [String: String]
        )
        XCTAssertEqual(
            body,
            [
                "grantType": "refresh_token",
                "clientId": "com.castingcompass.app",
                "refreshToken": refreshToken,
            ]
        )
        do {
            _ = try await session.makeRefreshRequest(now: receivedAt)
            XCTFail("refresh must be single-flight")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .invalidSessionState
            )
        }

        let snapshot = try await session
            .invalidateAfterRefreshWasDispatched()
        XCTAssertEqual(snapshot.status, .requiresSignIn)
        do {
            _ = try await session.accessTokenForImmediateRequest(
                now: receivedAt
            )
            XCTFail("lost refresh response must destroy access authority")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .invalidSessionState
            )
        }
        let stored = try XCTUnwrap(
            vault.value(for: try sessionSlot())
        )
        let text = String(decoding: stored, as: UTF8.self)
        XCTAssertFalse(text.contains(accessToken))
        XCTAssertFalse(text.contains(refreshToken))
        XCTAssertTrue(text.contains("requires_sign_in"))
    }

    func testRefreshCancelBeforeDispatchPreservesCurrentPair()
        async throws
    {
        let session = try await authorizedSession()
        _ = try await session.makeRefreshRequest(now: receivedAt)
        let snapshot = try await session.cancelRefreshBeforeDispatch()
        XCTAssertEqual(snapshot.status, .authorized)
        let preservedAccessToken = try await session
            .accessTokenForImmediateRequest(
                now: receivedAt
            )
        XCTAssertEqual(
            preservedAccessToken,
            accessToken
        )
    }

    func testPersistedInFlightMarkerPreventsCrossInstanceReuse()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        let first = try await authorizedSession(vault: vault)
        _ = try await first.makeRefreshRequest(now: receivedAt)
        let inFlight = try XCTUnwrap(
            vault.value(for: try sessionSlot())
        )
        let inFlightText = String(decoding: inFlight, as: UTF8.self)
        XCTAssertTrue(inFlightText.contains(#""state":"refreshing""#))
        XCTAssertFalse(inFlightText.contains(accessToken))
        XCTAssertFalse(inFlightText.contains(refreshToken))

        let second = try NativeAuthSession(
            configuration: try makeConfiguration(),
            vault: vault
        )
        let restored = try await second.restore(now: receivedAt)
        XCTAssertEqual(restored.status, .requiresSignIn)
        do {
            _ = try await second.makeRefreshRequest(now: receivedAt)
            XCTFail("a second actor must not reuse an in-flight predecessor")
        } catch {
            XCTAssertEqual(
                error as? NativeAuthError,
                .invalidSessionState
            )
        }
    }

    func testExactRotationReplacesPairWithoutExtendingFamily()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        let session = try await authorizedSession(vault: vault)
        _ = try await session.makeRefreshRequest(now: receivedAt)
        let rotatedAt = receivedAt.addingTimeInterval(1_000)
        let snapshot = try await session.acceptRefreshResponse(
            tokenResponse(
                accessToken: nextAccessToken,
                refreshToken: nextRefreshToken,
                refreshExpiresIn: 2_591_000
            ),
            receivedAt: rotatedAt
        )
        XCTAssertEqual(snapshot.status, .authorized)
        XCTAssertEqual(
            snapshot.refreshExpiresAt,
            receivedAt.addingTimeInterval(2_592_000)
        )
        let rotatedAccessToken = try await session
            .accessTokenForImmediateRequest(now: rotatedAt)
        XCTAssertEqual(
            rotatedAccessToken,
            nextAccessToken
        )
        let stored = try XCTUnwrap(
            vault.value(for: try sessionSlot())
        )
        let text = String(decoding: stored, as: UTF8.self)
        XCTAssertFalse(text.contains(accessToken))
        XCTAssertFalse(text.contains(refreshToken))
        XCTAssertTrue(text.contains(nextAccessToken))
        XCTAssertTrue(text.contains(nextRefreshToken))
    }

    func testRefreshResponseCannotExtendFamilyAndFailsClosed()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        let session = try await authorizedSession(vault: vault)
        _ = try await session.makeRefreshRequest(now: receivedAt)
        do {
            _ = try await session.acceptRefreshResponse(
                tokenResponse(
                    accessToken: nextAccessToken,
                    refreshToken: nextRefreshToken,
                    refreshExpiresIn: 2_592_000
                ),
                receivedAt: receivedAt.addingTimeInterval(1_000)
            )
            XCTFail("rotation must not extend the original family")
        } catch {
            XCTAssertEqual(error as? NativeAuthError, .invalidResponse)
        }
        let failedRotationSnapshot = await session.snapshot()
        XCTAssertEqual(
            failedRotationSnapshot.status,
            .requiresSignIn
        )
        let stored = try XCTUnwrap(
            vault.value(for: try sessionSlot())
        )
        XCTAssertFalse(String(decoding: stored, as: UTF8.self)
            .contains(nextRefreshToken))
    }

    func testSignOutNeedsExactReceiptAndNeverRetainsLocalTokens()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        let session = try await authorizedSession(vault: vault)
        let request = try await session.makeSignOutRequest()
        let body = try XCTUnwrap(
            JSONSerialization.jsonObject(with: request.body)
                as? [String: String]
        )
        XCTAssertEqual(body["token"], refreshToken)
        XCTAssertEqual(body["tokenTypeHint"], "refresh_token")
        let snapshot = try await session.acceptSignOutResponse(
            Data(#"{"revoked":true}"#.utf8)
        )
        XCTAssertEqual(snapshot.status, .signedOut)

        let second = try await authorizedSession(vault: vault)
        _ = try await second.makeSignOutRequest()
        do {
            _ = try await second.acceptSignOutResponse(
                Data(#"{"revoked":true,"extra":false}"#.utf8)
            )
            XCTFail("unknown revoke response fields must fail")
        } catch {
            XCTAssertEqual(error as? NativeAuthError, .invalidResponse)
        }
        let secondSnapshot = await second.snapshot()
        XCTAssertEqual(
            secondSnapshot.status,
            .requiresSignIn
        )
    }

    func testRestoreRejectsTamperingAndDoesNotResurrectTokens()
        async throws
    {
        let vault = AuthMemoryCredentialVault()
        _ = try await authorizedSession(vault: vault)
        let slot = try sessionSlot()
        let original = try XCTUnwrap(vault.value(for: slot))
        let text = String(decoding: original, as: UTF8.self)
        let duplicate = Data(
            text.replacingOccurrences(
                of: #""scope":"profile:read trips:write""#,
                with:
                    #""scope":"profile:read trips:write","scope":"profile:read trips:write""#
            ).utf8
        )
        try vault.store(duplicate, in: slot)

        let restored = try NativeAuthSession(
            configuration: try makeConfiguration(),
            vault: vault
        )
        do {
            _ = try await restored.restore(now: receivedAt)
            XCTFail("duplicate Keychain fields must fail closed")
        } catch {
            XCTAssertEqual(error as? NativeAuthError, .invalidResponse)
        }
        let restoredSnapshot = await restored.snapshot()
        XCTAssertEqual(
            restoredSnapshot.status,
            .requiresSignIn
        )
        let marker = try XCTUnwrap(vault.value(for: slot))
        XCTAssertFalse(String(decoding: marker, as: UTF8.self)
            .contains(accessToken))
    }

    func testTokenParserRejectsUnknownDuplicateAndInvalidSemantics()
        async throws
    {
        let invalidBodies = [
            #"{"accessToken":"\#(accessToken)","tokenType":"Bearer","expiresIn":600,"refreshToken":"\#(refreshToken)","refreshExpiresIn":2592000,"scope":"profile:read trips:write","extra":true}"#,
            #"{"accessToken":"\#(accessToken)","accessToken":"\#(accessToken)","tokenType":"Bearer","expiresIn":600,"refreshToken":"\#(refreshToken)","refreshExpiresIn":2592000,"scope":"profile:read trips:write"}"#,
            #"{"accessToken":"\#(accessToken)","tokenType":"bearer","expiresIn":600,"refreshToken":"\#(refreshToken)","refreshExpiresIn":2592000,"scope":"profile:read trips:write"}"#,
            #"{"accessToken":"\#(accessToken)","tokenType":"Bearer","expiresIn":600.5,"refreshToken":"\#(refreshToken)","refreshExpiresIn":2592000,"scope":"profile:read trips:write"}"#,
            #"{"accessToken":"\#(accessToken)","tokenType":"Bearer","expiresIn":600,"refreshToken":"\#(accessToken)","refreshExpiresIn":2592000,"scope":"profile:read trips:write"}"#,
        ]
        for body in invalidBodies {
            let session = try NativeAuthSession(
                configuration: try makeConfiguration(),
                vault: AuthMemoryCredentialVault()
            )
            do {
                _ = try await session.acceptAuthorizationCodeExchange(
                    responseData: Data(body.utf8),
                    receivedAt: receivedAt
                )
                XCTFail("invalid token response must fail")
            } catch {
                XCTAssertEqual(error as? NativeAuthError, .invalidResponse)
            }
        }
    }

    private func makeConfiguration() throws -> NativeAuthConfiguration {
        try NativeAuthConfiguration(baseURL: baseURL)
    }

    private func authorizedSession(
        vault: AuthMemoryCredentialVault = AuthMemoryCredentialVault()
    ) async throws -> NativeAuthSession {
        let session = try NativeAuthSession(
            configuration: try makeConfiguration(),
            vault: vault
        )
        _ = try await session.acceptAuthorizationCodeExchange(
            responseData: tokenResponse(),
            receivedAt: receivedAt
        )
        return session
    }

    private func sessionSlot() throws -> NativeTripCredentialSlot {
        try NativeTripCredentialSlot(
            kind: .oauthSession,
            account: "primary"
        )
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
}

private final class AuthMemoryCredentialVault:
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

    func value(for slot: NativeTripCredentialSlot) -> Data? {
        lock.lock()
        let value = values[slot]
        lock.unlock()
        return value
    }

    func allSlots() -> [NativeTripCredentialSlot] {
        lock.lock()
        let slots = Array(values.keys)
        lock.unlock()
        return slots
    }
}
