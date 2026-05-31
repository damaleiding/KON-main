import AVFoundation
import Foundation

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

let args = CommandLine.arguments
guard args.count >= 4 else {
    fail("Usage: swift concat_videos.swift <output.mp4> <input1.mp4> <input2.mp4> ...")
}

let outputPath = args[1]
let inputPaths = Array(args.dropFirst(2))

if FileManager.default.fileExists(atPath: outputPath) {
    try? FileManager.default.removeItem(atPath: outputPath)
}

let composition = AVMutableComposition()
guard let videoTrack = composition.addMutableTrack(
    withMediaType: .video,
    preferredTrackID: kCMPersistentTrackID_Invalid
) else {
    fail("Could not create video composition track")
}

var audioTrack: AVMutableCompositionTrack?
var cursor = CMTime.zero
var preferredTransform = CGAffineTransform.identity
var naturalSize = CGSize(width: 1920, height: 1080)

for path in inputPaths {
    let url = URL(fileURLWithPath: path)
    let asset = AVAsset(url: url)
    let range = CMTimeRange(start: .zero, duration: asset.duration)

    guard let sourceVideo = asset.tracks(withMediaType: .video).first else {
        fail("No video track: \(path)")
    }

    if cursor == .zero {
        preferredTransform = sourceVideo.preferredTransform
        naturalSize = sourceVideo.naturalSize
    }

    do {
        try videoTrack.insertTimeRange(range, of: sourceVideo, at: cursor)
    } catch {
        fail("Could not insert video \(path): \(error)")
    }

    if let sourceAudio = asset.tracks(withMediaType: .audio).first {
        if audioTrack == nil {
            audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        }
        do {
            try audioTrack?.insertTimeRange(range, of: sourceAudio, at: cursor)
        } catch {
            fail("Could not insert audio \(path): \(error)")
        }
    }

    cursor = cursor + asset.duration
}

videoTrack.preferredTransform = preferredTransform

guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
    fail("Could not create export session")
}

export.outputURL = URL(fileURLWithPath: outputPath)
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = false

let semaphore = DispatchSemaphore(value: 0)
export.exportAsynchronously {
    semaphore.signal()
}
semaphore.wait()

if export.status != .completed {
    fail("Export failed: \(String(describing: export.error))")
}

print(outputPath)
print("duration_seconds=\(CMTimeGetSeconds(composition.duration))")
print("size=\(Int(naturalSize.width))x\(Int(naturalSize.height))")
