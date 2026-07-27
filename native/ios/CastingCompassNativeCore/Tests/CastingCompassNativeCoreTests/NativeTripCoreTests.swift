import Foundation
import XCTest

@testable import CastingCompassNativeCore

final class NativeTripCoreTests: XCTestCase {
    private let tripID = "trip_123e4567-e89b-42d3-a456-426614174000"
    private let requestBody = Data(#"{"request":"fixed"}"#.utf8)

    func testContractRoutesAndIdentityFormatsAreExact() throws {
        XCTAssertEqual(NativeTripContract.apiCompatibilityVersion, "1")
        XCTAssertEqual(NativeTripContract.apiVersionHeader, "X-CastingCompass-API-Version")
        XCTAssertEqual(NativeTripContract.requiredScope, "trips:write")
        XCTAssertEqual(try NativeTripOperation.start.path(tripID: tripID), "/api/trips/start")
        XCTAssertEqual(
            try NativeTripOperation.complete.path(tripID: tripID),
            "/api/trips/\(tripID)/complete"
        )
        XCTAssertEqual(
            try NativeTripOperation.cancel.path(tripID: tripID),
            "/api/trips/\(tripID)/cancel"
        )
        XCTAssertEqual(NativeTripOperation.complete.contentType, "multipart/form-data")
        XCTAssertEqual(NativeTripOperation.start.contentType, "application/json")

        let generatedTripID = NativeTripIdentity.makeTripID()
        XCTAssertNoThrow(try NativeTripIdentity.validateTripID(generatedTripID))
        XCTAssertThrowsError(try NativeTripIdentity.validateTripID("trip_not-a-uuid"))

        let token = try NativeTripIdentity.makeRandomToken()
        XCTAssertEqual(token.count, 43)
        XCTAssertNotNil(token.range(of: #"^[A-Za-z0-9_-]{43}$"#, options: .regularExpression))
        XCTAssertNotEqual(token, try NativeTripIdentity.makeRandomToken())
    }

    func testAmbiguousWriteStaysPendingUntilExactReceipt() throws {
        var record = try makeRecord(operation: .start)
        try record.beginSubmission(exactRequestBody: requestBody)
        XCTAssertEqual(record.state, .pendingSubmission)

        try record.apply(.ambiguousTransport)
        XCTAssertEqual(record.state, .pendingSubmission)

        try record.prepareExplicitRetry(exactRequestBody: requestBody)
        let receipt = try NativeTripReceipt.parseExact(Data(
            #"{"receipt":{"operation":"start","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#
                .utf8
        ))
        try record.apply(.exactReceipt(receipt))
        XCTAssertEqual(record.state, .confirmed)
        XCTAssertEqual(record.confirmationReceiptSHA256, receipt.responseSHA256)
    }

    func testChangedRetryAndMismatchedReceiptFailClosed() throws {
        var changed = try makeRecord(operation: .complete)
        try changed.beginSubmission(exactRequestBody: requestBody)
        XCTAssertThrowsError(
            try changed.prepareExplicitRetry(exactRequestBody: Data("changed".utf8))
        ) { error in
            XCTAssertEqual(error as? NativeTripRecoveryError, .requestChanged)
        }
        XCTAssertEqual(changed.state, .needsUserAttention)

        var mismatched = try makeRecord(operation: .complete)
        try mismatched.beginSubmission(exactRequestBody: requestBody)
        let wrongReceipt = try NativeTripReceipt.parseExact(Data(
            #"{"receipt":{"operation":"cancel","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#
                .utf8
        ))
        XCTAssertThrowsError(
            try mismatched.apply(.exactReceipt(wrongReceipt))
        ) { error in
            XCTAssertEqual(error as? NativeTripRecoveryError, .invalidReceipt)
        }
        XCTAssertEqual(mismatched.state, .needsUserAttention)
    }

    func testRejectionConflictAndUnreadableResponseNeverClaimSuccess() throws {
        for outcome in [
            NativeTripSubmissionOutcome.conflict,
            .rejected,
            .undecodableResponse,
        ] {
            var record = try makeRecord(operation: .cancel)
            try record.beginSubmission(exactRequestBody: requestBody)
            try record.apply(outcome)
            XCTAssertEqual(record.state, .needsUserAttention)
        }
    }

    func testReceiptParserRejectsAdditionalOrMalformedData() throws {
        let valid = Data(
            #"{"receipt":{"operation":"complete","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#
                .utf8
        )
        let receipt = try NativeTripReceipt.parseExact(valid)
        XCTAssertEqual(receipt.operation, .complete)
        XCTAssertEqual(receipt.tripID, tripID)
        XCTAssertNotNil(
            receipt.responseSHA256.range(
                of: #"^[a-f0-9]{64}$"#,
                options: .regularExpression
            )
        )
        for invalid in [
            #"{"receipt":{"operation":"complete","tripId":"trip_123e4567-e89b-42d3-a456-426614174000","extra":true}}"#,
            #"{"receipt":{"operation":"other","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#,
            #"{"receipt":{"operation":"complete","tripId":"bad"}}"#,
            #"{"receipt":{"operation":"complete","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"},"extra":true}"#,
            #"{"receipt":{"operation":"complete","operation":"complete","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#,
        ] {
            XCTAssertThrowsError(try NativeTripReceipt.parseExact(Data(invalid.utf8)))
        }
    }

    func testDurableRecordContainsReferencesAndHashesButNoCredentialBytes() throws {
        let marker = "never-persist-this-reporter-key"
        let record = try makeRecord(operation: .start)
        let encoded = try JSONEncoder().encode(record)
        let text = try XCTUnwrap(String(data: encoded, encoding: .utf8))
        XCTAssertFalse(text.contains(marker))
        XCTAssertTrue(text.contains("reporter-key"))
        XCTAssertTrue(text.contains("request-token"))
        XCTAssertTrue(text.contains("exactBodySHA256"))
        XCTAssertFalse(text.contains(#""state":"confirmed""#))
    }

    func testPersistedConfirmedStateRequiresReceiptEvidence() throws {
        var record = try makeRecord(operation: .start)
        try record.beginSubmission(exactRequestBody: requestBody)
        let receipt = try NativeTripReceipt.parseExact(Data(
            #"{"receipt":{"operation":"start","tripId":"trip_123e4567-e89b-42d3-a456-426614174000"}}"#
                .utf8
        ))
        try record.apply(.exactReceipt(receipt))
        let encoded = try JSONEncoder().encode(record)
        XCTAssertEqual(try JSONDecoder().decode(NativeTripDurableRecord.self, from: encoded), record)

        var object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoded) as? [String: Any]
        )
        object.removeValue(forKey: "confirmationReceiptSHA256")
        let tampered = try JSONSerialization.data(withJSONObject: object)
        XCTAssertThrowsError(
            try JSONDecoder().decode(NativeTripDurableRecord.self, from: tampered)
        )
    }

    func testCredentialSlotsAreStrictAndRequestOperationsRequireCorrectKinds() throws {
        XCTAssertThrowsError(
            try NativeTripCredentialSlot(kind: .reporterKey, account: "../../escape")
        )
        let reporter = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        XCTAssertEqual(reporter.account, "device-install-1")

        let wrongRequestSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "trip-1"
        )
        XCTAssertThrowsError(
            try NativeTripRequestDescriptor(
                operation: .start,
                tripID: tripID,
                exactRequestBody: requestBody,
                requestTokenSlot: wrongRequestSlot,
                reporterKeySlot: reporter
            )
        )
    }

    private func makeRecord(
        operation: NativeTripOperation
    ) throws -> NativeTripDurableRecord {
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let reporterSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        let descriptor = try NativeTripRequestDescriptor(
            operation: operation,
            tripID: tripID,
            exactRequestBody: requestBody,
            requestTokenSlot: requestSlot,
            reporterKeySlot: operation == .cancel ? nil : reporterSlot
        )
        return NativeTripDurableRecord(descriptor: descriptor)
    }
}
