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
        reporterKeySlot: NativeTripCredentialSlot?
    ) throws {
        let validatedTripID = try NativeTripIdentity.validateTripID(tripID)
        guard
            requestTokenSlot.kind == .requestToken,
            operation == .cancel || reporterKeySlot?.kind == .reporterKey
        else {
            throw NativeTripRecoveryError.invalidCredentialSlots
        }
        self.operation = operation
        self.tripID = validatedTripID
        self.method = operation.method
        self.path = try operation.path(tripID: validatedTripID)
        self.contentType = operation.contentType
        self.exactBodySHA256 = SHA256.hash(data: exactRequestBody)
            .map { String(format: "%02x", $0) }
            .joined()
        self.requestTokenSlot = requestTokenSlot
        self.reporterKeySlot = reporterKeySlot
    }

    public func matchesExactBody(_ body: Data) -> Bool {
        SHA256.hash(data: body)
            .map { String(format: "%02x", $0) }
            .joined() == exactBodySHA256
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
}
