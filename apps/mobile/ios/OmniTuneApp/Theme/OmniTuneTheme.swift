#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI
import UIKit

public enum OmniTuneTheme {
    /// Harmonized OmniTune electric cobalt-sapphire accent (`#1E63FF`) paired with Midnight Navy (`#070D1B`).
    public static let accent = Color(red: 0.118, green: 0.388, blue: 1.000)
    public static let accentHover = Color(red: 0.231, green: 0.482, blue: 1.000)
    public static let accentDeep = Color(red: 0.039, green: 0.220, blue: 0.600)
    public static let cyanGlow = Color(red: 0.220, green: 0.741, blue: 0.973)

    public static let darkBg = Color(red: 0.027, green: 0.051, blue: 0.106)
    public static let darkSurface = Color(red: 0.051, green: 0.086, blue: 0.169)
    public static let darkElevated = Color(red: 0.075, green: 0.125, blue: 0.235)
    public static let darkOverlay = Color(red: 0.086, green: 0.145, blue: 0.271)

    public static let sonicGradient = LinearGradient(
        colors: [accentDeep, accent, cyanGlow],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    public static let artworkRadius: CGFloat = 8
    public static let cardRadius: CGFloat = 10
}

public extension Color {
    init(hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255.0
        let g = Double((int >> 8) & 0xFF) / 255.0
        let b = Double(int & 0xFF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}

/// Vector OmniTune concentric sonic-loop brand mark matching the app icon across all platforms.
public struct OmniTuneLogoView: View {
    public var size: CGFloat = 28

    public init(size: CGFloat = 28) {
        self.size = size
    }

    public var body: some View {
        Canvas { context, canvasSize in
            let w = canvasSize.width
            let h = canvasSize.height
            let scale = min(w, h) / 100.0
            let bgRect = CGRect(x: 0, y: 0, width: w, height: h)
            let bgPath = Path(roundedRect: bgRect, cornerRadius: 22 * scale)
            context.fill(bgPath, with: .color(OmniTuneTheme.darkBg))
            context.stroke(bgPath, with: .color(OmniTuneTheme.accent.opacity(0.38)), lineWidth: 2.5 * scale)

            let center = CGPoint(x: 46 * scale, y: 53 * scale)
            let r1 = 15.6 * scale
            let r2 = 29.2 * scale
            let r3 = 39.0 * scale
            let style = StrokeStyle(lineWidth: 6.4 * scale, lineCap: .butt, lineJoin: .round)

            var mainLoop = Path()
            mainLoop.addArc(center: center, radius: r1, startAngle: .degrees(112), endAngle: .degrees(90), clockwise: false)
            mainLoop.addLine(to: CGPoint(x: center.x, y: center.y + r2))
            mainLoop.addArc(center: center, radius: r2, startAngle: .degrees(90), endAngle: .degrees(298), clockwise: false)
            context.stroke(mainLoop, with: .color(OmniTuneTheme.accent), style: style)

            var midArc = Path()
            midArc.addArc(center: center, radius: r2, startAngle: .degrees(308), endAngle: .degrees(76), clockwise: false)
            context.stroke(midArc, with: .color(OmniTuneTheme.accent), style: style)

            var outerWave = Path()
            outerWave.addArc(center: center, radius: r3, startAngle: .degrees(300), endAngle: .degrees(360), clockwise: false)
            context.stroke(outerWave, with: .color(OmniTuneTheme.accentHover), style: style)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

@MainActor
public enum Haptics {
    public static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    public static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    public static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

public struct ArtworkView: View {
    public let url: String?
    public let size: CGFloat
    public var pixelSize: Int = 300
    public var cornerRadius: CGFloat = OmniTuneTheme.artworkRadius
    public var isCircle: Bool = false

    public init(url: String?, size: CGFloat, pixelSize: Int = 300, cornerRadius: CGFloat = OmniTuneTheme.artworkRadius, isCircle: Bool = false) {
        self.url = url
        self.size = size
        self.pixelSize = pixelSize
        self.cornerRadius = cornerRadius
        self.isCircle = isCircle
    }

    public var body: some View {
        AsyncImage(url: artworkAt(url, size: pixelSize)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            default:
                ZStack {
                    OmniTuneTheme.darkElevated.opacity(0.65)
                    Image(systemName: "music.note")
                        .font(.system(size: max(14, size * 0.3)))
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(isCircle ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)))
    }
}

public struct MosaicArtworkView: View {
    public let urls: [String]
    public let size: CGFloat
    public var cornerRadius: CGFloat = OmniTuneTheme.artworkRadius

    public init(urls: [String], size: CGFloat, cornerRadius: CGFloat = OmniTuneTheme.artworkRadius) {
        self.urls = urls
        self.size = size
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        let clean = Array(urls.filter { !$0.isEmpty }.prefix(4))
        if clean.count < 4 {
            ArtworkView(url: clean.first, size: size, cornerRadius: cornerRadius)
        } else {
            let half = size / 2
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    ArtworkView(url: clean[0], size: half, pixelSize: 200, cornerRadius: 0)
                    ArtworkView(url: clean[1], size: half, pixelSize: 200, cornerRadius: 0)
                }
                HStack(spacing: 0) {
                    ArtworkView(url: clean[2], size: half, pixelSize: 200, cornerRadius: 0)
                    ArtworkView(url: clean[3], size: half, pixelSize: 200, cornerRadius: 0)
                }
            }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        }
    }
}

public struct ArtistAvatarView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    let artistId: String
    let initialUrl: String?
    let size: CGFloat
    @State private var resolvedUrl: String?

    public var body: some View {
        ArtworkView(url: resolvedUrl ?? initialUrl, size: size, isCircle: true)
            .task(id: artistId) {
                guard initialUrl == nil && resolvedUrl == nil else { return }
                resolvedUrl = await env.catalog.getArtistArtwork(id: artistId)
            }
    }
}

public struct FilterChip: View {
    let title: String
    let active: Bool
    let action: () -> Void

    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(active ? OmniTuneTheme.accent : OmniTuneTheme.darkElevated.opacity(0.85))
                .foregroundStyle(active ? .white : .primary)
                .overlay(
                    Capsule()
                        .strokeBorder(active ? Color.clear : OmniTuneTheme.accent.opacity(0.22), lineWidth: 1)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
