import CryptoKit
import Foundation

public enum NativeAuthContract {
    public static let clientID = "com.castingcompass.app"
    public static let redirectURI = "castingcompass://oauth/callback"
    public static let scope = "profile:read trips:write"
    public static let codeChallengeMethod = "S256"
    public static let tokenType = "Bearer"
    public static let authorizationPath = "/native/authorize"
    public static let tokenPath = "/api/native/oauth/token"
    public static let revokePath = "/api/native/oauth/revoke"
    public static let accessTokenLifetimeSeconds = 600
    public static let maximumRefreshTokenLifetimeSeconds = 2_592_000
    public static let maximumResponseBytes = 4_096
    public static let keychainEnvelopeVersion =
        "castingcompass.native-auth-keychain/1.0.0"
}

public enum NativeAuthError: Error, Equatable {
    case invalidConfiguration
    case invalidPKCEVerifier
    case invalidState
    case invalidCallback
    case callbackAlreadyConsumed
    case invalidResponse
    case invalidSessionState
    case accessTokenExpired
    case refreshTokenExpired
    case credentialStorageFailed
}

public struct NativeAuthConfiguration: Equatable, Sendable {
    public let baseURL: URL
    public let clientID: String
    public let redirectURI: String

    public init(
        baseURL: URL,
        clientID: String = NativeAuthContract.clientID,
        redirectURI: String = NativeAuthContract.redirectURI
    ) throws {
        guard
            let base = URLComponents(
                url: baseURL,
                resolvingAgainstBaseURL: false
            ),
            base.scheme == "https",
            base.host?.isEmpty == false,
            base.user == nil,
            base.password == nil,
            base.port == nil,
            base.query == nil,
            base.fragment == nil,
            base.path.isEmpty || base.path == "/",
            clientID.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$"#,
                options: .regularExpression
            ) != nil,
            let redirect = URLComponents(string: redirectURI),
            redirect.scheme == "castingcompass",
            redirect.host == "oauth",
            redirect.path == "/callback",
            redirect.user == nil,
            redirect.password == nil,
            redirect.port == nil,
            redirect.query == nil,
            redirect.fragment == nil
        else {
            throw NativeAuthError.invalidConfiguration
        }
        var canonicalBase = base
        canonicalBase.path = ""
        guard let canonicalBaseURL = canonicalBase.url else {
            throw NativeAuthError.invalidConfiguration
        }
        self.baseURL = canonicalBaseURL
        self.clientID = clientID
        self.redirectURI = redirectURI
    }

    public func authorizationURL(
        codeChallenge: String,
        state: String
    ) throws -> URL {
        guard
            nativeAuthOpaqueTokenPattern(codeChallenge),
            nativeAuthStatePattern(state)
        else {
            throw NativeAuthError.invalidConfiguration
        }
        var components = URLComponents(
            url: baseURL.appendingPathComponent(
                String(NativeAuthContract.authorizationPath.dropFirst())
            ),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(
                name: "code_challenge_method",
                value: NativeAuthContract.codeChallengeMethod
            ),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "scope", value: NativeAuthContract.scope),
        ]
        guard let url = components?.url else {
            throw NativeAuthError.invalidConfiguration
        }
        return url
    }

    func endpoint(_ path: String) throws -> URL {
        guard [
            NativeAuthContract.tokenPath,
            NativeAuthContract.revokePath,
        ].contains(path) else {
            throw NativeAuthError.invalidConfiguration
        }
        return baseURL.appendingPathComponent(String(path.dropFirst()))
    }
}

public actor NativeAuthorizationAttempt {
    private enum AttemptState {
        case active
        case consumed
        case invalidated
    }

    public let authorizationURL: URL

    private let configuration: NativeAuthConfiguration
    private let verifier: String
    private let stateValue: String
    private var attemptState = AttemptState.active

    public init(configuration: NativeAuthConfiguration) throws {
        let verifier = try NativeTripIdentity.makeRandomToken()
        let state = try NativeTripIdentity.makeRandomToken()
        try self.init(
            configuration: configuration,
            verifier: verifier,
            state: state
        )
    }

    init(
        configuration: NativeAuthConfiguration,
        verifier: String,
        state: String
    ) throws {
        guard nativeAuthPKCEVerifierPattern(verifier) else {
            throw NativeAuthError.invalidPKCEVerifier
        }
        guard nativeAuthStatePattern(state) else {
            throw NativeAuthError.invalidState
        }
        let challenge = nativeAuthBase64URL(
            Data(SHA256.hash(data: Data(verifier.utf8)))
        )
        guard nativeAuthOpaqueTokenPattern(challenge) else {
            throw NativeAuthError.invalidPKCEVerifier
        }
        self.configuration = configuration
        self.verifier = verifier
        self.stateValue = state
        self.authorizationURL = try configuration.authorizationURL(
            codeChallenge: challenge,
            state: state
        )
    }

    public func consumeCallback(
        _ callbackURL: URL
    ) throws -> NativeAuthBackchannelRequest {
        guard attemptState == .active else {
            throw NativeAuthError.callbackAlreadyConsumed
        }
        attemptState = .invalidated
        let code = try verifyCallback(callbackURL)
        let request = try NativeAuthBackchannelRequest.token(
            configuration: configuration,
            fields: [
                "grantType": "authorization_code",
                "clientId": configuration.clientID,
                "redirectUri": configuration.redirectURI,
                "code": code,
                "codeVerifier": verifier,
            ]
        )
        attemptState = .consumed
        return request
    }

    public func cancel() {
        attemptState = .invalidated
    }

    private func verifyCallback(_ callbackURL: URL) throws -> String {
        guard
            let expected = URLComponents(
                string: configuration.redirectURI
            ),
            let actual = URLComponents(
                url: callbackURL,
                resolvingAgainstBaseURL: false
            ),
            actual.scheme == expected.scheme,
            actual.host == expected.host,
            actual.path == expected.path,
            actual.user == expected.user,
            actual.password == expected.password,
            actual.port == expected.port,
            actual.fragment == nil,
            let queryItems = actual.queryItems,
            queryItems.count == 2
        else {
            throw NativeAuthError.invalidCallback
        }
        let codeValues = queryItems
            .filter { $0.name == "code" }
            .compactMap(\.value)
        let stateValues = queryItems
            .filter { $0.name == "state" }
            .compactMap(\.value)
        guard
            queryItems.allSatisfy({ $0.name == "code" || $0.name == "state" }),
            codeValues.count == 1,
            stateValues.count == 1,
            nativeAuthOpaqueTokenPattern(codeValues[0]),
            nativeAuthConstantTimeEqual(stateValues[0], stateValue)
        else {
            throw NativeAuthError.invalidCallback
        }
        return codeValues[0]
    }
}

public struct NativeAuthBackchannelRequest:
    Equatable,
    Sendable,
    CustomStringConvertible,
    CustomDebugStringConvertible
{
    public let method: String
    public let url: URL
    public let body: Data
    public let headers: [String: String]

    public var description: String {
        "NativeAuthBackchannelRequest(redacted)"
    }

    public var debugDescription: String {
        description
    }

    public func makeURLRequest() throws -> URLRequest {
        try validate()
        var request = URLRequest(
            url: url,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 30
        )
        request.httpMethod = method
        request.httpBody = body
        for (name, value) in headers {
            request.setValue(value, forHTTPHeaderField: name)
        }
        return request
    }

    static func token(
        configuration: NativeAuthConfiguration,
        fields: [String: String]
    ) throws -> NativeAuthBackchannelRequest {
        let request = NativeAuthBackchannelRequest(
            method: "POST",
            url: try configuration.endpoint(NativeAuthContract.tokenPath),
            body: try nativeAuthJSONBody(fields),
            headers: nativeAuthBackchannelHeaders()
        )
        try request.validate()
        return request
    }

    static func revoke(
        configuration: NativeAuthConfiguration,
        token: String,
        tokenTypeHint: String
    ) throws -> NativeAuthBackchannelRequest {
        guard
            nativeAuthOpaqueTokenPattern(token),
            tokenTypeHint == "access_token" ||
                tokenTypeHint == "refresh_token"
        else {
            throw NativeAuthError.invalidSessionState
        }
        let request = NativeAuthBackchannelRequest(
            method: "POST",
            url: try configuration.endpoint(NativeAuthContract.revokePath),
            body: try nativeAuthJSONBody([
                "clientId": configuration.clientID,
                "token": token,
                "tokenTypeHint": tokenTypeHint,
            ]),
            headers: nativeAuthBackchannelHeaders()
        )
        try request.validate()
        return request
    }

    private func validate() throws {
        guard
            method == "POST",
            url.scheme == "https",
            url.user == nil,
            url.password == nil,
            url.query == nil,
            url.fragment == nil,
            [
                NativeAuthContract.tokenPath,
                NativeAuthContract.revokePath,
            ].contains(url.path),
            body.count <= NativeAuthContract.maximumResponseBytes,
            headers == nativeAuthBackchannelHeaders(),
            !headers.keys.contains(where: {
                ["authorization", "cookie", "origin"].contains(
                    $0.lowercased()
                )
            })
        else {
            throw NativeAuthError.invalidConfiguration
        }
    }
}

public enum NativeAuthBackchannel {
    public static func makeEphemeralSessionConfiguration()
        -> URLSessionConfiguration
    {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.httpAdditionalHeaders = [:]
        return configuration
    }
}

public enum NativeAuthSessionStatus: String, Equatable, Sendable {
    case signedOut = "signed_out"
    case authorized
    case refreshing
    case revoking
    case requiresSignIn = "requires_sign_in"
}

public struct NativeAuthSessionSnapshot: Equatable, Sendable {
    public let status: NativeAuthSessionStatus
    public let accessExpiresAt: Date?
    public let refreshExpiresAt: Date?

    public init(
        status: NativeAuthSessionStatus,
        accessExpiresAt: Date?,
        refreshExpiresAt: Date?
    ) {
        self.status = status
        self.accessExpiresAt = accessExpiresAt
        self.refreshExpiresAt = refreshExpiresAt
    }
}

public actor NativeAuthSession {
    private struct TokenPair: Equatable, Sendable {
        let accessToken: String
        let refreshToken: String
        let accessExpiresAt: Date
        let refreshExpiresAt: Date
    }

    private let configuration: NativeAuthConfiguration
    private let vault: any NativeTripCredentialVault
    private let sessionSlot: NativeTripCredentialSlot
    private var status: NativeAuthSessionStatus = .signedOut
    private var tokenPair: TokenPair?

    public init(
        configuration: NativeAuthConfiguration,
        vault: any NativeTripCredentialVault,
        sessionAccount: String = "primary"
    ) throws {
        self.configuration = configuration
        self.vault = vault
        self.sessionSlot = try NativeTripCredentialSlot(
            kind: .oauthSession,
            account: sessionAccount
        )
    }

    @discardableResult
    public func restore(now: Date = Date()) throws
        -> NativeAuthSessionSnapshot
    {
        guard status != .refreshing, status != .revoking else {
            throw NativeAuthError.invalidSessionState
        }
        do {
            let data = try vault.read(from: sessionSlot)
            switch try Self.decodeStoredEnvelope(
                data,
                expectedClientID: configuration.clientID
            ) {
            case let .active(pair):
                if pair.refreshExpiresAt <= now {
                    try writeMarker(.requiresSignIn)
                    tokenPair = nil
                    status = .requiresSignIn
                    throw NativeAuthError.refreshTokenExpired
                }
                tokenPair = pair
                status = .authorized
            case .signedOut:
                tokenPair = nil
                status = .signedOut
            case .requiresSignIn:
                tokenPair = nil
                status = .requiresSignIn
            case .interruptedSensitiveOperation:
                tokenPair = nil
                status = .requiresSignIn
                try writeMarker(.requiresSignIn)
            }
        } catch NativeTripCredentialVaultError.notFound {
            tokenPair = nil
            status = .signedOut
        } catch NativeAuthError.refreshTokenExpired {
            throw NativeAuthError.refreshTokenExpired
        } catch let error as NativeAuthError {
            tokenPair = nil
            status = .requiresSignIn
            do {
                try writeMarker(.requiresSignIn)
            } catch {
                throw NativeAuthError.credentialStorageFailed
            }
            throw error
        } catch {
            tokenPair = nil
            status = .requiresSignIn
            do {
                try writeMarker(.requiresSignIn)
            } catch {
                throw NativeAuthError.credentialStorageFailed
            }
            throw NativeAuthError.invalidResponse
        }
        return snapshot()
    }

    @discardableResult
    public func acceptAuthorizationCodeExchange(
        responseData: Data,
        receivedAt: Date = Date()
    ) throws -> NativeAuthSessionSnapshot {
        guard
            status == .signedOut || status == .requiresSignIn
        else {
            throw NativeAuthError.invalidSessionState
        }
        let response = try NativeAuthTokenResponse.parseExact(responseData)
        let pair = try Self.makePair(
            response: response,
            receivedAt: receivedAt,
            previousRefreshExpiry: nil
        )
        try storeActive(pair)
        tokenPair = pair
        status = .authorized
        return snapshot()
    }

    public func makeRefreshRequest(
        now: Date = Date()
    ) throws -> NativeAuthBackchannelRequest {
        guard status == .authorized, let pair = tokenPair else {
            throw NativeAuthError.invalidSessionState
        }
        guard pair.refreshExpiresAt > now else {
            try invalidateFamily()
            throw NativeAuthError.refreshTokenExpired
        }
        let request = try NativeAuthBackchannelRequest.token(
            configuration: configuration,
            fields: [
                "grantType": "refresh_token",
                "clientId": configuration.clientID,
                "refreshToken": pair.refreshToken,
            ]
        )
        do {
            try writeMarker(.refreshing)
        } catch {
            tokenPair = nil
            status = .requiresSignIn
            try? vault.delete(sessionSlot)
            throw NativeAuthError.credentialStorageFailed
        }
        status = .refreshing
        return request
    }

    @discardableResult
    public func cancelRefreshBeforeDispatch()
        throws -> NativeAuthSessionSnapshot
    {
        guard status == .refreshing, let pair = tokenPair else {
            throw NativeAuthError.invalidSessionState
        }
        try storeActive(pair)
        status = .authorized
        return snapshot()
    }

    @discardableResult
    public func acceptRefreshResponse(
        _ responseData: Data,
        receivedAt: Date = Date()
    ) throws -> NativeAuthSessionSnapshot {
        guard status == .refreshing, let previous = tokenPair else {
            throw NativeAuthError.invalidSessionState
        }
        do {
            let response = try NativeAuthTokenResponse.parseExact(responseData)
            let pair = try Self.makePair(
                response: response,
                receivedAt: receivedAt,
                previousRefreshExpiry: previous.refreshExpiresAt
            )
            try storeActive(pair)
            tokenPair = pair
            status = .authorized
            return snapshot()
        } catch {
            try invalidateFamily()
            throw error
        }
    }

    @discardableResult
    public func invalidateAfterRefreshWasDispatched()
        throws -> NativeAuthSessionSnapshot
    {
        guard status == .refreshing else {
            throw NativeAuthError.invalidSessionState
        }
        try invalidateFamily()
        return snapshot()
    }

    public func makeSignOutRequest()
        throws -> NativeAuthBackchannelRequest
    {
        guard status == .authorized, let pair = tokenPair else {
            throw NativeAuthError.invalidSessionState
        }
        let request = try NativeAuthBackchannelRequest.revoke(
            configuration: configuration,
            token: pair.refreshToken,
            tokenTypeHint: "refresh_token"
        )
        do {
            try writeMarker(.revoking)
        } catch {
            tokenPair = nil
            status = .requiresSignIn
            try? vault.delete(sessionSlot)
            throw NativeAuthError.credentialStorageFailed
        }
        status = .revoking
        return request
    }

    @discardableResult
    public func cancelSignOutBeforeDispatch()
        throws -> NativeAuthSessionSnapshot
    {
        guard status == .revoking, let pair = tokenPair else {
            throw NativeAuthError.invalidSessionState
        }
        try storeActive(pair)
        status = .authorized
        return snapshot()
    }

    @discardableResult
    public func acceptSignOutResponse(
        _ responseData: Data
    ) throws -> NativeAuthSessionSnapshot {
        guard status == .revoking else {
            throw NativeAuthError.invalidSessionState
        }
        guard NativeAuthRevocationResponse.isExact(responseData) else {
            try clearLocalCredentials(marker: .requiresSignIn)
            throw NativeAuthError.invalidResponse
        }
        try clearLocalCredentials(marker: .signedOut)
        return snapshot()
    }

    @discardableResult
    public func finishSignOutWithUnconfirmedRemoteResult()
        throws -> NativeAuthSessionSnapshot
    {
        guard status == .revoking else {
            throw NativeAuthError.invalidSessionState
        }
        try clearLocalCredentials(marker: .requiresSignIn)
        return snapshot()
    }

    @discardableResult
    public func invalidateForExternalAuthorityChange()
        throws -> NativeAuthSessionSnapshot
    {
        guard status != .refreshing, status != .revoking else {
            throw NativeAuthError.invalidSessionState
        }
        try clearLocalCredentials(marker: .requiresSignIn)
        return snapshot()
    }

    public func snapshot() -> NativeAuthSessionSnapshot {
        NativeAuthSessionSnapshot(
            status: status,
            accessExpiresAt: tokenPair?.accessExpiresAt,
            refreshExpiresAt: tokenPair?.refreshExpiresAt
        )
    }

    public func accessTokenForImmediateRequest(
        now: Date = Date()
    ) throws -> String {
        guard status == .authorized, let pair = tokenPair else {
            throw NativeAuthError.invalidSessionState
        }
        guard pair.accessExpiresAt > now else {
            throw NativeAuthError.accessTokenExpired
        }
        return pair.accessToken
    }

    private func storeActive(_ pair: TokenPair) throws {
        do {
            try vault.store(
                try Self.encodeActiveEnvelope(
                    pair,
                    clientID: configuration.clientID
                ),
                in: sessionSlot
            )
        } catch {
            tokenPair = nil
            status = .requiresSignIn
            do {
                try writeMarker(.requiresSignIn)
            } catch {
                throw NativeAuthError.credentialStorageFailed
            }
            throw NativeAuthError.credentialStorageFailed
        }
    }

    private func invalidateFamily() throws {
        try clearLocalCredentials(marker: .requiresSignIn)
    }

    private func clearLocalCredentials(
        marker: NativeAuthSessionStatus
    ) throws {
        tokenPair = nil
        status = marker
        do {
            try writeMarker(marker)
        } catch {
            status = .requiresSignIn
            throw NativeAuthError.credentialStorageFailed
        }
    }

    private func writeMarker(
        _ marker: NativeAuthSessionStatus
    ) throws {
        guard [
            NativeAuthSessionStatus.signedOut,
            .requiresSignIn,
            .refreshing,
            .revoking,
        ].contains(marker) else {
            throw NativeAuthError.invalidSessionState
        }
        try vault.store(
            try nativeAuthJSONBody([
                "schemaVersion": NativeAuthContract.keychainEnvelopeVersion,
                "state": marker.rawValue,
            ]),
            in: sessionSlot
        )
    }

    private enum StoredEnvelope {
        case active(TokenPair)
        case signedOut
        case requiresSignIn
        case interruptedSensitiveOperation
    }

    private static func encodeActiveEnvelope(
        _ pair: TokenPair,
        clientID: String
    ) throws -> Data {
        try nativeAuthJSONBody([
            "schemaVersion": NativeAuthContract.keychainEnvelopeVersion,
            "state": NativeAuthSessionStatus.authorized.rawValue,
            "clientId": clientID,
            "scope": NativeAuthContract.scope,
            "accessToken": pair.accessToken,
            "refreshToken": pair.refreshToken,
            "accessExpiresAt": nativeAuthDateString(pair.accessExpiresAt),
            "refreshExpiresAt": nativeAuthDateString(pair.refreshExpiresAt),
        ])
    }

    private static func decodeStoredEnvelope(
        _ data: Data,
        expectedClientID: String
    ) throws -> StoredEnvelope {
        guard data.count <= NativeAuthContract.maximumResponseBytes else {
            throw NativeAuthError.invalidResponse
        }
        let value = try JSONSerialization.jsonObject(
            with: data,
            options: [.fragmentsAllowed]
        )
        guard let object = value as? [String: Any] else {
            throw NativeAuthError.invalidResponse
        }
        let state = object["state"] as? String
        let markerStates = Set([
            NativeAuthSessionStatus.signedOut.rawValue,
            NativeAuthSessionStatus.requiresSignIn.rawValue,
            NativeAuthSessionStatus.refreshing.rawValue,
            NativeAuthSessionStatus.revoking.rawValue,
        ])
        if let state, markerStates.contains(state)
        {
            guard
                nativeAuthHasExactKeys(
                    data,
                    object: object,
                    expected: ["schemaVersion", "state"]
                ),
                object["schemaVersion"] as? String ==
                    NativeAuthContract.keychainEnvelopeVersion
            else {
                throw NativeAuthError.invalidResponse
            }
            if state == NativeAuthSessionStatus.signedOut.rawValue {
                return .signedOut
            }
            if state == NativeAuthSessionStatus.requiresSignIn.rawValue {
                return .requiresSignIn
            }
            return .interruptedSensitiveOperation
        }
        let expected = Set([
            "schemaVersion",
            "state",
            "clientId",
            "scope",
            "accessToken",
            "refreshToken",
            "accessExpiresAt",
            "refreshExpiresAt",
        ])
        guard
            nativeAuthHasExactKeys(
                data,
                object: object,
                expected: expected
            ),
            object["schemaVersion"] as? String ==
                NativeAuthContract.keychainEnvelopeVersion,
            state == NativeAuthSessionStatus.authorized.rawValue,
            object["clientId"] as? String == expectedClientID,
            object["scope"] as? String == NativeAuthContract.scope,
            let accessToken = object["accessToken"] as? String,
            let refreshToken = object["refreshToken"] as? String,
            nativeAuthOpaqueTokenPattern(accessToken),
            nativeAuthOpaqueTokenPattern(refreshToken),
            accessToken != refreshToken,
            let accessExpiresAtValue = object["accessExpiresAt"] as? String,
            let refreshExpiresAtValue = object["refreshExpiresAt"] as? String,
            let accessExpiresAt = nativeAuthParseDate(accessExpiresAtValue),
            let refreshExpiresAt = nativeAuthParseDate(refreshExpiresAtValue),
            accessExpiresAt < refreshExpiresAt
        else {
            throw NativeAuthError.invalidResponse
        }
        return .active(TokenPair(
            accessToken: accessToken,
            refreshToken: refreshToken,
            accessExpiresAt: accessExpiresAt,
            refreshExpiresAt: refreshExpiresAt
        ))
    }

    private static func makePair(
        response: NativeAuthTokenResponse,
        receivedAt: Date,
        previousRefreshExpiry: Date?
    ) throws -> TokenPair {
        let accessExpiresAt = receivedAt.addingTimeInterval(
            TimeInterval(response.expiresIn)
        )
        let refreshExpiresAt = receivedAt.addingTimeInterval(
            TimeInterval(response.refreshExpiresIn)
        )
        if let previousRefreshExpiry,
           refreshExpiresAt >
            previousRefreshExpiry.addingTimeInterval(1)
        {
            throw NativeAuthError.invalidResponse
        }
        guard accessExpiresAt < refreshExpiresAt else {
            throw NativeAuthError.invalidResponse
        }
        return TokenPair(
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            accessExpiresAt: accessExpiresAt,
            refreshExpiresAt: refreshExpiresAt
        )
    }
}

private struct NativeAuthTokenResponse {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int
    let refreshToken: String
    let refreshExpiresIn: Int
    let scope: String

    static func parseExact(_ data: Data) throws -> NativeAuthTokenResponse {
        guard data.count <= NativeAuthContract.maximumResponseBytes else {
            throw NativeAuthError.invalidResponse
        }
        let value = try JSONSerialization.jsonObject(
            with: data,
            options: [.fragmentsAllowed]
        )
        guard let object = value as? [String: Any] else {
            throw NativeAuthError.invalidResponse
        }
        let expected = Set([
            "accessToken",
            "tokenType",
            "expiresIn",
            "refreshToken",
            "refreshExpiresIn",
            "scope",
        ])
        guard
            nativeAuthHasExactKeys(
                data,
                object: object,
                expected: expected
            ),
            let accessToken = object["accessToken"] as? String,
            let refreshToken = object["refreshToken"] as? String,
            nativeAuthOpaqueTokenPattern(accessToken),
            nativeAuthOpaqueTokenPattern(refreshToken),
            accessToken != refreshToken,
            object["tokenType"] as? String == NativeAuthContract.tokenType,
            nativeAuthExactInteger(object["expiresIn"]) ==
                NativeAuthContract.accessTokenLifetimeSeconds,
            let refreshExpiresIn =
                nativeAuthExactInteger(object["refreshExpiresIn"]),
            refreshExpiresIn > 0,
            refreshExpiresIn <=
                NativeAuthContract.maximumRefreshTokenLifetimeSeconds,
            object["scope"] as? String == NativeAuthContract.scope
        else {
            throw NativeAuthError.invalidResponse
        }
        return NativeAuthTokenResponse(
            accessToken: accessToken,
            tokenType: NativeAuthContract.tokenType,
            expiresIn: NativeAuthContract.accessTokenLifetimeSeconds,
            refreshToken: refreshToken,
            refreshExpiresIn: refreshExpiresIn,
            scope: NativeAuthContract.scope
        )
    }
}

private enum NativeAuthRevocationResponse {
    static func isExact(_ data: Data) -> Bool {
        guard
            data.count <= NativeAuthContract.maximumResponseBytes,
            let value = try? JSONSerialization.jsonObject(
                with: data,
                options: [.fragmentsAllowed]
            ),
            let object = value as? [String: Any],
            nativeAuthHasExactKeys(
                data,
                object: object,
                expected: ["revoked"]
            ),
            object["revoked"] as? Bool == true
        else {
            return false
        }
        return true
    }
}

private func nativeAuthBackchannelHeaders() -> [String: String] {
    [
        "Content-Type": "application/json",
        NativeTripContract.apiVersionHeader:
            NativeTripContract.apiCompatibilityVersion,
    ]
}

private func nativeAuthJSONBody(
    _ object: [String: String]
) throws -> Data {
    guard JSONSerialization.isValidJSONObject(object) else {
        throw NativeAuthError.invalidConfiguration
    }
    return try JSONSerialization.data(
        withJSONObject: object,
        options: [.sortedKeys, .withoutEscapingSlashes]
    )
}

private func nativeAuthOpaqueTokenPattern(_ value: String) -> Bool {
    value.range(
        of: #"^[A-Za-z0-9_-]{43}$"#,
        options: .regularExpression
    ) != nil
}

private func nativeAuthPKCEVerifierPattern(_ value: String) -> Bool {
    value.range(
        of: #"^[A-Za-z0-9._~-]{43,128}$"#,
        options: .regularExpression
    ) != nil
}

private func nativeAuthStatePattern(_ value: String) -> Bool {
    value.range(
        of: #"^[A-Za-z0-9._~-]{32,160}$"#,
        options: .regularExpression
    ) != nil
}

private func nativeAuthBase64URL(_ data: Data) -> String {
    data.base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

private func nativeAuthConstantTimeEqual(
    _ lhs: String,
    _ rhs: String
) -> Bool {
    let left = Array(lhs.utf8)
    let right = Array(rhs.utf8)
    guard left.count == right.count else {
        return false
    }
    var difference: UInt8 = 0
    for index in left.indices {
        difference |= left[index] ^ right[index]
    }
    return difference == 0
}

private func nativeAuthExactInteger(_ value: Any?) -> Int? {
    guard let number = value as? NSNumber else {
        return nil
    }
    if CFGetTypeID(number) == CFBooleanGetTypeID() {
        return nil
    }
    let doubleValue = number.doubleValue
    guard
        doubleValue.isFinite,
        doubleValue.rounded() == doubleValue,
        doubleValue >= Double(Int.min),
        doubleValue <= Double(Int.max)
    else {
        return nil
    }
    return Int(doubleValue)
}

private func nativeAuthHasExactKeys(
    _ data: Data,
    object: [String: Any],
    expected: Set<String>
) -> Bool {
    guard
        Set(object.keys) == expected,
        let text = String(data: data, encoding: .utf8)
    else {
        return false
    }
    return expected.allSatisfy { key in
        let escaped = NSRegularExpression.escapedPattern(for: key)
        let expression = try! NSRegularExpression(
            pattern: "\"\(escaped)\"\\s*:"
        )
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.numberOfMatches(in: text, range: range) == 1
    }
}

private func nativeAuthDateString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
}

private func nativeAuthParseDate(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
}
