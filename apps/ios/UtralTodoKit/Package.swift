// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "UtralTodoKit",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
    ],
    products: [
        .library(
            name: "UtralTodoKit",
            targets: ["UtralTodoKit"]
        ),
    ],
    targets: [
        .target(
            name: "UtralTodoKit",
            path: "Sources"
        ),
    ]
)
