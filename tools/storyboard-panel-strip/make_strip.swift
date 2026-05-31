import AppKit
import CoreGraphics
import Foundation

struct PanelSource {
    let path: String
    let order: [String]
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
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

func writePNG(_ cg: CGImage, to path: String) {
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let data = rep.representation(using: .png, properties: [:]) else {
        fail("Could not encode PNG: \(path)")
    }
    do {
        try data.write(to: URL(fileURLWithPath: path))
    } catch {
        fail("Could not write PNG: \(path): \(error)")
    }
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

let args = CommandLine.arguments
guard args.count >= 4 else {
    fail("Usage: swift make_strip.swift <out.png> <sheetA.png> <sheetB.png> [panelWidth panelHeight gutter]\n   or: swift make_strip.swift <out.png> --custom <sheet.png> <panel> ... --size <panelW> <panelH> <gutter>")
}

let outPath = args[1]
var panelW = 480
var panelH = 270
var gutter = 12
var frames: [CGImage] = []

if args[2] == "--custom" {
    var index = 3
    while index < args.count {
        if args[index] == "--size" {
            guard index + 3 < args.count else {
                fail("--size requires panelW panelH gutter")
            }
            panelW = Int(args[index + 1]) ?? panelW
            panelH = Int(args[index + 2]) ?? panelH
            gutter = Int(args[index + 3]) ?? gutter
            break
        }

        guard index + 1 < args.count else {
            fail("Custom mode requires <sheet.png> <panel> pairs")
        }

        let path = args[index]
        let key = args[index + 1]
        let image = cgImage(path: path)
        let rect = rectForPanel(key, width: image.width, height: image.height)
        guard let cropped = image.cropping(to: rect) else {
            fail("Could not crop \(key) from \(path)")
        }
        frames.append(cropped)
        index += 2
    }
} else {
    let sheets = [args[2], args[3]]
    panelW = args.count > 4 ? Int(args[4]) ?? 480 : 480
    panelH = args.count > 5 ? Int(args[5]) ?? 270 : 270
    gutter = args.count > 6 ? Int(args[6]) ?? 12 : 12
    let order = ["tl", "tr", "bl", "br"]

    frames = sheets.flatMap { path in
        let image = cgImage(path: path)
        return order.map { key in
            let rect = rectForPanel(key, width: image.width, height: image.height)
            guard let cropped = image.cropping(to: rect) else {
                fail("Could not crop \(key) from \(path)")
            }
            return cropped
        }
    }
}

guard !frames.isEmpty else {
    fail("No frames to render")
}

let outW = frames.count * panelW + max(0, frames.count - 1) * gutter
let outH = panelH
let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(
    data: nil,
    width: outW,
    height: outH,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
    fail("Could not create CGContext")
}

context.setFillColor(NSColor.black.cgColor)
context.fill(CGRect(x: 0, y: 0, width: outW, height: outH))

for (index, frame) in frames.enumerated() {
    let x = index * (panelW + gutter)
    context.draw(frame, in: CGRect(x: x, y: 0, width: panelW, height: panelH))
}

guard let output = context.makeImage() else {
    fail("Could not render output")
}

writePNG(output, to: outPath)
