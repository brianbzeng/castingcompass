import CryptoKit
import Foundation

public enum NativeTripMode: String, Codable, CaseIterable, Sendable {
    case shore
    case beach
    case pier
    case jetty
}

public enum NativeTripCancellationReason: String, Codable, CaseIterable, Sendable {
    case weather
    case waterSafety = "water_safety"
    case access
    case health
    case personal
    case other
}

public enum NativeTripRequestBuilderError: Error, Equatable {
    case emptyAllowedSiteCatalog
    case invalidAllowedSiteID
    case invalidField(String)
    case invalidCredentialEncoding(NativeTripCredentialKind)
    case requestDoesNotMatchPlan
}

private enum NativeTripPlanValidation {
    static let siteIDPattern = try! NSRegularExpression(
        pattern: #"^[a-z0-9][a-z0-9-]{0,99}$"#
    )
    static let opaqueIDPattern = try! NSRegularExpression(
        pattern: #"^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$"#
    )
    static let referralPattern = try! NSRegularExpression(
        pattern: #"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$"#
    )

    static func regexMatches(_ expression: NSRegularExpression, _ value: String) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return expression.firstMatch(in: value, range: range) != nil
    }

    static func validateTripAndSlots(
        tripID: String,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot?
    ) throws {
        _ = try NativeTripIdentity.validateTripID(tripID)
        guard
            requestTokenSlot.kind == .requestToken,
            requestTokenSlot.account == tripID
        else {
            throw NativeTripRequestBuilderError.invalidField("requestTokenSlot")
        }
        if let reporterKeySlot, reporterKeySlot.kind != .reporterKey {
            throw NativeTripRequestBuilderError.invalidField("reporterKeySlot")
        }
    }

    static func validateCount(
        _ value: Int,
        field: String,
        range: ClosedRange<Int>
    ) throws {
        guard range.contains(value) else {
            throw NativeTripRequestBuilderError.invalidField(field)
        }
    }

    static func optionalText(
        _ value: String?,
        field: String,
        maximum: Int
    ) throws -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard
            !trimmed.isEmpty,
            trimmed.count <= maximum,
            !trimmed.unicodeScalars.contains(where: CharacterSet.controlCharacters.contains)
        else {
            throw NativeTripRequestBuilderError.invalidField(field)
        }
        return trimmed
    }

    static func canonicalTimestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter.string(from: date)
    }

    static func validateCanonicalTimestamp(_ value: String) throws {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        guard
            let date = formatter.date(from: value),
            formatter.string(from: date) == value
        else {
            throw NativeTripRequestBuilderError.invalidField("startedAt")
        }
    }
}

public struct NativeTripStartPlan: Codable, Equatable, Sendable {
    public let tripID: String
    public let requestTokenSlot: NativeTripCredentialSlot
    public let reporterKeySlot: NativeTripCredentialSlot
    public let siteID: String
    public let startedAt: String
    public let anglerCount: Int
    public let mode: NativeTripMode
    public let scoreInfluencedChoice: Bool
    public let method: String?
    public let opportunityWindowID: String?
    public let referralCode: String?

    public init(
        tripID: String,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot,
        siteID: String,
        startedAt: Date,
        anglerCount: Int,
        mode: NativeTripMode,
        scoreInfluencedChoice: Bool,
        primaryTargetConfirmed: Bool,
        consent: Bool,
        method: String? = nil,
        opportunityWindowID: String? = nil,
        referralCode: String? = nil
    ) throws {
        try self.init(
            tripID: tripID,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: reporterKeySlot,
            siteID: siteID,
            startedAt: NativeTripPlanValidation.canonicalTimestamp(startedAt),
            anglerCount: anglerCount,
            mode: mode,
            scoreInfluencedChoice: scoreInfluencedChoice,
            primaryTargetConfirmed: primaryTargetConfirmed,
            consent: consent,
            method: method,
            opportunityWindowID: opportunityWindowID,
            referralCode: referralCode
        )
    }

    private init(
        tripID: String,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot,
        siteID: String,
        startedAt: String,
        anglerCount: Int,
        mode: NativeTripMode,
        scoreInfluencedChoice: Bool,
        primaryTargetConfirmed: Bool,
        consent: Bool,
        method: String?,
        opportunityWindowID: String?,
        referralCode: String?
    ) throws {
        try NativeTripPlanValidation.validateTripAndSlots(
            tripID: tripID,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: reporterKeySlot
        )
        guard
            NativeTripPlanValidation.regexMatches(
                NativeTripPlanValidation.siteIDPattern,
                siteID
            ),
            primaryTargetConfirmed,
            consent
        else {
            throw NativeTripRequestBuilderError.invalidField("start")
        }
        try NativeTripPlanValidation.validateCanonicalTimestamp(startedAt)
        try NativeTripPlanValidation.validateCount(
            anglerCount,
            field: "anglerCount",
            range: 1...12
        )
        if let opportunityWindowID, !NativeTripPlanValidation.regexMatches(
            NativeTripPlanValidation.opaqueIDPattern,
            opportunityWindowID
        ) {
            throw NativeTripRequestBuilderError.invalidField("opportunityWindowId")
        }
        if let referralCode, !NativeTripPlanValidation.regexMatches(
            NativeTripPlanValidation.referralPattern,
            referralCode
        ) {
            throw NativeTripRequestBuilderError.invalidField("referralCode")
        }
        self.tripID = tripID
        self.requestTokenSlot = requestTokenSlot
        self.reporterKeySlot = reporterKeySlot
        self.siteID = siteID
        self.startedAt = startedAt
        self.anglerCount = anglerCount
        self.mode = mode
        self.scoreInfluencedChoice = scoreInfluencedChoice
        self.method = try NativeTripPlanValidation.optionalText(
            method,
            field: "method",
            maximum: 80
        )
        self.opportunityWindowID = opportunityWindowID
        self.referralCode = referralCode?.lowercased()
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case tripID
        case requestTokenSlot
        case reporterKeySlot
        case siteID
        case startedAt
        case anglerCount
        case mode
        case scoreInfluencedChoice
        case method
        case opportunityWindowID
        case referralCode
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: Set(CodingKeys.allCases.map(\.rawValue))
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            tripID: container.decode(String.self, forKey: .tripID),
            requestTokenSlot: container.decode(
                NativeTripCredentialSlot.self,
                forKey: .requestTokenSlot
            ),
            reporterKeySlot: container.decode(
                NativeTripCredentialSlot.self,
                forKey: .reporterKeySlot
            ),
            siteID: container.decode(String.self, forKey: .siteID),
            startedAt: container.decode(String.self, forKey: .startedAt),
            anglerCount: container.decode(Int.self, forKey: .anglerCount),
            mode: container.decode(NativeTripMode.self, forKey: .mode),
            scoreInfluencedChoice: container.decode(
                Bool.self,
                forKey: .scoreInfluencedChoice
            ),
            primaryTargetConfirmed: true,
            consent: true,
            method: container.decodeIfPresent(String.self, forKey: .method),
            opportunityWindowID: container.decodeIfPresent(
                String.self,
                forKey: .opportunityWindowID
            ),
            referralCode: container.decodeIfPresent(
                String.self,
                forKey: .referralCode
            )
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(tripID, forKey: .tripID)
        try container.encode(requestTokenSlot, forKey: .requestTokenSlot)
        try container.encode(reporterKeySlot, forKey: .reporterKeySlot)
        try container.encode(siteID, forKey: .siteID)
        try container.encode(startedAt, forKey: .startedAt)
        try container.encode(anglerCount, forKey: .anglerCount)
        try container.encode(mode, forKey: .mode)
        try container.encode(scoreInfluencedChoice, forKey: .scoreInfluencedChoice)
        try container.encodeIfPresent(method, forKey: .method)
        if method == nil { try container.encodeNil(forKey: .method) }
        try container.encodeIfPresent(opportunityWindowID, forKey: .opportunityWindowID)
        if opportunityWindowID == nil {
            try container.encodeNil(forKey: .opportunityWindowID)
        }
        try container.encodeIfPresent(referralCode, forKey: .referralCode)
        if referralCode == nil { try container.encodeNil(forKey: .referralCode) }
    }
}

public struct NativeTripCompletionPlan: Codable, Equatable, Sendable {
    public let tripID: String
    public let requestTokenSlot: NativeTripCredentialSlot
    public let reporterKeySlot: NativeTripCredentialSlot
    public let anglerCount: Int
    public let mode: NativeTripMode
    public let scoreInfluencedChoice: Bool
    public let keeperCount: Int
    public let shortReleasedCount: Int
    public let otherCatchCount: Int
    public let otherSpecies: String?
    public let method: String?

    public init(
        tripID: String,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot,
        anglerCount: Int,
        mode: NativeTripMode,
        scoreInfluencedChoice: Bool,
        keeperCount: Int,
        shortReleasedCount: Int,
        otherCatchCount: Int,
        otherSpecies: String? = nil,
        method: String? = nil,
        primaryTargetConfirmed: Bool,
        completeAttempt: Bool,
        consent: Bool
    ) throws {
        try NativeTripPlanValidation.validateTripAndSlots(
            tripID: tripID,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: reporterKeySlot
        )
        guard primaryTargetConfirmed, completeAttempt, consent else {
            throw NativeTripRequestBuilderError.invalidField("completion")
        }
        try NativeTripPlanValidation.validateCount(
            anglerCount,
            field: "anglerCount",
            range: 1...12
        )
        try NativeTripPlanValidation.validateCount(
            keeperCount,
            field: "keeperCount",
            range: 0...25
        )
        try NativeTripPlanValidation.validateCount(
            shortReleasedCount,
            field: "shortReleasedCount",
            range: 0...25
        )
        try NativeTripPlanValidation.validateCount(
            otherCatchCount,
            field: "otherCatchCount",
            range: 0...100
        )
        guard keeperCount + shortReleasedCount <= 40 else {
            throw NativeTripRequestBuilderError.invalidField("halibutCounts")
        }
        let normalizedOtherSpecies = try NativeTripPlanValidation.optionalText(
            otherSpecies,
            field: "otherSpecies",
            maximum: 200
        )
        guard otherCatchCount != 0 || normalizedOtherSpecies == nil else {
            throw NativeTripRequestBuilderError.invalidField("otherSpecies")
        }
        self.tripID = tripID
        self.requestTokenSlot = requestTokenSlot
        self.reporterKeySlot = reporterKeySlot
        self.anglerCount = anglerCount
        self.mode = mode
        self.scoreInfluencedChoice = scoreInfluencedChoice
        self.keeperCount = keeperCount
        self.shortReleasedCount = shortReleasedCount
        self.otherCatchCount = otherCatchCount
        self.otherSpecies = normalizedOtherSpecies
        self.method = try NativeTripPlanValidation.optionalText(
            method,
            field: "method",
            maximum: 80
        )
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case tripID
        case requestTokenSlot
        case reporterKeySlot
        case anglerCount
        case mode
        case scoreInfluencedChoice
        case keeperCount
        case shortReleasedCount
        case otherCatchCount
        case otherSpecies
        case method
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: Set(CodingKeys.allCases.map(\.rawValue))
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            tripID: container.decode(String.self, forKey: .tripID),
            requestTokenSlot: container.decode(
                NativeTripCredentialSlot.self,
                forKey: .requestTokenSlot
            ),
            reporterKeySlot: container.decode(
                NativeTripCredentialSlot.self,
                forKey: .reporterKeySlot
            ),
            anglerCount: container.decode(Int.self, forKey: .anglerCount),
            mode: container.decode(NativeTripMode.self, forKey: .mode),
            scoreInfluencedChoice: container.decode(
                Bool.self,
                forKey: .scoreInfluencedChoice
            ),
            keeperCount: container.decode(Int.self, forKey: .keeperCount),
            shortReleasedCount: container.decode(
                Int.self,
                forKey: .shortReleasedCount
            ),
            otherCatchCount: container.decode(Int.self, forKey: .otherCatchCount),
            otherSpecies: container.decodeIfPresent(
                String.self,
                forKey: .otherSpecies
            ),
            method: container.decodeIfPresent(String.self, forKey: .method),
            primaryTargetConfirmed: true,
            completeAttempt: true,
            consent: true
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(tripID, forKey: .tripID)
        try container.encode(requestTokenSlot, forKey: .requestTokenSlot)
        try container.encode(reporterKeySlot, forKey: .reporterKeySlot)
        try container.encode(anglerCount, forKey: .anglerCount)
        try container.encode(mode, forKey: .mode)
        try container.encode(scoreInfluencedChoice, forKey: .scoreInfluencedChoice)
        try container.encode(keeperCount, forKey: .keeperCount)
        try container.encode(shortReleasedCount, forKey: .shortReleasedCount)
        try container.encode(otherCatchCount, forKey: .otherCatchCount)
        try container.encodeIfPresent(otherSpecies, forKey: .otherSpecies)
        if otherSpecies == nil { try container.encodeNil(forKey: .otherSpecies) }
        try container.encodeIfPresent(method, forKey: .method)
        if method == nil { try container.encodeNil(forKey: .method) }
    }
}

public struct NativeTripCancellationPlan: Codable, Equatable, Sendable {
    public let tripID: String
    public let requestTokenSlot: NativeTripCredentialSlot
    public let reason: NativeTripCancellationReason

    public init(
        tripID: String,
        requestTokenSlot: NativeTripCredentialSlot,
        reason: NativeTripCancellationReason
    ) throws {
        try NativeTripPlanValidation.validateTripAndSlots(
            tripID: tripID,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: nil
        )
        self.tripID = tripID
        self.requestTokenSlot = requestTokenSlot
        self.reason = reason
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case tripID
        case requestTokenSlot
        case reason
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: Set(CodingKeys.allCases.map(\.rawValue))
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            tripID: container.decode(String.self, forKey: .tripID),
            requestTokenSlot: container.decode(
                NativeTripCredentialSlot.self,
                forKey: .requestTokenSlot
            ),
            reason: container.decode(
                NativeTripCancellationReason.self,
                forKey: .reason
            )
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(tripID, forKey: .tripID)
        try container.encode(requestTokenSlot, forKey: .requestTokenSlot)
        try container.encode(reason, forKey: .reason)
    }
}

public enum NativeTripRequestPlan: Codable, Equatable, Sendable {
    case start(NativeTripStartPlan)
    case complete(NativeTripCompletionPlan)
    case cancel(NativeTripCancellationPlan)

    public var operation: NativeTripOperation {
        switch self {
        case .start:
            .start
        case .complete:
            .complete
        case .cancel:
            .cancel
        }
    }

    public var tripID: String {
        switch self {
        case let .start(plan):
            plan.tripID
        case let .complete(plan):
            plan.tripID
        case let .cancel(plan):
            plan.tripID
        }
    }

    public var requestTokenSlot: NativeTripCredentialSlot {
        switch self {
        case let .start(plan):
            plan.requestTokenSlot
        case let .complete(plan):
            plan.requestTokenSlot
        case let .cancel(plan):
            plan.requestTokenSlot
        }
    }

    public var reporterKeySlot: NativeTripCredentialSlot? {
        switch self {
        case let .start(plan):
            plan.reporterKeySlot
        case let .complete(plan):
            plan.reporterKeySlot
        case .cancel:
            nil
        }
    }

    private enum CodingKeys: String, CodingKey {
        case operation
        case payload
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: ["operation", "payload"]
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let operation = try container.decode(
            NativeTripOperation.self,
            forKey: .operation
        )
        switch operation {
        case .start:
            self = .start(
                try container.decode(NativeTripStartPlan.self, forKey: .payload)
            )
        case .complete:
            self = .complete(
                try container.decode(
                    NativeTripCompletionPlan.self,
                    forKey: .payload
                )
            )
        case .cancel:
            self = .cancel(
                try container.decode(
                    NativeTripCancellationPlan.self,
                    forKey: .payload
                )
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(operation, forKey: .operation)
        switch self {
        case let .start(plan):
            try container.encode(plan, forKey: .payload)
        case let .complete(plan):
            try container.encode(plan, forKey: .payload)
        case let .cancel(plan):
            try container.encode(plan, forKey: .payload)
        }
    }
}

public struct NativeTripBuiltRequest: Equatable, Sendable {
    public let operation: NativeTripOperation
    public let tripID: String
    public let method: String
    public let path: String
    public let contentType: String
    public let body: Data

    public var nonAuthorizationHeaders: [String: String] {
        [
            "Accept": "application/json",
            "Content-Type": contentType,
            NativeTripContract.apiVersionHeader:
                NativeTripContract.apiCompatibilityVersion,
        ]
    }
}

public struct NativeTripRequestBuilder: Sendable {
    private let allowedSiteIDs: Set<String>

    public init(allowedSiteIDs: Set<String>) throws {
        guard !allowedSiteIDs.isEmpty else {
            throw NativeTripRequestBuilderError.emptyAllowedSiteCatalog
        }
        guard allowedSiteIDs.allSatisfy({
            NativeTripPlanValidation.regexMatches(
                NativeTripPlanValidation.siteIDPattern,
                $0
            )
        }) else {
            throw NativeTripRequestBuilderError.invalidAllowedSiteID
        }
        self.allowedSiteIDs = allowedSiteIDs
    }

    public func materialize(
        _ plan: NativeTripRequestPlan,
        vault: any NativeTripCredentialVault
    ) throws -> NativeTripBuiltRequest {
        let requestToken = try credentialString(
            vault.read(from: plan.requestTokenSlot),
            kind: .requestToken
        )
        switch plan {
        case let .start(start):
            let reporterKey = try credentialString(
                vault.read(from: start.reporterKeySlot),
                kind: .reporterKey
            )
            return try buildStart(
                start,
                requestToken: requestToken,
                reporterKey: reporterKey
            )
        case let .complete(completion):
            let reporterKey = try credentialString(
                vault.read(from: completion.reporterKeySlot),
                kind: .reporterKey
            )
            return try buildCompletion(
                completion,
                requestToken: requestToken,
                reporterKey: reporterKey
            )
        case let .cancel(cancellation):
            return try buildCancellation(
                cancellation,
                requestToken: requestToken
            )
        }
    }

    public func buildStart(
        _ plan: NativeTripStartPlan,
        requestToken: String,
        reporterKey: String
    ) throws -> NativeTripBuiltRequest {
        guard allowedSiteIDs.contains(plan.siteID) else {
            throw NativeTripRequestBuilderError.invalidField("siteId")
        }
        _ = try NativeTripIdentity.validateRandomToken(requestToken)
        _ = try NativeTripIdentity.validateRandomToken(reporterKey)
        var object: [String: Any] = [
            "anglerCount": plan.anglerCount,
            "clientTripId": plan.tripID,
            "consent": true,
            "mode": plan.mode.rawValue,
            "primaryTargetConfirmed": true,
            "reporterKey": reporterKey,
            "requestToken": requestToken,
            "scoreInfluencedChoice": plan.scoreInfluencedChoice,
            "siteId": plan.siteID,
            "startedAt": plan.startedAt,
        ]
        if let method = plan.method {
            object["method"] = method
        }
        if let opportunityWindowID = plan.opportunityWindowID {
            object["opportunityWindowId"] = opportunityWindowID
        }
        if let referralCode = plan.referralCode {
            object["referralCode"] = referralCode
        }
        return try builtJSONRequest(
            operation: .start,
            tripID: plan.tripID,
            object: object
        )
    }

    public func buildCompletion(
        _ plan: NativeTripCompletionPlan,
        requestToken: String,
        reporterKey: String
    ) throws -> NativeTripBuiltRequest {
        _ = try NativeTripIdentity.validateRandomToken(requestToken)
        _ = try NativeTripIdentity.validateRandomToken(reporterKey)
        var fields: [(String, String)] = [
            ("token", requestToken),
            ("reporterKey", reporterKey),
            ("anglerCount", String(plan.anglerCount)),
            ("mode", plan.mode.rawValue),
            (
                "scoreInfluencedChoice",
                plan.scoreInfluencedChoice ? "true" : "false"
            ),
            ("keeperCount", String(plan.keeperCount)),
            ("shortReleasedCount", String(plan.shortReleasedCount)),
            ("otherCatchCount", String(plan.otherCatchCount)),
        ]
        if let otherSpecies = plan.otherSpecies {
            fields.append(("otherSpecies", otherSpecies))
        }
        fields.append(contentsOf: [
            ("consent", "true"),
            ("primaryTargetConfirmed", "true"),
            ("completeAttempt", "true"),
        ])
        if let method = plan.method {
            fields.append(("method", method))
        }
        let boundarySeed = [
            "castingcompass.native-trip-multipart/1.0.0",
            plan.tripID,
            requestToken,
        ].joined(separator: "\u{0000}")
        let boundaryHash = SHA256.hash(data: Data(boundarySeed.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        let boundary = "castingcompass-\(boundaryHash.prefix(40))"
        guard fields.allSatisfy({ !$0.1.contains("--\(boundary)") }) else {
            throw NativeTripRequestBuilderError.invalidField("multipartBoundary")
        }
        var body = Data()
        for (name, value) in fields {
            body.append(contentsOf: "--\(boundary)\r\n".utf8)
            body.append(
                contentsOf:
                    "Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n"
                    .utf8
            )
            body.append(contentsOf: value.utf8)
            body.append(contentsOf: "\r\n".utf8)
        }
        body.append(contentsOf: "--\(boundary)--\r\n".utf8)
        return NativeTripBuiltRequest(
            operation: .complete,
            tripID: plan.tripID,
            method: NativeTripOperation.complete.method,
            path: try NativeTripOperation.complete.path(tripID: plan.tripID),
            contentType: "multipart/form-data; boundary=\(boundary)",
            body: body
        )
    }

    public func buildCancellation(
        _ plan: NativeTripCancellationPlan,
        requestToken: String
    ) throws -> NativeTripBuiltRequest {
        _ = try NativeTripIdentity.validateRandomToken(requestToken)
        return try builtJSONRequest(
            operation: .cancel,
            tripID: plan.tripID,
            object: [
                "reason": plan.reason.rawValue,
                "token": requestToken,
            ]
        )
    }

    private func builtJSONRequest(
        operation: NativeTripOperation,
        tripID: String,
        object: [String: Any]
    ) throws -> NativeTripBuiltRequest {
        guard JSONSerialization.isValidJSONObject(object) else {
            throw NativeTripRequestBuilderError.invalidField("json")
        }
        let body = try JSONSerialization.data(
            withJSONObject: object,
            options: [.sortedKeys, .withoutEscapingSlashes]
        )
        return NativeTripBuiltRequest(
            operation: operation,
            tripID: tripID,
            method: operation.method,
            path: try operation.path(tripID: tripID),
            contentType: operation.contentType,
            body: body
        )
    }

    private func credentialString(
        _ data: Data,
        kind: NativeTripCredentialKind
    ) throws -> String {
        guard let value = String(data: data, encoding: .utf8) else {
            throw NativeTripRequestBuilderError.invalidCredentialEncoding(kind)
        }
        _ = try NativeTripIdentity.validateRandomToken(value)
        return value
    }
}
