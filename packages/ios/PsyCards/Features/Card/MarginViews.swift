import SwiftUI

/// Log-scale position (1× → 0%, 1000× → 100%) shared by the meter and chart.
private func logPosition(_ ratio: Double) -> Double {
    min(1, max(0, log10(ratio) / 3))
}

/// Toxicity margin meter (web `.psy-margin`): lethal ÷ usual dose on a log
/// track from red to green, with alcohol as a familiar reference point.
struct MarginMeterView: View {
    @Environment(DataPackStore.self) private var store
    let margin: ToxicityMargin?
    let danger: Bool
    /// Alcohol's ratio, shown as a reference unless this card is alcohol.
    let alcoholRatio: Double?
    var face: Color = PsyCardsColors.ink2

    @ScaledMetric(relativeTo: .caption2) private var trackHeight: CGFloat = 8
    @ScaledMetric(relativeTo: .caption2) private var bubbleFont: CGFloat = 12

    var body: some View {
        VStack(spacing: 5) {
            GeometryReader { geo in
                let width = geo.size.width
                ZStack(alignment: .topLeading) {
                    track
                        .frame(height: trackHeight)
                        .offset(y: margin == nil ? 0 : bubbleHeight + 6)
                    if let alcoholRatio {
                        Circle()
                            .fill(PsyCardsColors.fg.opacity(0.88))
                            .overlay(PhIcon("wine-fill", size: trackHeight * 1.15).foregroundStyle(PsyCardsColors.ink))
                            .frame(width: trackHeight * 2.1, height: trackHeight * 2.1)
                            .position(
                                x: width * logPosition(alcoholRatio),
                                y: (margin == nil ? 0 : bubbleHeight + 6) + trackHeight / 2
                            )
                    }
                    if let margin {
                        bubble(margin, width: width)
                    }
                }
            }
            .frame(height: (margin == nil ? 0 : bubbleHeight + 6) + trackHeight)

            scale
        }
        .accessibilityHidden(true)
    }

    private var bubbleHeight: CGFloat { ceil(bubbleFont * 1.7) }

    @ViewBuilder
    private var track: some View {
        if margin == nil {
            Capsule()
                .fill(.clear)
                .overlay {
                    HatchPattern(
                        color: danger ? PsyCardsColors.emergency.opacity(0.7) : PsyCardsColors.fg.opacity(0.22),
                        spacing: 7,
                        lineWidth: 3.2,
                        secondary: danger ? PsyCardsColors.emergency.opacity(0.2) : PsyCardsColors.fg.opacity(0.06)
                    )
                }
                .clipShape(Capsule())
        } else {
            Capsule()
                .fill(LinearGradient(gradient: PsyCardsColors.marginGradient, startPoint: .leading, endPoint: .trailing))
        }
    }

    private func bubble(_ margin: ToxicityMargin, width: CGFloat) -> some View {
        let fraction = logPosition(margin.ratio)
        let text = "\(margin.isLowerBound ? ">" : "")\(store.number(margin.ratio))×"
        let estimate = margin.isEstimate
        return ZStack(alignment: .topLeading) {
            // The bubble slides so it never leaves the track; its pointer
            // stays exactly on the value (web translateX(-x)).
            BubbleLabel(text: text, estimate: estimate, fontSize: bubbleFont, face: face)
                .alignmentGuide(.leading) { dimensions in dimensions.width * fraction - width * fraction }
                .frame(width: width, alignment: .leading)
            Triangle()
                .fill(PsyCardsColors.fg)
                .frame(width: 10, height: 6)
                .position(x: width * fraction, y: bubbleHeight + 2)
        }
        .frame(width: width, height: bubbleHeight + 6, alignment: .topLeading)
    }

    private var scale: some View {
        GeometryReader { geo in
            let width = geo.size.width
            ZStack {
                ForEach(Array(["1×", "10×", "100×", "1000×"].enumerated()), id: \.offset) { index, label in
                    Text(label)
                        .font(.system(size: 10, weight: .medium).monospacedDigit())
                        .foregroundStyle(PsyCardsColors.fgMute)
                        .fixedSize()
                        .position(x: tickX(index: index, width: width, label: label), y: 6)
                }
            }
        }
        .frame(height: 12)
    }

    private func tickX(index: Int, width: CGFloat, label: String) -> CGFloat {
        let half = CGFloat(label.count) * 3
        switch index {
        case 0: return half
        case 3: return width - half
        default: return width * CGFloat(index) / 3
        }
    }
}

private struct BubbleLabel: View {
    let text: String
    let estimate: Bool
    let fontSize: CGFloat
    let face: Color

    var body: some View {
        Text(text)
            .font(.system(size: fontSize, weight: .heavy).monospacedDigit())
            .foregroundStyle(estimate ? PsyCardsColors.fg : PsyCardsColors.ink)
            .padding(.horizontal, 8)
            .frame(height: ceil(fontSize * 1.7))
            .background {
                if estimate {
                    Capsule().fill(face)
                        .overlay(Capsule().strokeBorder(PsyCardsColors.fg, style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
                } else {
                    Capsule().fill(PsyCardsColors.fg)
                }
            }
            .shadow(color: .black.opacity(0.35), radius: 5, y: 2)
            .fixedSize()
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Gable (2004) safety ratios — lethal dose ÷ usual dose — on a log scale
/// (web `card/MarginChart.astro`). Extrapolated values are dashed.
struct GableChartView: View {
    @Environment(DataPackStore.self) private var store
    let rows: [GableRow]
    let current: String

    @ScaledMetric(relativeTo: .footnote) private var nameWidth: CGFloat = 112

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(rows.sorted { $0.ratio < $1.ratio }) { row in
                let isCurrent = row.key == current
                HStack(spacing: 10) {
                    Text(row.label)
                        .font(.footnote.weight(isCurrent ? .heavy : .medium))
                        .foregroundStyle(isCurrent ? PsyCardsColors.fg : PsyCardsColors.inkSoft)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(width: nameWidth, alignment: .leading)
                    GeometryReader { geo in
                        let fraction = max(0.06, log10(row.ratio) / 3)
                        let hue = PsyCardsColors.marginHue(row.ratio)
                        bar(row: row, hue: hue)
                            .frame(width: max(geo.size.width * fraction, 44), height: geo.size.height)
                    }
                    .frame(height: 22)
                }
                .padding(.vertical, 3)
                .padding(.horizontal, 6)
                .background {
                    if isCurrent {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .fill(PsyCardsColors.fg.opacity(0.1))
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.label): \(row.isLowerBound ? ">" : "")\(store.number(row.ratio))×")
            }
        }
    }

    @ViewBuilder
    private func bar(row: GableRow, hue: Double) -> some View {
        let shape = RoundedRectangle(cornerRadius: 5, style: .continuous)
        let label = Text("\(row.isLowerBound ? ">" : "")\(store.number(row.ratio))×")
            .font(.caption2.weight(.heavy).monospacedDigit())
            .padding(.horizontal, 6)
        if row.isEstimate {
            shape
                .fill(Color(hue: hue, saturation: 0.72, lightness: 0.5, opacity: 0.35))
                .overlay(shape.strokeBorder(Color(hue: hue, saturation: 0.72, lightness: 0.58), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])))
                .overlay(alignment: .trailing) { label.foregroundStyle(PsyCardsColors.fg) }
        } else {
            shape
                .fill(Color(hue: hue, saturation: 0.72, lightness: 0.5))
                .overlay(alignment: .trailing) { label.foregroundStyle(PsyCardsColors.ink) }
        }
    }
}
