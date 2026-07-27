import CastingCompassNativeCore
import Foundation

enum CheckFailure: Error {
    case failed(String)
}

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else {
        throw CheckFailure.failed(message)
    }
}

let tripID = "trip_123e4567-e89b-42d3-a456-426614174000"
let requestBody = Data(#"{"request":"fixed"}"#.utf8)
let requestSlot = try NativeTripCredentialSlot(
    kind: .requestToken,
    account: tripID
)
let reporterSlot = try NativeTripCredentialSlot(
    kind: .reporterKey,
    account: "device-install-1"
)
let descriptor = try NativeTripRequestDescriptor(
    operation: .start,
    tripID: tripID,
    exactRequestBody: requestBody,
    requestTokenSlot: requestSlot,
    reporterKeySlot: reporterSlot
)
var record = NativeTripDurableRecord(descriptor: descriptor)

try require(record.state == .draft, "new records must start as drafts")
try record.beginSubmission(exactRequestBody: requestBody)
try require(record.state == .pendingSubmission, "submission must become pending first")
try record.apply(.ambiguousTransport)
try require(
    record.state == .pendingSubmission,
    "ambiguous transport must never claim success"
)
try record.prepareExplicitRetry(exactRequestBody: requestBody)

let receiptData = Data(
    #"{"receipt":{"operation":"start","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#
        .utf8
)
try record.apply(.exactReceipt(NativeTripReceipt.parseExact(receiptData)))
try require(record.state == .confirmed, "only an exact matching receipt may confirm")

let duplicateKeyReceipt = Data(
    #"{"receipt":{"operation":"start","operation":"start","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#
        .utf8
)
do {
    _ = try NativeTripReceipt.parseExact(duplicateKeyReceipt)
    throw CheckFailure.failed("duplicate receipt keys must fail closed")
} catch NativeTripRecoveryError.invalidReceipt {
    // Expected.
}

let token = try NativeTripIdentity.makeRandomToken()
try require(token.count == 43, "random tokens must be 43-character base64url")
try require(!token.contains("="), "random tokens must omit base64 padding")

let encoded = try JSONEncoder().encode(record)

let fixedRequestToken = String(repeating: "A", count: 43)
let fixedReporterKey = String(repeating: "B", count: 43)
let startPlan = try NativeTripStartPlan(
    tripID: tripID,
    requestTokenSlot: requestSlot,
    reporterKeySlot: reporterSlot,
    siteID: "goleta-beach",
    startedAt: Date(timeIntervalSince1970: 1_786_291_200),
    anglerCount: 1,
    mode: .beach,
    scoreInfluencedChoice: false,
    primaryTargetConfirmed: true,
    consent: true,
    method: "drop shot"
)
let builder = try NativeTripRequestBuilder(
    allowedSiteIDs: ["goleta-beach"]
)
let firstBuiltRequest = try builder.buildStart(
    startPlan,
    requestToken: fixedRequestToken,
    reporterKey: fixedReporterKey
)
let secondBuiltRequest = try builder.buildStart(
    startPlan,
    requestToken: fixedRequestToken,
    reporterKey: fixedReporterKey
)
try require(
    firstBuiltRequest == secondBuiltRequest,
    "the same plan and Keychain material must reproduce identical bytes"
)
var persistedSubmission = try NativeTripPersistedSubmission(
    plan: .start(startPlan),
    builtRequest: firstBuiltRequest
)
try persistedSubmission.beginSubmission(using: firstBuiltRequest)
try persistedSubmission.apply(.ambiguousTransport)

let temporaryRoot = FileManager.default.temporaryDirectory.appendingPathComponent(
    "CastingCompassNativeCoreCheck-\(UUID().uuidString)",
    isDirectory: true
)
defer {
    try? FileManager.default.removeItem(at: temporaryRoot)
}
let store = try NativeTripDurableStore(rootDirectory: temporaryRoot)
try await store.save(persistedSubmission)
var restoredSubmission = try await store.load(
    operation: .start,
    tripID: tripID
)
try require(
    restoredSubmission == persistedSubmission,
    "protected durable storage must round-trip the exact pending state"
)
try restoredSubmission?.prepareExplicitRetry(using: secondBuiltRequest)
let persistedURL = temporaryRoot.appendingPathComponent(
    "start-\(tripID).json"
)
let persistedText = try String(contentsOf: persistedURL, encoding: .utf8)
try require(
    !persistedText.contains(fixedRequestToken) &&
        !persistedText.contains(fixedReporterKey),
    "durable files must contain no raw request or reporter credential"
)

final class CheckMemoryVault: NativeTripCredentialVault, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [NativeTripCredentialSlot: Data] = [:]

    func store(_ value: Data, in slot: NativeTripCredentialSlot) throws {
        guard !value.isEmpty else {
            throw NativeTripCredentialVaultError.emptyCredential
        }
        lock.lock()
        defer { lock.unlock() }
        values[slot] = value
    }

    func read(from slot: NativeTripCredentialSlot) throws -> Data {
        lock.lock()
        defer { lock.unlock() }
        guard let value = values[slot] else {
            throw NativeTripCredentialVaultError.notFound
        }
        return value
    }

    func delete(_ slot: NativeTripCredentialSlot) throws {
        lock.lock()
        defer { lock.unlock() }
        values.removeValue(forKey: slot)
    }

    func value(for slot: NativeTripCredentialSlot) -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return values[slot]
    }
}

actor CheckScriptedTransport: NativeHTTPTransport {
    private var responses: [NativeHTTPResponse]
    private var requests: [URLRequest] = []

    init(responses: [NativeHTTPResponse]) {
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

let authConfiguration = try NativeAuthConfiguration(
    baseURL: URL(string: "https://staging.castingcompass.example")!
)
let authAttempt = try NativeAuthorizationAttempt(
    configuration: authConfiguration
)
let authURL = await authAttempt.authorizationURL
let authComponents = URLComponents(
    url: authURL,
    resolvingAgainstBaseURL: false
)
let authItems = authComponents?.queryItems ?? []
try require(
    authComponents?.path == "/native/authorize" &&
        authItems.count == 6,
    "native authorization must use the exact system-browser envelope"
)
let state = authItems.first(where: { $0.name == "state" })?.value ?? ""
let code = String(repeating: "E", count: 43)
let callback = URL(
    string:
        "castingcompass://oauth/callback?code=\(code)&state=\(state)"
)!
let exchangeRequest = try await authAttempt.consumeCallback(callback)
try require(
    exchangeRequest.url.path == "/api/native/oauth/token" &&
        exchangeRequest.headers["Cookie"] == nil &&
        exchangeRequest.headers["Origin"] == nil &&
        exchangeRequest.headers["Authorization"] == nil,
    "native token exchange must not carry ambient browser authority"
)
do {
    _ = try await authAttempt.consumeCallback(callback)
    throw CheckFailure.failed("native callbacks must be single-use")
} catch NativeAuthError.callbackAlreadyConsumed {
    // Expected.
}

let ephemeral = NativeAuthBackchannel.makeEphemeralSessionConfiguration()
try require(
    ephemeral.httpCookieStorage == nil &&
        !ephemeral.httpShouldSetCookies &&
        ephemeral.urlCredentialStorage == nil &&
        ephemeral.urlCache == nil,
    "native backchannel sessions must be isolated from shared credentials"
)

let authVault = CheckMemoryVault()
let authSession = try NativeAuthSession(
    configuration: authConfiguration,
    vault: authVault
)
let authAccess = String(repeating: "A", count: 43)
let authRefresh = String(repeating: "B", count: 43)
let authResponse = Data(
    #"{"accessToken":"\#(authAccess)","expiresIn":600,"refreshExpiresIn":2592000,"refreshToken":"\#(authRefresh)","scope":"profile:read trips:write","tokenType":"Bearer"}"#
        .utf8
)
let authNow = Date(timeIntervalSince1970: 1_786_291_200)
let authorized = try await authSession.acceptAuthorizationCodeExchange(
    responseData: authResponse,
    receivedAt: authNow
)
let restoredAccess = try await authSession.accessTokenForImmediateRequest(
    now: authNow
)
try require(
    authorized.status == .authorized &&
        restoredAccess == authAccess,
    "only an exact token response may create native authority"
)
_ = try await authSession.makeRefreshRequest(now: authNow)
let invalidated = try await authSession
    .invalidateAfterRefreshWasDispatched()
try require(
    invalidated.status == .requiresSignIn,
    "a lost refresh response must destroy the local token family"
)
let authSlot = try NativeTripCredentialSlot(
    kind: .oauthSession,
    account: "primary"
)
let authMarker = String(
    decoding: authVault.value(for: authSlot) ?? Data(),
    as: UTF8.self
)
try require(
    !authMarker.contains(authAccess) &&
        !authMarker.contains(authRefresh) &&
        authMarker.contains("requires_sign_in"),
    "lost refresh handling must atomically overwrite raw Keychain tokens"
)

let productionEphemeral =
    NativeEphemeralHTTPTransport.makeSessionConfiguration()
try require(
    productionEphemeral.httpCookieStorage == nil &&
        productionEphemeral.httpCookieAcceptPolicy == .never &&
        !productionEphemeral.httpShouldSetCookies &&
        productionEphemeral.urlCredentialStorage == nil &&
        productionEphemeral.urlCache == nil &&
        !productionEphemeral.waitsForConnectivity,
    "native one-shot transport must have no ambient credential stores"
)

let dispatchVault = CheckMemoryVault()
try dispatchVault.store(
    Data(fixedRequestToken.utf8),
    in: requestSlot
)
try dispatchVault.store(
    Data(fixedReporterKey.utf8),
    in: reporterSlot
)
let dispatchAuthSession = try NativeAuthSession(
    configuration: authConfiguration,
    vault: dispatchVault
)
let dispatchTransport = CheckScriptedTransport(
    responses: [
        NativeHTTPResponse(statusCode: 200, body: authResponse),
        NativeHTTPResponse(statusCode: 201, body: receiptData),
    ]
)
let dispatchAuthCoordinator = NativeAuthCoordinator(
    session: dispatchAuthSession,
    transport: dispatchTransport
)
let dispatchAuthorized = try await dispatchAuthCoordinator
    .exchangeAuthorizationCode(
        exchangeRequest,
        receivedAt: authNow
    )
try require(
    dispatchAuthorized.status == .authorized,
    "the auth coordinator must accept exactly one bounded token response"
)
let dispatchRoot = FileManager.default.temporaryDirectory
    .appendingPathComponent(
        "CastingCompassNativeDispatchCheck-\(UUID().uuidString)",
        isDirectory: true
    )
defer {
    try? FileManager.default.removeItem(at: dispatchRoot)
}
let dispatchStore = try NativeTripDurableStore(
    rootDirectory: dispatchRoot
)
let tripCoordinator = try NativeTripDispatchCoordinator(
    baseURL: authConfiguration.baseURL,
    builder: builder,
    vault: dispatchVault,
    store: dispatchStore,
    authSession: dispatchAuthSession,
    transport: dispatchTransport
)
let dispatchResult = try await tripCoordinator.submitNew(
    .start(startPlan),
    now: authNow
)
try require(
    dispatchResult.state == .confirmed &&
        dispatchResult.responseStatusCode == 201,
    "only the exact native receipt may confirm a dispatched trip"
)
let dispatchedRequests = await dispatchTransport.capturedRequests()
try require(
    dispatchedRequests.count == 2 &&
        dispatchedRequests[0].url?.path == "/api/native/oauth/token" &&
        dispatchedRequests[1].url?.path == "/api/trips/start" &&
        dispatchedRequests[1].value(
            forHTTPHeaderField: "Authorization"
        ) == "Bearer \(authAccess)" &&
        dispatchedRequests[1].value(
            forHTTPHeaderField: "Cookie"
        ) == nil &&
        dispatchedRequests[1].value(
            forHTTPHeaderField: "Origin"
        ) == nil,
    "native coordinators must dispatch once without browser authority"
)

print("CastingCompassNativeCore check passed")
