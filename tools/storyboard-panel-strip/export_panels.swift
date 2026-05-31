import AppKit
import CoreGraphics
import Foundation

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

let args = CommandLine.arguments
guard args.count == 4 else {
    fail("Usage: swift export_panels.swift <sheet.png> <prefix> <out_dir>")
}

let sheetPath = args[1]
let prefix = args[2]
let outDir = args[3]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let image = cgImage(path: sheetPath)
for key in ["tl", "tr", "bl", "br"] {
    let rect = rectForPanel(key, width: image.width, height: image.height)
    guard let cropped = image.cropping(to: rect) else {
        fail("Could not crop \(key)")
    }
    writePNG(cropped, to: "\(outDir)/\(prefix)_\(key).png")
}
