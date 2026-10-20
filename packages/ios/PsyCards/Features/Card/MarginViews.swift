import SwiftUI

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
