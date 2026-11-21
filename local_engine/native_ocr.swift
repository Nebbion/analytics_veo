import Foundation
import Vision
import ImageIO

// stdin/stdout JSON only. All image bytes remain on the Mac.
do {
    let input = FileHandle.standardInput.readDataToEndOfFile()
    let value = try JSONSerialization.jsonObject(with: input) as? [String: Any] ?? [:]
    guard let path = value["image_path"] as? String else {
        throw NSError(domain: "LocalOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "Image missing"])
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["it-IT", "en-US"]
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0.004
    request.customWords = value["custom_words"] as? [String] ?? []
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
    try handler.perform([request])
    var blocks: [[String: Any]] = []
    let pattern = try NSRegularExpression(pattern: "\\S+")
    for observation in request.results ?? [] {
        guard let text = observation.topCandidates(1).first else { continue }
        let whole = NSRange(text.string.startIndex..., in: text.string)
        for match in pattern.matches(in: text.string, range: whole) {
            guard let range = Range(match.range, in: text.string) else { continue }
            let box = (try? text.boundingBox(for: range))?.boundingBox ?? observation.boundingBox
            blocks.append(["text": String(text.string[range]), "line_text": text.string, "confidence": text.confidence,
                           "bbox": [box.minX, 1 - box.maxY, box.maxX, 1 - box.minY]])
        }
    }
    let output = try JSONSerialization.data(withJSONObject: ["engine": "apple_vision", "blocks": blocks], options: [.sortedKeys])
    FileHandle.standardOutput.write(output)
} catch {
    let data = try! JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
    FileHandle.standardOutput.write(data)
    exit(1)
}
