import AppKit
import CoreGraphics
import Foundation
import UniformTypeIdentifiers

enum IconGenerationError: Error, CustomStringConvertible {
  case invalidArguments
  case failedToLoadSource(String)
  case failedToCreateContext
  case failedToWriteOutput(String)

  var description: String {
    switch self {
    case .invalidArguments:
      return "usage: swift scripts/generate-macos-icon.swift <source-logo-png> <output-png>"
    case let .failedToLoadSource(path):
      return "failed to load source image at \(path)"
    case .failedToCreateContext:
      return "failed to create image context"
    case let .failedToWriteOutput(path):
      return "failed to write output image to \(path)"
    }
  }
}

let canvasSize = CGSize(width: 1024, height: 1024)
let tileRect = CGRect(x: 64, y: 64, width: 896, height: 896)
let tileCornerRadius: CGFloat = 205
let artworkBounds = CGRect(x: 132, y: 108, width: 760, height: 808)
let artworkCornerRadius: CGFloat = 86

func makeColor(red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat = 1) -> NSColor {
  let normalizedRed = red / 255
  let normalizedGreen = green / 255
  let normalizedBlue = blue / 255
  return NSColor(
    displayP3Red: normalizedRed,
    green: normalizedGreen,
    blue: normalizedBlue,
    alpha: alpha,
  )
}

func fitRect(aspectRatio: CGSize, inside boundingRect: CGRect) -> CGRect {
  let widthScale = boundingRect.width / aspectRatio.width
  let heightScale = boundingRect.height / aspectRatio.height
  let scale = min(widthScale, heightScale)
  let width = aspectRatio.width * scale
  let height = aspectRatio.height * scale
  return CGRect(
    x: boundingRect.midX - (width / 2),
    y: boundingRect.midY - (height / 2),
    width: width,
    height: height,
  )
}

func trimmedImage(
  _ image: CGImage,
  alphaThreshold: CGFloat = 0.01,
  visibilityThreshold: CGFloat = 0.055,
  padding: Int = 36,
) -> CGImage {
  let bitmap = NSBitmapImageRep(cgImage: image)
  let width = Int(bitmap.pixelsWide)
  let height = Int(bitmap.pixelsHigh)

  var minX = width
  var minY = height
  var maxX = -1
  var maxY = -1

  for y in 0 ..< height {
    for x in 0 ..< width {
      guard
        let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.extendedSRGB),
        color.alphaComponent > alphaThreshold
      else {
        continue
      }
      let visibleComponent = max(color.redComponent, color.greenComponent, color.blueComponent)
      guard visibleComponent > visibilityThreshold else {
        continue
      }
      minX = min(minX, x)
      minY = min(minY, y)
      maxX = max(maxX, x)
      maxY = max(maxY, y)
    }
  }

  guard maxX >= minX, maxY >= minY else {
    return image
  }

  minX = max(0, minX - padding)
  minY = max(0, minY - padding)
  maxX = min(width - 1, maxX + padding)
  maxY = min(height - 1, maxY + padding)

  let cropRect = CGRect(
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  )

  return image.cropping(to: cropRect) ?? image
}

func createPngData(from image: CGImage) -> Data? {
  let mutableData = NSMutableData()
  guard
    let destination = CGImageDestinationCreateWithData(
      mutableData,
      UTType.png.identifier as CFString,
      1,
      nil,
    )
  else {
    return nil
  }

  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else {
    return nil
  }

  return mutableData as Data
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
  throw IconGenerationError.invalidArguments
}

let sourcePath = arguments[1]
let outputPath = arguments[2]

guard
  let sourceImage = NSImage(contentsOfFile: sourcePath),
  let sourceRepresentation = sourceImage.bestRepresentation(
    for: CGRect(origin: .zero, size: sourceImage.size),
    context: nil,
    hints: nil,
  ),
  let sourceCgImage = sourceRepresentation.cgImage(
    forProposedRect: nil,
    context: nil,
    hints: nil,
  )
else {
  throw IconGenerationError.failedToLoadSource(sourcePath)
}

let trimmedSourceImage = trimmedImage(sourceCgImage)

guard
  let context = CGContext(
    data: nil,
    width: Int(canvasSize.width),
    height: Int(canvasSize.height),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.displayP3)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue,
  )
else {
  throw IconGenerationError.failedToCreateContext
}

context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)
context.interpolationQuality = .high

let fullRect = CGRect(origin: .zero, size: canvasSize)
context.clear(fullRect)

context.saveGState()
context.setShadow(offset: CGSize(width: 0, height: -18), blur: 54, color: makeColor(red: 0, green: 0, blue: 0, alpha: 0.34).cgColor)
let tilePath = CGPath(
  roundedRect: tileRect,
  cornerWidth: tileCornerRadius,
  cornerHeight: tileCornerRadius,
  transform: nil,
)
context.addPath(tilePath)
context.setFillColor(makeColor(red: 8, green: 12, blue: 11).cgColor)
context.fillPath()
context.restoreGState()

context.saveGState()
context.addPath(tilePath)
context.clip()

let tileColors = [
  makeColor(red: 9, green: 16, blue: 14).cgColor,
  makeColor(red: 4, green: 8, blue: 7).cgColor,
] as CFArray
let tileGradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.displayP3), colors: tileColors, locations: [0, 1])!
context.drawLinearGradient(
  tileGradient,
  start: CGPoint(x: tileRect.minX, y: tileRect.maxY),
  end: CGPoint(x: tileRect.maxX, y: tileRect.minY),
  options: [],
)

let glowColors = [
  makeColor(red: 88, green: 255, blue: 220, alpha: 0.20).cgColor,
  makeColor(red: 88, green: 255, blue: 220, alpha: 0.05).cgColor,
  makeColor(red: 88, green: 255, blue: 220, alpha: 0).cgColor,
] as CFArray
let glowGradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.displayP3), colors: glowColors, locations: [0, 0.46, 1])!
let glowCenter = CGPoint(x: tileRect.midX, y: tileRect.midY + 24)
context.drawRadialGradient(
  glowGradient,
  startCenter: glowCenter,
  startRadius: 0,
  endCenter: glowCenter,
  endRadius: 470,
  options: [.drawsAfterEndLocation],
)

let highlightRect = CGRect(x: tileRect.minX + 22, y: tileRect.midY + 60, width: tileRect.width - 44, height: 264)
let highlightColors = [
  makeColor(red: 255, green: 255, blue: 255, alpha: 0.17).cgColor,
  makeColor(red: 255, green: 255, blue: 255, alpha: 0).cgColor,
] as CFArray
let highlightGradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.displayP3), colors: highlightColors, locations: [0, 1])!
context.drawRadialGradient(
  highlightGradient,
  startCenter: CGPoint(x: highlightRect.midX, y: highlightRect.maxY),
  startRadius: 16,
  endCenter: CGPoint(x: highlightRect.midX, y: highlightRect.maxY),
  endRadius: 520,
  options: [.drawsAfterEndLocation],
)

context.restoreGState()

context.saveGState()
context.addPath(tilePath)
context.setStrokeColor(makeColor(red: 255, green: 255, blue: 255, alpha: 0.07).cgColor)
context.setLineWidth(4)
context.strokePath()
context.restoreGState()

let fittedLogoRect = fitRect(
  aspectRatio: CGSize(width: trimmedSourceImage.width, height: trimmedSourceImage.height),
  inside: artworkBounds,
)

context.saveGState()
let artworkPath = CGPath(
  roundedRect: artworkBounds,
  cornerWidth: artworkCornerRadius,
  cornerHeight: artworkCornerRadius,
  transform: nil,
)
context.addPath(artworkPath)
context.clip()
context.setShadow(
  offset: CGSize(width: 0, height: -6),
  blur: 28,
  color: makeColor(red: 88, green: 255, blue: 220, alpha: 0.18).cgColor,
)
context.draw(trimmedSourceImage, in: fittedLogoRect)
context.restoreGState()

context.saveGState()
context.addPath(artworkPath)
context.setStrokeColor(makeColor(red: 255, green: 255, blue: 255, alpha: 0.06).cgColor)
context.setLineWidth(3)
context.strokePath()
context.restoreGState()

guard let finalImage = context.makeImage(), let pngData = createPngData(from: finalImage) else {
  throw IconGenerationError.failedToWriteOutput(outputPath)
}

let outputUrl = URL(fileURLWithPath: outputPath)
try FileManager.default.createDirectory(
  at: outputUrl.deletingLastPathComponent(),
  withIntermediateDirectories: true,
)
do {
  try pngData.write(to: outputUrl)
} catch {
  throw IconGenerationError.failedToWriteOutput(outputPath)
}
