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
let encodedText = String(decoding: encoded, as: UTF8.self)
try require(
    !encodedText.contains(token),
    "durable records must not contain credential bytes"
)

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
    private var values: [NativeTripCredentialSlot: Data] = [:]

    func store(_ value: Data, in slot: NativeTripCredentialSlot) throws {
        guard !value.isEmpty else {
            throw NativeTripCredentialVaultError.emptyCredential
        }
        values[slot] = value
    }

    func read(from slot: NativeTripCredentialSlot) throws -> Data {
        guard let value = values[slot] else {
            throw NativeTripCredentialVaultError.notFound
        }
        return value
    }

    func delete(_ slot: NativeTripCredentialSlot) throws {
        values.removeValue(forKey: slot)
    }

    func value(for slot: NativeTripCredentialSlot) -> Data? {
        values[slot]
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

print("CastingCompassNativeCore check passed")
