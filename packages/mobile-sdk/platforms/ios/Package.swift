// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "UrnlabsSDK",
    platforms: [
        .iOS(.v14),
        .macOS(.v11),
        .tvOS(.v14),
        .watchOS(.v7)
    ],
    products: [
        .library(
            name: "UrnlabsSDK",
            targets: ["UrnlabsSDK"]
        ),
    ],
    dependencies: [
        // No external dependencies - using native iOS frameworks only
    ],
    targets: [
        .target(
            name: "UrnlabsSDK",
            dependencies: []
        ),
        .testTarget(
            name: "UrnlabsSDKTests",
            dependencies: ["UrnlabsSDK"]
        ),
    ]
)