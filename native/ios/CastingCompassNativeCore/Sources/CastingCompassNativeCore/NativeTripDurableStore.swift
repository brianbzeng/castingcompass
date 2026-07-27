import Foundation

public enum NativeTripDurableStoreError: Error, Equatable {
    case invalidRootDirectory
    case unsafeFilesystemEntry
    case recordTooLarge
    case corruptRecord
    case writeVerificationFailed
}

public actor NativeTripDurableStore {
    public static let maximumRecordBytes = 65_536

    private let rootDirectory: URL
    private let fileManager: FileManager

    public init(rootDirectory: URL) throws {
        guard rootDirectory.isFileURL else {
            throw NativeTripDurableStoreError.invalidRootDirectory
        }
        self.rootDirectory = rootDirectory.standardizedFileURL
        self.fileManager = .default
        try Self.prepareRootDirectory(
            self.rootDirectory,
            fileManager: .default
        )
    }

    public static func applicationSupport() throws -> NativeTripDurableStore {
        guard let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw NativeTripDurableStoreError.invalidRootDirectory
        }
        return try NativeTripDurableStore(
            rootDirectory: applicationSupport
                .appendingPathComponent(
                    "CastingCompass",
                    isDirectory: true
                )
                .appendingPathComponent(
                    "PendingTripSubmissions",
                    isDirectory: true
                )
        )
    }

    public func save(
        _ submission: NativeTripPersistedSubmission
    ) throws {
        let destination = try recordURL(
            operation: submission.plan.operation,
            tripID: submission.plan.tripID
        )
        try rejectUnsafeEntryIfPresent(destination)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let bytes = try encoder.encode(submission)
        guard bytes.count <= Self.maximumRecordBytes else {
            throw NativeTripDurableStoreError.recordTooLarge
        }
#if os(iOS)
        try bytes.write(
            to: destination,
            options: [.atomic, .completeFileProtection]
        )
        try fileManager.setAttributes(
            [
                .posixPermissions: 0o600,
                .protectionKey: FileProtectionType.complete,
            ],
            ofItemAtPath: destination.path
        )
#else
        try bytes.write(to: destination, options: .atomic)
        try fileManager.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: destination.path
        )
#endif
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDestination = destination
        try mutableDestination.setResourceValues(values)
        let restored = try load(
            operation: submission.plan.operation,
            tripID: submission.plan.tripID
        )
        guard restored == submission else {
            throw NativeTripDurableStoreError.writeVerificationFailed
        }
    }

    public func load(
        operation: NativeTripOperation,
        tripID: String
    ) throws -> NativeTripPersistedSubmission? {
        let source = try recordURL(operation: operation, tripID: tripID)
        guard fileManager.fileExists(atPath: source.path) else {
            return nil
        }
        try requireRegularRecord(source)
        let values = try source.resourceValues(forKeys: [.fileSizeKey])
        guard
            let size = values.fileSize,
            size > 0,
            size <= Self.maximumRecordBytes
        else {
            throw NativeTripDurableStoreError.recordTooLarge
        }
        let data = try Data(contentsOf: source, options: .mappedIfSafe)
        guard data.count == size else {
            throw NativeTripDurableStoreError.corruptRecord
        }
        let decoded: NativeTripPersistedSubmission
        do {
            decoded = try JSONDecoder().decode(
                NativeTripPersistedSubmission.self,
                from: data
            )
        } catch {
            throw NativeTripDurableStoreError.corruptRecord
        }
        guard
            decoded.plan.operation == operation,
            decoded.plan.tripID == tripID
        else {
            throw NativeTripDurableStoreError.corruptRecord
        }
        return decoded
    }

    public func delete(
        operation: NativeTripOperation,
        tripID: String
    ) throws {
        let destination = try recordURL(operation: operation, tripID: tripID)
        guard fileManager.fileExists(atPath: destination.path) else {
            return
        }
        try requireRegularRecord(destination)
        try fileManager.removeItem(at: destination)
    }

    private func recordURL(
        operation: NativeTripOperation,
        tripID: String
    ) throws -> URL {
        let validatedTripID = try NativeTripIdentity.validateTripID(tripID)
        return rootDirectory.appendingPathComponent(
            "\(operation.rawValue)-\(validatedTripID).json",
            isDirectory: false
        )
    }

    private func rejectUnsafeEntryIfPresent(_ url: URL) throws {
        guard fileManager.fileExists(atPath: url.path) else {
            return
        }
        try requireRegularRecord(url)
    }

    private func requireRegularRecord(_ url: URL) throws {
        let values = try url.resourceValues(
            forKeys: [
                .isRegularFileKey,
                .isSymbolicLinkKey,
            ]
        )
        guard
            values.isRegularFile == true,
            values.isSymbolicLink != true
        else {
            throw NativeTripDurableStoreError.unsafeFilesystemEntry
        }
    }

    private static func prepareRootDirectory(
        _ rootDirectory: URL,
        fileManager: FileManager
    ) throws {
        if fileManager.fileExists(atPath: rootDirectory.path) {
            let values = try rootDirectory.resourceValues(
                forKeys: [
                    .isDirectoryKey,
                    .isSymbolicLinkKey,
                ]
            )
            guard
                values.isDirectory == true,
                values.isSymbolicLink != true
            else {
                throw NativeTripDurableStoreError.invalidRootDirectory
            }
        } else {
            try fileManager.createDirectory(
                at: rootDirectory,
                withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700]
            )
        }
#if os(iOS)
        try fileManager.setAttributes(
            [
                .posixPermissions: 0o700,
                .protectionKey: FileProtectionType.complete,
            ],
            ofItemAtPath: rootDirectory.path
        )
#else
        try fileManager.setAttributes(
            [.posixPermissions: 0o700],
            ofItemAtPath: rootDirectory.path
        )
#endif
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableRoot = rootDirectory
        try mutableRoot.setResourceValues(values)
    }
}
