import Foundation
import Security

public enum NativeTripCredentialKind: String, Codable, Sendable {
    case accessToken = "access-token"
    case refreshToken = "refresh-token"
    case reporterKey = "reporter-key"
    case requestToken = "request-token"
}

public struct NativeTripCredentialSlot: Codable, Equatable, Hashable, Sendable {
    public let kind: NativeTripCredentialKind
    public let account: String

    public init(kind: NativeTripCredentialKind, account: String) throws {
        guard
            !account.isEmpty,
            account.count <= 200,
            account.unicodeScalars.allSatisfy({
                CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789._:-")
                    .contains($0)
            })
        else {
            throw NativeTripCredentialVaultError.invalidAccount
        }
        self.kind = kind
        self.account = account
    }
}

public protocol NativeTripCredentialVault: Sendable {
    func store(_ value: Data, in slot: NativeTripCredentialSlot) throws
    func read(from slot: NativeTripCredentialSlot) throws -> Data
    func delete(_ slot: NativeTripCredentialSlot) throws
}

public enum NativeTripCredentialVaultError: Error, Equatable {
    case invalidAccount
    case emptyCredential
    case notFound
    case unexpectedStatus(OSStatus)
}

public final class KeychainNativeTripCredentialVault: NativeTripCredentialVault, @unchecked Sendable {
    public static let defaultService = "com.castingcompass.native.credentials"

    private let service: String

    public init(service: String = defaultService) {
        precondition(!service.isEmpty, "Keychain service must not be empty")
        self.service = service
    }

    public func store(_ value: Data, in slot: NativeTripCredentialSlot) throws {
        guard !value.isEmpty else {
            throw NativeTripCredentialVaultError.emptyCredential
        }
        let query = baseQuery(slot)
        let attributes: [String: Any] = [
            kSecValueData as String: value,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecAttrSynchronizable as String: false,
        ]
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            attributes as CFDictionary
        )
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw NativeTripCredentialVaultError.unexpectedStatus(updateStatus)
        }
        var insertion = query
        insertion.merge(attributes) { _, newValue in newValue }
        let addStatus = SecItemAdd(insertion as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw NativeTripCredentialVaultError.unexpectedStatus(addStatus)
        }
    }

    public func read(from slot: NativeTripCredentialSlot) throws -> Data {
        var query = baseQuery(slot)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            throw NativeTripCredentialVaultError.notFound
        }
        guard status == errSecSuccess else {
            throw NativeTripCredentialVaultError.unexpectedStatus(status)
        }
        guard let data = result as? Data, !data.isEmpty else {
            throw NativeTripCredentialVaultError.notFound
        }
        return data
    }

    public func delete(_ slot: NativeTripCredentialSlot) throws {
        let status = SecItemDelete(baseQuery(slot) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw NativeTripCredentialVaultError.unexpectedStatus(status)
        }
    }

    private func baseQuery(_ slot: NativeTripCredentialSlot) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "\(slot.kind.rawValue):\(slot.account)",
            kSecAttrSynchronizable as String: false,
        ]
    }
}
