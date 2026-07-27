import Foundation
import Security

public enum NativeTripContract {
    public static let clientContractVersion = "castingcompass.native-trip-client/1.0.0"
    public static let apiCompatibilityVersion = "1"
    public static let apiVersionHeader = "X-CastingCompass-API-Version"
    public static let requiredScope = "trips:write"
}

public enum NativeTripOperation: String, Codable, CaseIterable, Sendable {
    case start
    case complete
    case cancel

    public var method: String {
        "POST"
    }

    public var contentType: String {
        switch self {
        case .start, .cancel:
            "application/json"
        case .complete:
            "multipart/form-data"
        }
    }

    public func path(tripID: String) throws -> String {
        switch self {
        case .start:
            "/api/trips/start"
        case .complete:
            "/api/trips/\(try NativeTripIdentity.validateTripID(tripID))/complete"
        case .cancel:
            "/api/trips/\(try NativeTripIdentity.validateTripID(tripID))/cancel"
        }
    }
}

public enum NativeTripIdentityError: Error, Equatable {
    case invalidTripID
    case randomGenerationFailed(OSStatus)
}

public enum NativeTripIdentity {
    private static let tripIDPattern = try! NSRegularExpression(
        pattern: #"^trip_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#
    )

    public static func makeTripID(uuid: UUID = UUID()) -> String {
        "trip_\(uuid.uuidString.lowercased())"
    }

    @discardableResult
    public static func validateTripID(_ value: String) throws -> String {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard tripIDPattern.firstMatch(in: value, range: range) != nil else {
            throw NativeTripIdentityError.invalidTripID
        }
        return value
    }

    public static func makeRandomToken() throws -> String {
        let byteCount = 32
        var bytes = [UInt8](repeating: 0, count: byteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        guard status == errSecSuccess else {
            throw NativeTripIdentityError.randomGenerationFailed(status)
        }
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
