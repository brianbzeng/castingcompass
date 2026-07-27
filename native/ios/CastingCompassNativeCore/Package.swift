// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "CastingCompassNativeCore",
    platforms: [
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "CastingCompassNativeCore",
            targets: ["CastingCompassNativeCore"]
        ),
        .executable(
            name: "CastingCompassNativeCoreCheck",
            targets: ["CastingCompassNativeCoreCheck"]
        ),
    ],
    targets: [
        .target(
            name: "CastingCompassNativeCore",
            linkerSettings: [
                .linkedFramework("AuthenticationServices"),
                .linkedFramework("Security"),
            ]
        ),
        .executableTarget(
            name: "CastingCompassNativeCoreCheck",
            dependencies: ["CastingCompassNativeCore"]
        ),
        .testTarget(
            name: "CastingCompassNativeCoreTests",
            dependencies: ["CastingCompassNativeCore"]
        ),
    ]
)
