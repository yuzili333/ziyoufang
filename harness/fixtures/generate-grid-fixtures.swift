import AppKit
import CoreGraphics
import CoreImage
import CoreText
import CryptoKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

private let canvasSize = 1600
private let glyphCanvasSize = 360
private let margin = 80
private let columns = 4
private let rows = 4
private let cellSize = (canvasSize - margin * 2) / columns
private let expectedCharacters = Array("永和春山日月天地人心正学书法美华")
private let renderedCharacters = Array("永和春出日月天地人心正学书法美华")
private let categories = [
    "unattractive", "normal", "normal", "wrong",
    "normal", "unattractive", "normal", "uncertain",
    "normal", "unattractive", "normal", "normal",
    "unattractive", "normal", "normal", "normal"
]
private let scores: [Int?] = [82, 91, 93, 38, 90, 76, 94, nil, 92, 79, 95, 89, 73, 92, 90, 88]
private let confidences = [0.96, 0.97, 0.98, 0.93, 0.97, 0.95, 0.98, 0.43, 0.98, 0.94, 0.98, 0.97, 0.93, 0.97, 0.96, 0.96]
private let rotations = [-0.025, 0.018, -0.012, 0.022, 0.008, -0.020, 0.016, -0.008,
                         0.012, -0.018, 0.006, -0.014, 0.020, -0.010, 0.014, -0.006]

private enum FixtureError: Error {
    case contextCreation
    case imageCreation
    case imageDestination
    case imageWrite
}

private func makeCanvas() throws -> CGImage {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(data: nil, width: canvasSize, height: canvasSize,
                                  bitsPerComponent: 8, bytesPerRow: canvasSize * 4,
                                  space: colorSpace,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw FixtureError.contextCreation
    }

    context.setFillColor(CGColor(red: 0.985, green: 0.975, blue: 0.945, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize))

    let vermilion = CGColor(red: 0.76, green: 0.16, blue: 0.12, alpha: 0.92)
    let guide = CGColor(red: 0.76, green: 0.16, blue: 0.12, alpha: 0.30)
    context.setStrokeColor(vermilion)
    context.setLineWidth(7)
    context.stroke(CGRect(x: margin, y: margin,
                          width: canvasSize - margin * 2, height: canvasSize - margin * 2))

    context.setLineWidth(3)
    for index in 1..<columns {
        let offset = CGFloat(margin + index * cellSize)
        context.move(to: CGPoint(x: offset, y: CGFloat(margin)))
        context.addLine(to: CGPoint(x: offset, y: CGFloat(canvasSize - margin)))
        context.move(to: CGPoint(x: CGFloat(margin), y: offset))
        context.addLine(to: CGPoint(x: CGFloat(canvasSize - margin), y: offset))
    }
    context.strokePath()

    context.setStrokeColor(guide)
    context.setLineWidth(2)
    context.setLineDash(phase: 0, lengths: [12, 10])
    for row in 0..<rows {
        for column in 0..<columns {
            let left = CGFloat(margin + column * cellSize)
            let bottom = CGFloat(canvasSize - margin - (row + 1) * cellSize)
            let right = left + CGFloat(cellSize)
            let top = bottom + CGFloat(cellSize)
            context.move(to: CGPoint(x: left, y: bottom))
            context.addLine(to: CGPoint(x: right, y: top))
            context.move(to: CGPoint(x: right, y: bottom))
            context.addLine(to: CGPoint(x: left, y: top))
            context.move(to: CGPoint(x: left + CGFloat(cellSize) / 2, y: bottom))
            context.addLine(to: CGPoint(x: left + CGFloat(cellSize) / 2, y: top))
            context.move(to: CGPoint(x: left, y: bottom + CGFloat(cellSize) / 2))
            context.addLine(to: CGPoint(x: right, y: bottom + CGFloat(cellSize) / 2))
        }
    }
    context.strokePath()
    context.setLineDash(phase: 0, lengths: [])

    let font = CTFontCreateWithName("HanziPen SC" as CFString, 248, nil)
    for index in renderedCharacters.indices {
        let row = index / columns
        let column = index % columns
        let attributes: [CFString: Any] = [
            kCTFontAttributeName: font,
            kCTForegroundColorAttributeName: CGColor(gray: 0.06, alpha: 0.96)
        ]
        let attributed = CFAttributedStringCreate(nil, String(renderedCharacters[index]) as CFString,
                                                   attributes as CFDictionary)!
        let line = CTLineCreateWithAttributedString(attributed)
        let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
        let centerX = CGFloat(margin + column * cellSize) + CGFloat(cellSize) / 2
        let centerY = CGFloat(canvasSize - margin - (row + 1) * cellSize) + CGFloat(cellSize) / 2
        context.saveGState()
        context.translateBy(x: centerX, y: centerY)
        context.rotate(by: rotations[index])
        let scale = 0.96 + CGFloat(index % 3) * 0.025
        context.scaleBy(x: scale, y: scale)
        context.textPosition = CGPoint(x: -bounds.midX, y: -bounds.midY)
        CTLineDraw(line, context)
        context.restoreGState()
    }

    guard let image = context.makeImage() else {
        throw FixtureError.imageCreation
    }
    return image
}

private func makeReferenceGlyph(_ character: Character) throws -> CGImage {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(data: nil, width: glyphCanvasSize, height: glyphCanvasSize,
                                  bitsPerComponent: 8, bytesPerRow: glyphCanvasSize * 4,
                                  space: colorSpace,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
        throw FixtureError.contextCreation
    }
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: glyphCanvasSize, height: glyphCanvasSize))
    let font = CTFontCreateWithName("HanziPen SC" as CFString, 248, nil)
    let attributes: [CFString: Any] = [
        kCTFontAttributeName: font,
        kCTForegroundColorAttributeName: CGColor(gray: 0.06, alpha: 1)
    ]
    let attributed = CFAttributedStringCreate(nil, String(character) as CFString,
                                               attributes as CFDictionary)!
    let line = CTLineCreateWithAttributedString(attributed)
    let bounds = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
    context.textPosition = CGPoint(
        x: CGFloat(glyphCanvasSize) / 2 - bounds.midX,
        y: CGFloat(glyphCanvasSize) / 2 - bounds.midY
    )
    CTLineDraw(line, context)
    guard let image = context.makeImage() else { throw FixtureError.imageCreation }
    return image
}

private func writePNG(_ image: CGImage, to url: URL) throws {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL,
                                                             UTType.png.identifier as CFString,
                                                             1, nil) else {
        throw FixtureError.imageDestination
    }
    CGImageDestinationAddImage(destination, image, [kCGImagePropertyPNGCompressionFilter: 5] as CFDictionary)
    if !CGImageDestinationFinalize(destination) {
        throw FixtureError.imageWrite
    }
}

private func sha256(_ url: URL) throws -> String {
    let data = try Data(contentsOf: url)
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func boundingBox(for index: Int) -> [String: Double] {
    let row = index / columns
    let column = index % columns
    let inset = Double(cellSize) * 0.10
    return [
        "x": (Double(margin + column * cellSize) + inset) / Double(canvasSize),
        "y": (Double(margin + row * cellSize) + inset) / Double(canvasSize),
        "width": (Double(cellSize) - inset * 2) / Double(canvasSize),
        "height": (Double(cellSize) - inset * 2) / Double(canvasSize)
    ]
}

private func issue(for index: Int) -> [[String: Any]] {
    switch categories[index] {
    case "wrong":
        return [["id": "fixture-wrong-\(index)", "title": "目标字与字形不一致",
                 "detail": "夹具故意将目标“山”写成“出”，用于验证错字流程。"]]
    case "unattractive":
        return [["id": "fixture-shape-\(index)", "title": "结构位置待调整",
                 "detail": "合成字包含轻微旋转或比例偏移，用于验证问题清单展示。"]]
    case "uncertain":
        return [["id": "fixture-uncertain-\(index)", "title": "识别证据不足",
                 "detail": "该项用于验证待确认结果不写入问题字本。"]]
    default:
        return []
    }
}

private func suggestion(for index: Int) -> String {
    switch categories[index] {
    case "wrong": return "请对照目标字检查关键笔画后重新练习。"
    case "unattractive": return "请先确认中线与结构比例，再控制笔画位置。"
    case "uncertain": return "请确认目标内容或重新拍摄更清晰的图片。"
    default: return "结构稳定，继续保持。"
    }
}

private func writeJSON(_ object: Any, to url: URL) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: url, options: .atomic)
    try Data("\n".utf8).append(to: url)
}

private extension Data {
    func append(to url: URL) throws {
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.seekToEnd()
        try handle.write(contentsOf: self)
    }
}

private func main() throws {
    let scriptURL = URL(fileURLWithPath: #filePath)
    let fixtureRoot = scriptURL.deletingLastPathComponent()
    let inputRoot = fixtureRoot.appendingPathComponent("inputs", isDirectory: true)
    let expectedRoot = fixtureRoot.appendingPathComponent("expected", isDirectory: true)
    let metadataRoot = fixtureRoot.appendingPathComponent("metadata", isDirectory: true)
    let referenceRoot = fixtureRoot.appendingPathComponent("references", isDirectory: true)
    for directory in [inputRoot, expectedRoot, metadataRoot, referenceRoot] {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    let clear = try makeCanvas()
    let clearURL = inputRoot.appendingPathComponent("multi-grid-clear-v1.png")
    try writePNG(clear, to: clearURL)

    let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    let clearCI = CIImage(cgImage: clear)
    let blurredCI = clearCI.clampedToExtent().applyingGaussianBlur(sigma: 16).cropped(to: clearCI.extent)
    guard let blurred = ciContext.createCGImage(blurredCI, from: clearCI.extent),
          let cropped = clear.cropping(to: CGRect(x: 0, y: 0, width: 1280, height: canvasSize)) else {
        throw FixtureError.imageCreation
    }
    let blurredURL = inputRoot.appendingPathComponent("multi-grid-blurred-v1.png")
    let croppedURL = inputRoot.appendingPathComponent("multi-grid-cropped-v1.png")
    try writePNG(blurred, to: blurredURL)
    try writePNG(cropped, to: croppedURL)

    var characterResults: [[String: Any]] = []
    for index in expectedCharacters.indices {
        let scoreValue: Any = scores[index].map { value in value as Any } ?? NSNull()
        characterResults.append([
            "index": index,
            "expectedCharacter": String(expectedCharacters[index]),
            "recognizedCharacter": String(renderedCharacters[index]),
            "boundingBox": boundingBox(for: index),
            "standardGlyphVersion": "songti-sc-system-fixture-v1",
            "score": scoreValue,
            "confidence": confidences[index],
            "category": categories[index],
            "issues": issue(for: index),
            "suggestion": suggestion(for: index)
        ])
    }
    try writeJSON([
        "localTaskId": "fixture-grid-v1",
        "idempotencyKey": "fixture-grid-v1-idempotency",
        "status": "completed",
        "characters": characterResults
    ], to: expectedRoot.appendingPathComponent("multi-grid-clear-v1.assessment.json"))

    try writeJSON([
        "schemaVersion": 1,
        "cases": [
            ["input": "multi-grid-clear-v1.png", "accepted": true, "reason": NSNull()],
            ["input": "multi-grid-blurred-v1.png", "accepted": false, "reason": "IMAGE_BLUR"],
            ["input": "multi-grid-cropped-v1.png", "accepted": false, "reason": "GRID_INCOMPLETE"]
        ]
    ], to: expectedRoot.appendingPathComponent("image-quality-v1.json"))

    let font = CTFontCreateWithName("HanziPen SC" as CFString, 248, nil)
    var glyphReferences: [[String: Any]] = []
    for (index, character) in expectedCharacters.enumerated() {
        let fileName = String(format: "synthetic-glyph-%02d.png", index)
        let url = referenceRoot.appendingPathComponent(fileName)
        try writePNG(try makeReferenceGlyph(character), to: url)
        glyphReferences.append([
            "character": String(character),
            "file": fileName,
            "sha256": try sha256(url)
        ])
    }
    try writeJSON([
        "schemaVersion": 1,
        "fixtureId": "multi-grid-v1",
        "synthetic": true,
        "containsPersonalData": false,
        "generator": "generate-grid-fixtures.swift",
        "fontPostScriptName": CTFontCopyPostScriptName(font) as String,
        "fontUse": "Local macOS system font rasterized for non-shipping test input; no font file is redistributed.",
        "glyphReferenceVersion": "hanzi-pen-synthetic-reference-v1",
        "glyphReferenceUse": "Non-shipping synthetic regression only; not an approved product standard glyph.",
        "glyphReferences": glyphReferences,
        "targetText": String(expectedCharacters),
        "renderedText": String(renderedCharacters),
        "grid": ["rows": rows, "columns": columns, "sourceWidth": canvasSize, "sourceHeight": canvasSize],
        "files": [
            ["name": clearURL.lastPathComponent, "sha256": try sha256(clearURL)],
            ["name": blurredURL.lastPathComponent, "sha256": try sha256(blurredURL)],
            ["name": croppedURL.lastPathComponent, "sha256": try sha256(croppedURL)]
        ]
    ], to: metadataRoot.appendingPathComponent("multi-grid-v1.json"))

    print("Generated synthetic fixtures in \(fixtureRoot.path)")
}

do {
    try main()
} catch {
    FileHandle.standardError.write(Data("Fixture generation failed: \(error)\n".utf8))
    exit(1)
}
