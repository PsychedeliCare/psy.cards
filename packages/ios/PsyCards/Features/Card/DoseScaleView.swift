import SwiftUI
import UIKit

/// Linear dose chart (web `card/DoseScale.astro`): coloured ranges sitting on
/// a continuous line with a dotted bracket under each range, level names
/// above and boundary amounts below, placed without collisions against the
/// real text widths.
struct DoseScaleView: View {
    @Environment(DataPackStore.self) private var store
    let chart: DoseChart
    var face: Color = PsyCardsColors.ink2
    /// Converts mg/kg ticks to mg for this body weight (DXM).
    var weightKg: Double? = nil
    /// Personal upper limit, in the chart's unit (MDMA).
    var markerValue: Double? = nil

    @ScaledMetric(relativeTo: .caption2) private var fontSize: CGFloat = 11.5
    @ScaledMetric(relativeTo: .caption2) private var trackHeight: CGFloat = 9

    private var segments: [DoseSegment] { chart.segments ?? [] }
    private var scaleMax: Double { chart.scaleMax ?? 1 }
    private var lineHeight: CGFloat { ceil(fontSize * 1.45) }
    /// Dotted bracket under each range (start → end amount).
    private let bracketHeight: CGFloat = 5
    private let bracketGap: CGFloat = 2

    var body: some View {
        GeometryReader { geo in
            let width = max(geo.size.width, 1)
            VStack(spacing: 0) {
                labelRow(width: width)
                    .frame(height: lineHeight)
                track(width: width)
                    .frame(height: trackHeight + bracketGap + bracketHeight, alignment: .top)
                    .padding(.top, 4)
                    .padding(.bottom, 3)
                tickRow(width: width)
                    .frame(height: lineHeight)
            }
        }
        .frame(height: lineHeight * 2 + trackHeight + bracketGap + bracketHeight + 7)
        .accessibilityElement()
        .accessibilityLabel(Text(accessibilityText))
    }

    private var accessibilityText: String {
        let labels = chart.labels ?? []
        return zip(labels, segments).map { "\($0.text): \($1.amount)" }.joined(separator: ", ")
    }

    // MARK: Labels

    private func labelRow(width: CGFloat) -> some View {
        let labels = chart.labels ?? []
        let font = UIFont.systemFont(ofSize: fontSize, weight: .heavy)
        let placed = LabelLayout.spread(
            labels.map {
                LabelLayout.Box(
                    pos: $0.pos,
                    width: Double((LabelLayout.textWidth($0.text.lowercased(), font: font) + 3) / width * 100),
                    priority: $0.priority
                )
            },
            gap: Double(6 / width * 100)
        )
        return ZStack(alignment: .topLeading) {
            ForEach(placed, id: \.index) { item in
                let label = labels[item.index]
                Text(label.text.lowercased())
                    .font(.system(size: fontSize, weight: .heavy))
                    .foregroundStyle(Color(hexString: label.color))
                    .fixedSize()
                    .position(x: width * item.x / 100, y: lineHeight / 2)
            }
        }
        .frame(width: width, alignment: .topLeading)
        .accessibilityHidden(true)
    }

    // MARK: Ticks

    private func tickTexts() -> [String] {
        (chart.ticks ?? []).map { tick in
            if chart.isPerKg, let weightKg {
                return "\(store.number(PersonalDoseMath.perKgToMg(tick.value, weightKg: weightKg)))\(tick.suffix)"
            }
            return tick.text
        }
    }

    private func tickRow(width: CGFloat) -> some View {
        let ticks = chart.ticks ?? []
        let texts = tickTexts()
        let font = UIFont.monospacedDigitSystemFont(ofSize: fontSize, weight: .semibold)
        let placed = LabelLayout.spread(
            ticks.enumerated().map { index, tick in
                LabelLayout.Box(
                    pos: tick.pos,
                    width: Double((LabelLayout.textWidth(texts[index], font: font) + 2) / width * 100),
                    priority: tick.priority
                )
            },
            gap: Double(7 / width * 100)
        )
        return ZStack(alignment: .topLeading) {
            ForEach(placed, id: \.index) { item in
                Text(texts[item.index])
                    .font(.system(size: fontSize, weight: .semibold).monospacedDigit())
                    .foregroundStyle(PsyCardsColors.inkSoft)
                    .fixedSize()
                    .position(x: width * item.x / 100, y: lineHeight / 2)
            }
        }
        .frame(width: width, alignment: .topLeading)
        .accessibilityHidden(true)
    }

    // MARK: Track

    private func track(width: CGFloat) -> some View {
        let height = trackHeight
        return ZStack(alignment: .topLeading) {
            Canvas { context, size in
                let h = height
                // The continuous line the ranges sit on.
                let lineH = h * 0.45
                context.fill(
                    Path(roundedRect: CGRect(x: -3, y: (h - lineH) / 2, width: size.width + 6, height: lineH), cornerRadius: lineH / 2),
                    with: .color(PsyCardsColors.fg.opacity(0.11))
                )
                // Dotted brackets spanning each range.
                for segment in segments where !segment.isPoint {
                    let color = Color(hexString: segment.color)
                    let x0 = size.width * segment.left / 100
                    let x1 = x0 + max(size.width * segment.width / 100, h)
                    let top = h + bracketGap
                    var bracket = Path()
                    bracket.move(to: CGPoint(x: x0 + 0.5, y: top))
                    bracket.addLine(to: CGPoint(x: x0 + 0.5, y: top + bracketHeight))
                    bracket.addLine(to: CGPoint(x: segment.openEnd ? x1 - h : x1 - 0.5, y: top + bracketHeight))
                    if !segment.openEnd {
                        bracket.addLine(to: CGPoint(x: x1 - 0.5, y: top))
                    }
                    context.stroke(
                        bracket,
                        with: .color(color.opacity(0.6)),
                        style: StrokeStyle(lineWidth: 1, dash: [1.5, 1.8])
                    )
                }
                let ring = max(1.5, h * 0.2)
                for segment in segments {
                    let color = Color(hexString: segment.color)
                    let x = size.width * segment.left / 100
                    if segment.isPoint {
                        let r = h * 0.62
                        let dot = CGRect(x: x - r, y: h / 2 - r, width: r * 2, height: r * 2)
                        context.fill(Path(ellipseIn: dot.insetBy(dx: -ring, dy: -ring)), with: .color(face))
                        context.fill(Path(ellipseIn: dot), with: .color(color))
                        continue
                    }
                    let w = max(size.width * segment.width / 100, h)
                    let rect = CGRect(x: x, y: 0, width: w, height: h)
                    if segment.openEnd {
                        let shape = Path(
                            roundedRect: rect,
                            cornerRadii: RectangleCornerRadii(topLeading: h / 2, bottomLeading: h / 2)
                        )
                        var layer = context
                        layer.clip(to: shape)
                        // Dashes fading out: the range has no upper bound.
                        var dash = rect.minX
                        let period = h * 0.95
                        while dash < rect.maxX {
                            layer.fill(Path(CGRect(x: dash, y: 0, width: period * 0.55, height: h)), with: .color(color))
                            dash += period
                        }
                        layer.fill(
                            shape,
                            with: .linearGradient(
                                Gradient(stops: [
                                    .init(color: color, location: 0),
                                    .init(color: color, location: 0.45),
                                    .init(color: color.opacity(0), location: 1),
                                ]),
                                startPoint: CGPoint(x: rect.minX, y: 0),
                                endPoint: CGPoint(x: rect.maxX, y: 0)
                            )
                        )
                    } else {
                        context.fill(
                            Path(roundedRect: rect.insetBy(dx: -ring, dy: -ring), cornerRadius: h / 2 + ring),
                            with: .color(face)
                        )
                        context.fill(Path(roundedRect: rect, cornerRadius: h / 2), with: .color(color))
                    }
                }
            }
            if let markerValue {
                let fraction = min(1, markerValue / scaleMax)
                Circle()
                    .fill(face)
                    .overlay(Circle().strokeBorder(PsyCardsColors.fg, lineWidth: height * 0.33))
                    .frame(width: height * 1.7, height: height * 1.7)
                    .shadow(color: .black.opacity(0.55), radius: 3, y: 1)
                    .position(x: width * fraction, y: height / 2)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .frame(width: width, height: height + bracketGap + bracketHeight, alignment: .topLeading)
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: markerValue)
    }
}

/// Unchartable doses as a compact two-column list (web `.psy-dose-list`).
struct DoseListView: View {
    let rows: [DoseRow]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 14, alignment: .leading)], alignment: .leading, spacing: 4) {
            ForEach(rows) { row in
                HStack {
                    Text(row.level.lowercased())
                        .foregroundStyle(PsyCardsColors.fgMute)
                    Spacer(minLength: 6)
                    Text(row.amount)
                        .fontWeight(.bold)
                        .foregroundStyle(PsyCardsColors.fg)
                }
                .font(.caption)
            }
        }
    }
}

/// Route name with its Phosphor icon and the unit chip (web `.psy-route`).
struct RouteLabel: View {
    let chart: DoseChart
    var unitOverride: String? = nil

    var body: some View {
        HStack(spacing: 5) {
            PhIcon(chart.routeIcon, size: 14)
                .foregroundStyle(PsyCardsColors.fgMute)
            Text(chart.routeLabel.capitalized)
                .font(.caption.weight(.bold))
                .foregroundStyle(PsyCardsColors.fg)
                .lineLimit(1)
            if chart.chartable, let unit = unitOverride ?? chart.unit {
                Text(unit)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(PsyCardsColors.fg.opacity(0.08), in: .rect(cornerRadius: 6, style: .continuous))
                    .contentTransition(.numericText())
            }
        }
        .fixedSize()
    }
}
