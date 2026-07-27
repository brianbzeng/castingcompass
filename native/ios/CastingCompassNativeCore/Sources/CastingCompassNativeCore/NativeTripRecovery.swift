import CryptoKit
import Foundation

public enum NativeTripRecoveryState: String, Codable, CaseIterable, Sendable {
    case draft
    case pendingSubmission = "pending_submission"
    case confirmed
    case needsUserAttention = "needs_user_attention"
}

public struct NativeTripRequestDescriptor: Codable, Equatable, Sendable {
    public let operation: NativeTripOperation
    public let tripID: String
    public let method: String
    public let path: String
    public let contentType: String
    public let exactBodySHA256: String
    public let requestTokenSlot: NativeTripCredentialSlot
    public let reporterKeySlot: NativeTripCredentialSlot?

    public init(
        operation: NativeTripOperation,
        tripID: String,
        exactRequestBody: Data,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot?,
        contentType: String? = nil
    ) throws {
        let validatedTripID = try NativeTripIdentity.validateTripID(tripID)
        let resolvedContentType = contentType ?? operation.contentType
        try Self.validateCredentialSlots(
            operation: operation,
            tripID: validatedTripID,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: reporterKeySlot
        )
        try Self.validateContentType(
            resolvedContentType,
            operation: operation,
            exactRequestBody: exactRequestBody
        )
        self.operation = operation
        self.tripID = validatedTripID
        self.method = operation.method
        self.path = try operation.path(tripID: validatedTripID)
        self.contentType = resolvedContentType
        self.exactBodySHA256 = SHA256.hash(data: exactRequestBody)
            .map { String(format: "%02x", $0) }
            .joined()
        self.requestTokenSlot = requestTokenSlot
        self.reporterKeySlot = reporterKeySlot
    }

    public init(
        builtRequest: NativeTripBuiltRequest,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot?
    ) throws {
        guard
            builtRequest.method == builtRequest.operation.method,
            builtRequest.path == (
                try builtRequest.operation.path(tripID: builtRequest.tripID)
            )
        else {
            throw NativeTripRecoveryError.requestChanged
        }
        try self.init(
            operation: builtRequest.operation,
            tripID: builtRequest.tripID,
            exactRequestBody: builtRequest.body,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: reporterKeySlot,
            contentType: builtRequest.contentType
        )
    }

    public func matchesExactBody(_ body: Data) -> Bool {
        SHA256.hash(data: body)
            .map { String(format: "%02x", $0) }
            .joined() == exactBodySHA256
    }

    public func matches(_ builtRequest: NativeTripBuiltRequest) -> Bool {
        builtRequest.operation == operation &&
            builtRequest.tripID == tripID &&
            builtRequest.method == method &&
            builtRequest.path == path &&
            builtRequest.contentType == contentType &&
            matchesExactBody(builtRequest.body)
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case operation
        case tripID
        case method
        case path
        case contentType
        case exactBodySHA256
        case requestTokenSlot
        case reporterKeySlot
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: Set(CodingKeys.allCases.map(\.rawValue))
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let operation = try container.decode(
            NativeTripOperation.self,
            forKey: .operation
        )
        let tripID = try NativeTripIdentity.validateTripID(
            container.decode(String.self, forKey: .tripID)
        )
        let requestTokenSlot = try container.decode(
            NativeTripCredentialSlot.self,
            forKey: .requestTokenSlot
        )
        let reporterKeySlot = try container.decodeIfPresent(
            NativeTripCredentialSlot.self,
            forKey: .reporterKeySlot
        )
        let contentType = try container.decode(String.self, forKey: .contentType)
        let exactBodySHA256 = try container.decode(
            String.self,
            forKey: .exactBodySHA256
        )
        let method = try container.decode(String.self, forKey: .method)
        let path = try container.decode(String.self, forKey: .path)
        try Self.validateCredentialSlots(
            operation: operation,
            tripID: tripID,
            requestTokenSlot: requestTokenSlot,
            reporterKeySlot: reporterKeySlot
        )
        try Self.validateContentType(
            contentType,
            operation: operation,
            exactRequestBody: nil
        )
        guard
            method == operation.method,
            path == (try operation.path(tripID: tripID)),
            exactBodySHA256.range(
                of: #"^[a-f0-9]{64}$"#,
                options: .regularExpression
            ) != nil
        else {
            throw NativeTripRecoveryError.requestChanged
        }
        self.operation = operation
        self.tripID = tripID
        self.method = operation.method
        self.path = try operation.path(tripID: tripID)
        self.contentType = contentType
        self.exactBodySHA256 = exactBodySHA256
        self.requestTokenSlot = requestTokenSlot
        self.reporterKeySlot = reporterKeySlot
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(operation, forKey: .operation)
        try container.encode(tripID, forKey: .tripID)
        try container.encode(method, forKey: .method)
        try container.encode(path, forKey: .path)
        try container.encode(contentType, forKey: .contentType)
        try container.encode(exactBodySHA256, forKey: .exactBodySHA256)
        try container.encode(requestTokenSlot, forKey: .requestTokenSlot)
        try container.encodeIfPresent(reporterKeySlot, forKey: .reporterKeySlot)
        if reporterKeySlot == nil {
            try container.encodeNil(forKey: .reporterKeySlot)
        }
    }

    private static func validateCredentialSlots(
        operation: NativeTripOperation,
        tripID: String,
        requestTokenSlot: NativeTripCredentialSlot,
        reporterKeySlot: NativeTripCredentialSlot?
    ) throws {
        guard
            requestTokenSlot.kind == .requestToken,
            requestTokenSlot.account == tripID
        else {
            throw NativeTripRecoveryError.invalidCredentialSlots
        }
        switch operation {
        case .start, .complete:
            guard reporterKeySlot?.kind == .reporterKey else {
                throw NativeTripRecoveryError.invalidCredentialSlots
            }
        case .cancel:
            guard reporterKeySlot == nil else {
                throw NativeTripRecoveryError.invalidCredentialSlots
            }
        }
    }

    private static func validateContentType(
        _ value: String,
        operation: NativeTripOperation,
        exactRequestBody: Data?
    ) throws {
        switch operation {
        case .start, .cancel:
            guard value == operation.contentType else {
                throw NativeTripRecoveryError.invalidContentType
            }
        case .complete:
            let prefix = "multipart/form-data; boundary="
            guard value.hasPrefix(prefix) else {
                throw NativeTripRecoveryError.invalidContentType
            }
            let boundary = String(value.dropFirst(prefix.count))
            guard
                !boundary.isEmpty,
                boundary.count <= 70,
                boundary.unicodeScalars.allSatisfy({
                    CharacterSet(
                        charactersIn:
                            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'()+_,-./:=?"
                    ).contains($0)
                })
            else {
                throw NativeTripRecoveryError.invalidContentType
            }
            if let exactRequestBody {
                let opening = Data("--\(boundary)\r\n".utf8)
                let closing = Data("\r\n--\(boundary)--\r\n".utf8)
                guard
                    exactRequestBody.starts(with: opening),
                    exactRequestBody.suffix(closing.count) == closing
                else {
                    throw NativeTripRecoveryError.invalidContentType
                }
            }
        }
    }
}

public struct NativeTripReceipt: Equatable, Sendable {
    public let operation: NativeTripOperation
    public let tripID: String
    public let responseSHA256: String

    public static func parseExact(_ data: Data) throws -> NativeTripReceipt {
        guard
            data.count <= 4_096,
            hasExactlyOneJSONKey("receipt", in: data),
            hasExactlyOneJSONKey("operation", in: data),
            hasExactlyOneJSONKey("tripId", in: data)
        else {
            throw NativeTripRecoveryError.invalidReceipt
        }
        let rootValue = try JSONSerialization.jsonObject(
            with: data,
            options: [.fragmentsAllowed]
        )
        guard
            let root = rootValue as? [String: Any],
            Set(root.keys) == ["receipt"],
            let receipt = root["receipt"] as? [String: Any],
            Set(receipt.keys) == ["operation", "tripId"],
            let operationValue = receipt["operation"] as? String,
            let operation = NativeTripOperation(rawValue: operationValue),
            let tripID = receipt["tripId"] as? String
        else {
            throw NativeTripRecoveryError.invalidReceipt
        }
        return NativeTripReceipt(
            operation: operation,
            tripID: try NativeTripIdentity.validateTripID(tripID),
            responseSHA256: SHA256.hash(data: data)
                .map { String(format: "%02x", $0) }
                .joined()
        )
    }

    private static func hasExactlyOneJSONKey(_ key: String, in data: Data) -> Bool {
        guard let text = String(data: data, encoding: .utf8) else {
            return false
        }
        let escapedKey = NSRegularExpression.escapedPattern(for: key)
        let expression = try! NSRegularExpression(
            pattern: "\"\(escapedKey)\"\\s*:"
        )
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return expression.numberOfMatches(in: text, range: range) == 1
    }
}

public enum NativeTripSubmissionOutcome: Sendable {
    case exactReceipt(NativeTripReceipt)
    case ambiguousTransport
    case conflict
    case rejected
    case undecodableResponse
}

public enum NativeTripRecoveryError: Error, Equatable {
    case invalidCredentialSlots
    case invalidContentType
    case invalidReceipt
    case invalidState
    case requestChanged
}

public struct NativeTripDurableRecord: Codable, Equatable, Sendable {
    public let descriptor: NativeTripRequestDescriptor
    public private(set) var state: NativeTripRecoveryState
    public private(set) var confirmationReceiptSHA256: String?

    public init(descriptor: NativeTripRequestDescriptor) {
        self.descriptor = descriptor
        self.state = .draft
        self.confirmationReceiptSHA256 = nil
    }

    private enum CodingKeys: String, CodingKey {
        case descriptor
        case state
        case confirmationReceiptSHA256
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: [
                "descriptor",
                "state",
                "confirmationReceiptSHA256",
            ]
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        descriptor = try container.decode(
            NativeTripRequestDescriptor.self,
            forKey: .descriptor
        )
        state = try container.decode(NativeTripRecoveryState.self, forKey: .state)
        confirmationReceiptSHA256 = try container.decodeIfPresent(
            String.self,
            forKey: .confirmationReceiptSHA256
        )
        let hasValidReceiptHash = confirmationReceiptSHA256?.range(
            of: #"^[a-f0-9]{64}$"#,
            options: .regularExpression
        ) != nil
        guard (state == .confirmed) == hasValidReceiptHash else {
            throw DecodingError.dataCorruptedError(
                forKey: .confirmationReceiptSHA256,
                in: container,
                debugDescription: "confirmed state requires one exact receipt hash"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(descriptor, forKey: .descriptor)
        try container.encode(state, forKey: .state)
        try container.encodeIfPresent(
            confirmationReceiptSHA256,
            forKey: .confirmationReceiptSHA256
        )
        if confirmationReceiptSHA256 == nil {
            try container.encodeNil(forKey: .confirmationReceiptSHA256)
        }
    }

    public mutating func beginSubmission(exactRequestBody: Data) throws {
        guard state == .draft else {
            throw NativeTripRecoveryError.invalidState
        }
        guard descriptor.matchesExactBody(exactRequestBody) else {
            state = .needsUserAttention
            throw NativeTripRecoveryError.requestChanged
        }
        state = .pendingSubmission
    }

    public mutating func prepareExplicitRetry(exactRequestBody: Data) throws {
        guard state == .pendingSubmission else {
            throw NativeTripRecoveryError.invalidState
        }
        guard descriptor.matchesExactBody(exactRequestBody) else {
            state = .needsUserAttention
            throw NativeTripRecoveryError.requestChanged
        }
    }

    public mutating func apply(_ outcome: NativeTripSubmissionOutcome) throws {
        guard state == .pendingSubmission else {
            throw NativeTripRecoveryError.invalidState
        }
        switch outcome {
        case let .exactReceipt(receipt):
            if receipt.operation == descriptor.operation, receipt.tripID == descriptor.tripID {
                state = .confirmed
                confirmationReceiptSHA256 = receipt.responseSHA256
            } else {
                state = .needsUserAttention
                confirmationReceiptSHA256 = nil
                throw NativeTripRecoveryError.invalidReceipt
            }
        case .ambiguousTransport:
            state = .pendingSubmission
        case .conflict, .rejected, .undecodableResponse:
            state = .needsUserAttention
            confirmationReceiptSHA256 = nil
        }
    }

    mutating func failChangedRequest() {
        state = .needsUserAttention
        confirmationReceiptSHA256 = nil
    }
}

public struct NativeTripPersistedSubmission: Codable, Equatable, Sendable {
    public let plan: NativeTripRequestPlan
    public private(set) var record: NativeTripDurableRecord

    public init(
        plan: NativeTripRequestPlan,
        builtRequest: NativeTripBuiltRequest
    ) throws {
        guard
            plan.operation == builtRequest.operation,
            plan.tripID == builtRequest.tripID
        else {
            throw NativeTripRequestBuilderError.requestDoesNotMatchPlan
        }
        let descriptor = try NativeTripRequestDescriptor(
            builtRequest: builtRequest,
            requestTokenSlot: plan.requestTokenSlot,
            reporterKeySlot: plan.reporterKeySlot
        )
        self.plan = plan
        self.record = NativeTripDurableRecord(descriptor: descriptor)
    }

    private enum CodingKeys: String, CodingKey {
        case plan
        case record
    }

    public init(from decoder: Decoder) throws {
        try nativeTripRequireExactKeys(
            decoder,
            expected: ["plan", "record"]
        )
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let plan = try container.decode(
            NativeTripRequestPlan.self,
            forKey: .plan
        )
        let record = try container.decode(
            NativeTripDurableRecord.self,
            forKey: .record
        )
        guard
            plan.operation == record.descriptor.operation,
            plan.tripID == record.descriptor.tripID,
            plan.requestTokenSlot == record.descriptor.requestTokenSlot,
            plan.reporterKeySlot == record.descriptor.reporterKeySlot
        else {
            throw NativeTripRequestBuilderError.requestDoesNotMatchPlan
        }
        self.plan = plan
        self.record = record
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(plan, forKey: .plan)
        try container.encode(record, forKey: .record)
    }

    public mutating func beginSubmission(
        using builtRequest: NativeTripBuiltRequest
    ) throws {
        try requireExactRequest(builtRequest)
        try record.beginSubmission(exactRequestBody: builtRequest.body)
    }

    public mutating func prepareExplicitRetry(
        using builtRequest: NativeTripBuiltRequest
    ) throws {
        try requireExactRequest(builtRequest)
        try record.prepareExplicitRetry(exactRequestBody: builtRequest.body)
    }

    public mutating func apply(
        _ outcome: NativeTripSubmissionOutcome
    ) throws {
        try record.apply(outcome)
    }

    private mutating func requireExactRequest(
        _ builtRequest: NativeTripBuiltRequest
    ) throws {
        guard
            plan.operation == builtRequest.operation,
            plan.tripID == builtRequest.tripID,
            record.descriptor.matches(builtRequest)
        else {
            record.failChangedRequest()
            throw NativeTripRecoveryError.requestChanged
        }
    }
}
