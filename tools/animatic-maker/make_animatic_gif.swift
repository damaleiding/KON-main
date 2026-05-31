import AppKit
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Beat {
    let kind: String
    let imagePath: String
    let panel: String
    let duration: Double
    let motion: String
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func parseBeats(_ path: String) -> [Beat] {
    guard let text = try? String(contentsOfFile: path, encoding: .utf8) else {
        fail("Could not read sequence file: \(path)")
    }

    return text.split(separator: "\n").compactMap { rawLine in
        let line = rawLine.trimmingCharacters(in: .whitespaces)
        if line.isEmpty || line.hasPrefix("#") {
            return nil
        }

        let parts = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
        guard parts.count >= 5 else {
            fail("Invalid sequence line: \(line)")
        }
        guard let duration = Double(parts[3]) else {
            fail("Invalid duration in line: \(line)")
        }
        return Beat(kind: parts[0], imagePath: parts[1], panel: parts[2], duration: duration, motion: parts[4])
    }
}

func cgImage(path: String) -> CGImage {
    guard let image = NSImage(contentsOfFile: path) else {
        fail("Could not read image: \(path)")
    }
    var rect = CGRect(origin: .zero, size: image.size)
    guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
        fail("Could not decode image: \(path)")
    }
    return cg
}

func rectForPanel(_ key: String, width: Int, height: Int) -> CGRect {
    let halfW = width / 2
    let halfH = height / 2
    switch key {
    case "tl":
        return CGRect(x: 0, y: 0, width: halfW, height: halfH)
    case "tr":
        return CGRect(x: halfW, y: 0, width: halfW, height: halfH)
    case "bl":
        return CGRect(x: 0, y: halfH, width: halfW, height: halfH)
    case "br":
        return CGRect(x: halfW, y: halfH, width: halfW, height: halfH)
    default:
        fail("Unknown panel key: \(key)")
    }
}

func sourceImage(for beat: Beat, cache: inout [String: CGImage]) -> CGImage? {
    if beat.kind == "black" || beat.kind == "white" {
        return nil
    }
    let image: CGImage
    if let cached = cache[beat.imagePath] {
        image = cached
    } else {
        image = cgImage(path: beat.imagePath)
        cache[beat.imagePath] = image
    }
    let rect = rectForPanel(beat.panel, width: image.width, height: image.height)
    guard let cropped = image.cropping(to: rect) else {
        fail("Could not crop \(beat.panel) from \(beat.imagePath)")
    }
    return cropped
}

func scaleForMotion(_ motion: String, progress: Double) -> CGFloat {
    switch motion {
    case "push":
        return CGFloat(1.0 + 0.06 * progress)
    case "slowpush":
        return CGFloat(1.0 + 0.035 * progress)
    case "pull":
        return CGFloat(1.06 - 0.04 * progress)
    case "pulse":
        return CGFloat(1.02 + 0.025 * sin(progress * .pi * 2.0))
    case "jolt":
        return CGFloat(1.04 + 0.018 * sin(progress * .pi * 16.0))
    default:
        return 1.0
    }
}

func overlayForMotion(_ motion: String, progress: Double) -> (NSColor, CGFloat)? {
    switch motion {
    case "flash":
        return (.white, CGFloat(max(0.0, 1.0 - progress) * 0.85))
    case "fadeblack":
        return (.black, CGFloat(max(0.0, progress - 0.35) / 0.65))
    case "blink":
        return (.black, CGFloat(max(0.0, sin(progress * .pi)) * 0.55))
    default:
        return nil
    }
}

func renderFrame(width: Int, height: Int, source: CGImage?, kind: String, motion: String, progress: Double) -> CGImage {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        fail("Could not create CGContext")
    }

    context.setFillColor(NSColor.black.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))

    if kind == "white" {
        context.setFillColor(NSColor.white.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    } else if let source {
        let scale = scaleForMotion(motion, progress: progress)
        let drawW = CGFloat(width) * scale
        let drawH = CGFloat(height) * scale
        context.interpolationQuality = .high
        context.draw(
            source,
            in: CGRect(
                x: (CGFloat(width) - drawW) / 2,
                y: (CGFloat(height) - drawH) / 2,
                width: drawW,
                height: drawH
            )
        )
    }

    if let (color, alpha) = overlayForMotion(motion, progress: progress), alpha > 0 {
        context.setFillColor(color.withAlphaComponent(alpha).cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    }

    guard let image = context.makeImage() else {
        fail("Could not render frame")
    }
    return image
}

let args = CommandLine.arguments
guard args.count == 6 else {
    fail("Usage: swift make_animatic_gif.swift <sequence.tsv> <output.gif> <fps> <width> <height>")
}

let sequencePath = args[1]
let outputPath = args[2]
let fps = Int(args[3]) ?? 12
let width = Int(args[4]) ?? 960
let height = Int(args[5]) ?? 540
let beats = parseBeats(sequencePath)
let frameDelay = 1.0 / Double(fps)
let frameCount = beats.reduce(0) { total, beat in
    total + max(1, Int(round(beat.duration * Double(fps))))
}

if FileManager.default.fileExists(atPath: outputPath) {
    try? FileManager.default.removeItem(atPath: outputPath)
}

let url = URL(fileURLWithPath: outputPath) as CFURL
guard let destination = CGImageDestinationCreateWithURL(url, UTType.gif.identifier as CFString, frameCount, nil) else {
    fail("Could not create GIF destination")
}

let gifProperties: [CFString: Any] = [
    kCGImagePropertyGIFDictionary: [
        kCGImagePropertyGIFLoopCount: 0
    ]
]
CGImageDestinationSetProperties(destination, gifProperties as CFDictionary)

let frameProperties: [CFString: Any] = [
    kCGImagePropertyGIFDictionary: [
        kCGImagePropertyGIFDelayTime: frameDelay
    ]
]

var cache: [String: CGImage] = [:]
for beat in beats {
    let source = sourceImage(for: beat, cache: &cache)
    let count = max(1, Int(round(beat.duration * Double(fps))))
    for i in 0..<count {
        let progress = count <= 1 ? 1.0 : Double(i) / Double(count - 1)
        let frame = renderFrame(width: width, height: height, source: source, kind: beat.kind, motion: beat.motion, progress: progress)
        CGImageDestinationAddImage(destination, frame, frameProperties as CFDictionary)
    }
}

guard CGImageDestinationFinalize(destination) else {
    fail("Could not finalize GIF")
}

print(outputPath)
