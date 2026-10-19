import SwiftUI
import UIKit

/// A Phosphor icon generated from the web's icon set (`ph-<name>` assets),
/// so card iconography matches the web and print cards exactly.
struct PhIcon: View {
    let name: String
    var size: CGFloat = 16

    init(_ name: String, size: CGFloat = 16) {
        self.name = name
        self.size = size
    }

    var body: some View {
        Image("ph-\(name)")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// Phosphor duotone combo-status icon (`status-<name>` assets).
struct StatusIcon: View {
    let name: String
    var size: CGFloat = 16

    var body: some View {
        Image("status-\(name)")
            .renderingMode(.template)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

// MARK: - Overlap-free label placement (web lib/label-layout.ts)

enum LabelLayout {
    struct Box {
        /// Preferred centre, in % of the axis.
        var pos: Double
        /// Width, in % of the axis.
        var width: Double
        /// Labels with the lowest priority are dropped first.
        var priority: Int = 0
    }

    struct Placed: Equatable {
        var index: Int
        var x: Double
    }

    /// Places labels along a 0–100% axis without overlaps, keeping each one
    /// as close as possible to its anchor.
    static func spread(_ items: [Box], gap: Double = 1.5, iterations: Int = 60) -> [Placed] {
        var kept = items.enumerated()
            .map { (index: $0.offset, box: $0.element) }
            .sorted { $0.box.pos < $1.box.pos }
        func total() -> Double {
            kept.reduce(0) { $0 + $1.box.width } + gap * Double(max(0, kept.count - 1))
        }
        while kept.count > 1, total() > 100 {
            guard let drop = kept.indices.min(by: { kept[$0].box.priority < kept[$1].box.priority }) else { break }
            kept.remove(at: drop)
        }

        func clamp(_ x: Double, _ width: Double) -> Double {
            min(100 - width / 2, max(width / 2, x))
        }
        var xs = kept.map { clamp($0.box.pos, $0.box.width) }
        for _ in 0..<iterations {
            var moved = false
            for i in kept.indices.dropFirst() {
                let minX = xs[i - 1] + (kept[i - 1].box.width + kept[i].box.width) / 2 + gap
                let overlap = minX - xs[i]
                if overlap > 0.01 {
                    xs[i - 1] -= overlap / 2
                    xs[i] += overlap / 2
                    moved = true
                }
            }
            for i in kept.indices { xs[i] = clamp(xs[i], kept[i].box.width) }
            if !moved { break }
        }
        return kept.indices.map { Placed(index: kept[$0].index, x: xs[$0]) }
    }

    /// Rendered width of a single line of text.
    static func textWidth(_ text: String, font: UIFont) -> CGFloat {
        ceil((text as NSString).size(withAttributes: [.font: font]).width)
    }
}

// MARK: - Bento tiles

/// A card tile (web `.psy-tile`): soft translucent well with a hairline edge.
struct CardTile<Content: View>: View {
    var tint: Color? = nil
    var edge: Color? = nil
    /// Absorbs the card's spare height (web `flex-grow: 1`).
    var grows: Bool = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            content
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 11)
        .frame(maxWidth: .infinity, maxHeight: grows ? .infinity : nil, alignment: .topLeading)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(tint ?? PsyCardsColors.tile)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(edge ?? PsyCardsColors.tileEdge, lineWidth: 1)
        }
    }
}

/// Uppercase tile heading with a hue-tinted Phosphor icon (web `.psy-tile h3`).
struct TileHeading: View {
    let icon: String
    let title: String
    var iconColor: Color = PsyCardsColors.fgMute
    var textColor: Color = PsyCardsColors.fgMute
    @ScaledMetric(relativeTo: .caption2) private var iconSize: CGFloat = 15

    var body: some View {
        HStack(spacing: 6) {
            PhIcon(icon, size: iconSize)
                .foregroundStyle(iconColor)
            Text(title)
                .font(.caption2.weight(.heavy))
                .tracking(1.1)
                .textCase(.uppercase)
                .foregroundStyle(textColor)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .allowsTightening(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A row of tiles sharing the width by weight (web `flex: 1.5` / `flex: 1`)
/// and the height of the tallest one.
struct TileRow: Layout {
    var weights: [CGFloat]
    var spacing: CGFloat = 8

    private func widths(total: CGFloat, count: Int) -> [CGFloat] {
        let weights = (0..<count).map { $0 < self.weights.count ? self.weights[$0] : 1 }
        let sum = weights.reduce(0, +)
        let available = max(0, total - spacing * CGFloat(max(0, count - 1)))
        return weights.map { available * $0 / sum }
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 360
        let columns = widths(total: width, count: subviews.count)
        let height = zip(subviews, columns)
            .map { $0.sizeThatFits(ProposedViewSize(width: $1, height: nil)).height }
            .max() ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        for (subview, width) in zip(subviews, widths(total: bounds.width, count: subviews.count)) {
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }
}

/// Small pill button inside tiles (web `.psy-chip-btn`).
struct TileChipButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.bold))
            .foregroundStyle(PsyCardsColors.fg)
            .padding(.horizontal, 10)
            .frame(minHeight: 30)
            .background(
                Capsule().fill(PsyCardsColors.fg.opacity(configuration.isPressed ? 0.16 : 0.08))
            )
            .overlay(Capsule().strokeBorder(PsyCardsColors.tileEdge, lineWidth: 1))
            .contentShape(Capsule())
            .animation(.easeOut(duration: 0.14), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == TileChipButtonStyle {
    static var tileChip: TileChipButtonStyle { TileChipButtonStyle() }
}

/// Simple wrapping layout for chips and pills.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat? = nil

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + (lineSpacing ?? spacing)
                rowHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + (lineSpacing ?? spacing)
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Diagonal hatching (web `repeating-linear-gradient(135deg, …)`).
struct HatchPattern: View {
    var color: Color
    var spacing: CGFloat = 8
    var lineWidth: CGFloat = 1
    var secondary: Color? = nil

    var body: some View {
        Canvas { context, size in
            if let secondary {
                context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(secondary))
            }
            var path = Path()
            var x = -size.height
            while x < size.width + size.height {
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: CGPoint(x: x + size.height, y: 0))
                x += spacing
            }
            context.stroke(path, with: .color(color), lineWidth: lineWidth)
        }
        .accessibilityHidden(true)
    }
}
