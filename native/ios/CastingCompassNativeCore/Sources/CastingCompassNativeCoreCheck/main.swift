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

print("CastingCompassNativeCore check passed")
