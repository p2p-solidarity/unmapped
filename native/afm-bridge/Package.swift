// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AFMBridge",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "afm-bridge", targets: ["AFMBridge"])
    ],
    targets: [
        .executableTarget(
            name: "AFMBridge",
            path: "Sources/AFMBridge"
        ),
        .testTarget(
            name: "AFMBridgeTests",
            dependencies: ["AFMBridge"],
            path: "Tests/AFMBridgeTests"
        )
    ]
)
