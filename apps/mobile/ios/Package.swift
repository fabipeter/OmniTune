// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "OmniTuneCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "OmniTuneCore", targets: ["OmniTuneCore"]),
    ],
    targets: [
        .target(
            name: "OmniTuneCore",
            path: "OmniTuneCore"
        ),
        .testTarget(
            name: "OmniTuneCoreTests",
            dependencies: ["OmniTuneCore"],
            path: "Tests/OmniTuneCoreTests"
        ),
    ]
)
