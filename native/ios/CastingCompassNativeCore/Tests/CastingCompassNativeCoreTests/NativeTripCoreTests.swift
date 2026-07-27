import Foundation
import XCTest

@testable import CastingCompassNativeCore

final class NativeTripCoreTests: XCTestCase {
    private let tripID = "trip_123e4567-e89b-42d3-a456-426614174000"
    private let requestBody = Data(#"{"request":"fixed"}"#.utf8)
    private let requestToken = String(repeating: "A", count: 43)
    private let reporterKey = String(repeating: "B", count: 43)

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
        XCTAssertEqual(
            try NativeTripIdentity.validateRandomToken(requestToken),
            requestToken
        )
        XCTAssertThrowsError(
            try NativeTripIdentity.validateRandomToken("too-short")
        )
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
        try changed.beginSubmission(exactRequestBody: exactBody(for: .complete))
        XCTAssertThrowsError(
            try changed.prepareExplicitRetry(exactRequestBody: Data("changed".utf8))
        ) { error in
            XCTAssertEqual(error as? NativeTripRecoveryError, .requestChanged)
        }
        XCTAssertEqual(changed.state, .needsUserAttention)

        var mismatched = try makeRecord(operation: .complete)
        try mismatched.beginSubmission(exactRequestBody: exactBody(for: .complete))
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

    func testTypedPlansMaterializeStableExactRequestsWithoutAmbientHeaders() throws {
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let reporterSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        let builder = try NativeTripRequestBuilder(
            allowedSiteIDs: ["goleta-beach"]
        )
        let start = try NativeTripStartPlan(
            tripID: tripID,
            requestTokenSlot: requestSlot,
            reporterKeySlot: reporterSlot,
            siteID: "goleta-beach",
            startedAt: Date(timeIntervalSince1970: 1_786_291_200),
            anglerCount: 2,
            mode: .beach,
            scoreInfluencedChoice: false,
            primaryTargetConfirmed: true,
            consent: true,
            method: "drop shot",
            opportunityWindowID: "window:goleta-beach:1",
            referralCode: "Friend_One"
        )
        let first = try builder.buildStart(
            start,
            requestToken: requestToken,
            reporterKey: reporterKey
        )
        let second = try builder.buildStart(
            start,
            requestToken: requestToken,
            reporterKey: reporterKey
        )
        XCTAssertEqual(first, second)
        XCTAssertEqual(first.path, "/api/trips/start")
        XCTAssertEqual(first.contentType, "application/json")
        XCTAssertEqual(
            first.nonAuthorizationHeaders[
                NativeTripContract.apiVersionHeader
            ],
            "1"
        )
        XCTAssertNil(first.nonAuthorizationHeaders["Authorization"])
        XCTAssertNil(first.nonAuthorizationHeaders["Cookie"])
        XCTAssertNil(first.nonAuthorizationHeaders["Origin"])

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: first.body) as? [String: Any]
        )
        XCTAssertEqual(Set(object.keys), Set([
            "anglerCount",
            "clientTripId",
            "consent",
            "method",
            "mode",
            "opportunityWindowId",
            "primaryTargetConfirmed",
            "referralCode",
            "reporterKey",
            "requestToken",
            "scoreInfluencedChoice",
            "siteId",
            "startedAt",
        ]))
        XCTAssertEqual(object["referralCode"] as? String, "friend_one")
        XCTAssertEqual(object["scoreInfluencedChoice"] as? Bool, false)
    }

    func testCompletionMultipartIsStableBoundedAndWholeAttemptOnly() throws {
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let reporterSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        let plan = try NativeTripCompletionPlan(
            tripID: tripID,
            requestTokenSlot: requestSlot,
            reporterKeySlot: reporterSlot,
            anglerCount: 2,
            mode: .pier,
            scoreInfluencedChoice: true,
            keeperCount: 0,
            shortReleasedCount: 0,
            otherCatchCount: 1,
            otherSpecies: "Pacific mackerel",
            method: "drop shot",
            primaryTargetConfirmed: true,
            completeAttempt: true,
            consent: true
        )
        let builder = try NativeTripRequestBuilder(
            allowedSiteIDs: ["goleta-beach"]
        )
        let first = try builder.buildCompletion(
            plan,
            requestToken: requestToken,
            reporterKey: reporterKey
        )
        let second = try builder.buildCompletion(
            plan,
            requestToken: requestToken,
            reporterKey: reporterKey
        )
        XCTAssertEqual(first, second)
        XCTAssertTrue(
            first.contentType.hasPrefix("multipart/form-data; boundary=")
        )
        let body = try XCTUnwrap(String(data: first.body, encoding: .utf8))
        for field in [
            "token",
            "reporterKey",
            "anglerCount",
            "mode",
            "scoreInfluencedChoice",
            "keeperCount",
            "shortReleasedCount",
            "otherCatchCount",
            "otherSpecies",
            "consent",
            "primaryTargetConfirmed",
            "completeAttempt",
            "method",
        ] {
            XCTAssertEqual(
                body.components(
                    separatedBy: "name=\"\(field)\""
                ).count - 1,
                1
            )
        }
        XCTAssertFalse(body.contains("endedAt"))
        XCTAssertFalse(body.contains("photo"))
        XCTAssertFalse(body.contains("notes"))
    }

    func testPersistedPlanRebuildsIdenticalBytesFromCredentialSlots() throws {
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let reporterSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        let plan = try NativeTripStartPlan(
            tripID: tripID,
            requestTokenSlot: requestSlot,
            reporterKeySlot: reporterSlot,
            siteID: "goleta-beach",
            startedAt: Date(timeIntervalSince1970: 1_786_291_200),
            anglerCount: 1,
            mode: .beach,
            scoreInfluencedChoice: false,
            primaryTargetConfirmed: true,
            consent: true
        )
        let vault = MemoryCredentialVault(values: [
            requestSlot: Data(requestToken.utf8),
            reporterSlot: Data(reporterKey.utf8),
        ])
        let builder = try NativeTripRequestBuilder(
            allowedSiteIDs: ["goleta-beach"]
        )
        let built = try builder.materialize(.start(plan), vault: vault)
        var persisted = try NativeTripPersistedSubmission(
            plan: .start(plan),
            builtRequest: built
        )
        try persisted.beginSubmission(using: built)
        try persisted.apply(.ambiguousTransport)

        let encoded = try JSONEncoder().encode(persisted)
        let text = try XCTUnwrap(String(data: encoded, encoding: .utf8))
        XCTAssertFalse(text.contains(requestToken))
        XCTAssertFalse(text.contains(reporterKey))
        XCTAssertTrue(text.contains("request-token"))
        XCTAssertTrue(text.contains("reporter-key"))
        XCTAssertEqual(
            try JSONDecoder().decode(
                NativeTripPersistedSubmission.self,
                from: encoded
            ),
            persisted
        )
        let rebuilt = try builder.materialize(.start(plan), vault: vault)
        XCTAssertEqual(rebuilt, built)
        XCTAssertNoThrow(
            try persisted.prepareExplicitRetry(using: rebuilt)
        )
    }

    func testChangedCredentialMaterialCannotReplayPendingPlan() throws {
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let reporterSlot = try NativeTripCredentialSlot(
            kind: .reporterKey,
            account: "device-install-1"
        )
        let plan = try NativeTripCancellationPlan(
            tripID: tripID,
            requestTokenSlot: requestSlot,
            reason: .weather
        )
        let builder = try NativeTripRequestBuilder(
            allowedSiteIDs: ["goleta-beach"]
        )
        let first = try builder.buildCancellation(
            plan,
            requestToken: requestToken
        )
        var persisted = try NativeTripPersistedSubmission(
            plan: .cancel(plan),
            builtRequest: first
        )
        try persisted.beginSubmission(using: first)
        let changed = try builder.buildCancellation(
            plan,
            requestToken: String(repeating: "C", count: 43)
        )
        XCTAssertThrowsError(
            try persisted.prepareExplicitRetry(using: changed)
        ) { error in
            XCTAssertEqual(error as? NativeTripRecoveryError, .requestChanged)
        }
        XCTAssertEqual(persisted.record.state, .needsUserAttention)
    }

    func testProtectedStoreRoundTripsAndRejectsUnknownPersistedFields() async throws {
        let temporaryRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "NativeTripCoreTests-\(UUID().uuidString)",
                isDirectory: true
            )
        defer {
            try? FileManager.default.removeItem(at: temporaryRoot)
        }
        let requestSlot = try NativeTripCredentialSlot(
            kind: .requestToken,
            account: tripID
        )
        let cancellation = try NativeTripCancellationPlan(
            tripID: tripID,
            requestTokenSlot: requestSlot,
            reason: .waterSafety
        )
        let builder = try NativeTripRequestBuilder(
            allowedSiteIDs: ["goleta-beach"]
        )
        let built = try builder.buildCancellation(
            cancellation,
            requestToken: requestToken
        )
        let persisted = try NativeTripPersistedSubmission(
            plan: .cancel(cancellation),
            builtRequest: built
        )
        let store = try NativeTripDurableStore(rootDirectory: temporaryRoot)
        try await store.save(persisted)
        let restored = try await store.load(
            operation: .cancel,
            tripID: tripID
        )
        XCTAssertEqual(restored, persisted)

        let recordURL = temporaryRoot.appendingPathComponent(
            "cancel-\(tripID).json"
        )
        let attributes = try FileManager.default.attributesOfItem(
            atPath: recordURL.path
        )
        XCTAssertEqual(
            attributes[.posixPermissions] as? NSNumber,
            NSNumber(value: 0o600)
        )
        var object = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: Data(contentsOf: recordURL)
            ) as? [String: Any]
        )
        object["rawAccessToken"] = "must-be-rejected"
        try JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys]
        ).write(to: recordURL, options: .atomic)
        do {
            _ = try await store.load(operation: .cancel, tripID: tripID)
            XCTFail("Unknown persisted fields must fail closed")
        } catch {
            XCTAssertEqual(
                error as? NativeTripDurableStoreError,
                .corruptRecord
            )
        }
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
            exactRequestBody: exactBody(for: operation),
            requestTokenSlot: requestSlot,
            reporterKeySlot: operation == .cancel ? nil : reporterSlot,
            contentType: operation == .complete
                ? "multipart/form-data; boundary=castingcompass-test"
                : operation.contentType
        )
        return NativeTripDurableRecord(descriptor: descriptor)
    }

    private func exactBody(for operation: NativeTripOperation) -> Data {
        guard operation == .complete else {
            return requestBody
        }
        return Data((
            "--castingcompass-test\r\n\(String(decoding: requestBody, as: UTF8.self))" +
                "\r\n--castingcompass-test--\r\n"
        ).utf8)
    }
}

private final class MemoryCredentialVault:
    NativeTripCredentialVault,
    @unchecked Sendable
{
    private var values: [NativeTripCredentialSlot: Data]
    private let lock = NSLock()

    init(values: [NativeTripCredentialSlot: Data]) {
        self.values = values
    }

    func store(_ value: Data, in slot: NativeTripCredentialSlot) throws {
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
}
