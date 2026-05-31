import AppKit
import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation

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
        let alpha = CGFloat(max(0.0, 1.0 - progress) * 0.85)
        return (.white, alpha)
    case "fadeblack":
        let alpha = CGFloat(max(0.0, progress - 0.35) / 0.65)
        return (.black, alpha)
    case "blink":
        let alpha = CGFloat(max(0.0, sin(progress * .pi)) * 0.55)
        return (.black, alpha)
    default:
        return nil
    }
}

func appendFrame(
    writerInput: AVAssetWriterInput,
    adaptor: AVAssetWriterInputPixelBufferAdaptor,
    time: CMTime,
    width: Int,
    height: Int,
    source: CGImage?,
    kind: String,
    motion: String,
    progress: Double
) {
    guard let pool = adaptor.pixelBufferPool else {
        fail("Missing pixel buffer pool")
    }

    var maybeBuffer: CVPixelBuffer?
    let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &maybeBuffer)
    guard status == kCVReturnSuccess, let buffer = maybeBuffer else {
        fail("Could not create pixel buffer")
    }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let base = CVPixelBufferGetBaseAddress(buffer) else {
        fail("Could not lock pixel buffer")
    }

    let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: base,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
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
        let offsetX = (CGFloat(width) - drawW) / 2.0
        let offsetY = (CGFloat(height) - drawH) / 2.0
        context.interpolationQuality = .high
        context.draw(source, in: CGRect(x: offsetX, y: offsetY, width: drawW, height: drawH))
    }

    if let (color, alpha) = overlayForMotion(motion, progress: progress), alpha > 0 {
        context.setFillColor(color.withAlphaComponent(alpha).cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    }

    while !writerInput.isReadyForMoreMediaData {
        Thread.sleep(forTimeInterval: 0.002)
    }

    if !adaptor.append(buffer, withPresentationTime: time) {
        fail("Could not append frame at \(time.seconds)")
    }
}

let args = CommandLine.arguments
guard args.count == 4 else {
    fail("Usage: swift make_animatic.swift <sequence.tsv> <output.mp4> <fps>")
}

let sequencePath = args[1]
let outputPath = args[2]
let fps = Int32(args[3]) ?? 24
let width = 1920
let height = 1080
let beats = parseBeats(sequencePath)

if FileManager.default.fileExists(atPath: outputPath) {
    try? FileManager.default.removeItem(atPath: outputPath)
}

let outputURL = URL(fileURLWithPath: outputPath)
let isMov = outputURL.pathExtension.lowercased() == "mov"
let fileType: AVFileType = isMov ? .mov : .mp4
let codec: AVVideoCodecType = isMov ? .jpeg : .h264

guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: fileType) else {
    fail("Could not create AVAssetWriter")
}

let settings: [String: Any] = [
    AVVideoCodecKey: codec,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height
]

let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false

let attributes: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)

guard writer.canAdd(input) else {
    fail("Could not add writer input")
}
writer.add(input)

guard writer.startWriting() else {
    fail("Could not start writing: \(String(describing: writer.error))")
}
writer.startSession(atSourceTime: .zero)

var imageCache: [String: CGImage] = [:]
var frameIndex: Int64 = 0
let frameDuration = CMTime(value: 1, timescale: fps)

for beat in beats {
    let source = sourceImage(for: beat, cache: &imageCache)
    let count = max(1, Int(round(beat.duration * Double(fps))))

    for i in 0..<count {
        let progress = count <= 1 ? 1.0 : Double(i) / Double(count - 1)
        let time = CMTimeMultiply(frameDuration, multiplier: Int32(frameIndex))
        appendFrame(
            writerInput: input,
            adaptor: adaptor,
            time: time,
            width: width,
            height: height,
            source: source,
            kind: beat.kind,
            motion: beat.motion,
            progress: progress
        )
        frameIndex += 1
    }
}

input.markAsFinished()
let group = DispatchGroup()
group.enter()
writer.finishWriting {
    group.leave()
}
group.wait()

if writer.status != .completed {
    fail("Writer failed: \(String(describing: writer.error))")
}

print(outputPath)
