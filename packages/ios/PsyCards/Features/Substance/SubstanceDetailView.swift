import Charts
import SwiftUI

/// A substance's page: the two-sided card, then the details beneath it
/// (web `SubstanceCard.astro`).
struct SubstanceDetailView: View {
    @Environment(DataPackStore.self) private var store
    let substance: Substance

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                SubstanceCardContent(substance: substance, scrollProxy: proxy)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                    .frame(maxWidth: 1100)
                    .frame(maxWidth: .infinity)
            }
        }
        .background {
            PsyCardsBackground(accent: PsyCardsColors.group(substance.group))
        }
        .navigationTitle(substance.prettyName)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Card + details, without its own scroll view so the wheel can host it too.
struct SubstanceCardContent: View {
    @Environment(DataPackStore.self) private var store
    let substance: Substance
    var scrollProxy: ScrollViewProxy?

    @State private var selectedPair: ComboPair?

    static let combosAnchor = "substance-combos"

    var body: some View {
        if let card = store.card(key: substance.key) {
            VStack(spacing: 28) {
                SubstanceCardDeck(
                    card: card,
                    moleculeAsset: card.details.hasStructure ? substance.molecule?.assetName : nil,
                    onSelectCombo: { selectedPair = store.pair(a: substance.key, b: $0) },
                    onShowAllCombos: {
                        withAnimation(.smooth) {
                            scrollProxy?.scrollTo(Self.combosAnchor, anchor: .top)
                        }
                    }
                )
                .frame(maxWidth: 1040)
                .id(card.key)

                SubstanceDetailsSection(substance: substance, card: card) { partner in
                    selectedPair = store.pair(a: substance.key, b: partner)
                }
                .frame(maxWidth: 640)
            }
            .frame(maxWidth: .infinity)
            .sheet(item: $selectedPair) { pair in
                ComboPairSheet(pair: pair)
                    .psyCardsSheetPresentation(detents: [.medium, .large])
            }
        } else {
            ContentUnavailableView(substance.prettyName, systemImage: "rectangle.on.rectangle.slash")
        }
    }
}

// MARK: - Details

struct SubstanceDetailsSection: View {
    @Environment(DataPackStore.self) private var store
    @Environment(BodyProfileStore.self) private var profile
    let substance: Substance
    let card: SubstanceCardData
    var showsTitle = true
    let onSelectPartner: (String) -> Void

    @State private var showDoseTable = false
    @State private var showPwEffects = false

    private var details: CardDetails { card.details }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showsTitle {
                Text(store.t("card.details", ["name": card.displayName]))
                    .font(.title2.weight(.heavy))
                    .foregroundStyle(PsyCardsColors.fg)
                    .padding(.bottom, 12)
                    .accessibilityAddTraits(.isHeader)
            }

            if let summary = details.summary {
                Text(summary)
                    .font(.body)
                    .foregroundStyle(PsyCardsColors.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 8)
            }
            if details.isClassFallback {
                Text(store.t("substanceCard.classFallback"))
                    .font(.footnote)
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .padding(.bottom, 8)
            }

            if card.aliases.count > 4 {
                section(store.t("substanceCard.alsoKnownAs")) {
                    FlowLayout(spacing: 6) {
                        ForEach(card.aliases, id: \.self) { alias in
                            Pill(text: alias)
                        }
                    }
                }
            }

            if card.timing.onset != nil || card.timing.duration != nil {
                section(store.t("substanceCard.timing")) {
                    TimingChartView(
                        onset: card.timing.onset?.asTimingValue,
                        duration: card.timing.duration?.asTimingValue,
                        tint: PsyCardsColors.group(card.group)
                    )
                    .accessibilityLabel(store.t("substanceCard.effectTimeline", ["name": card.displayName]))
                }
            }

            if !details.doseCharts.isEmpty {
                section(store.t("substanceCard.doses"), trailing: doseToggle) {
                    VStack(alignment: .leading, spacing: 18) {
                        ForEach(details.doseCharts) { chart in
                            VStack(alignment: .leading, spacing: 8) {
                                RouteLabel(
                                    chart: chart,
                                    unitOverride: chart.isPerKg ? profile.weightKg.map { "mg · \(store.number($0)) kg" } : nil
                                )
                                if chart.chartable && !showDoseTable {
                                    DoseScaleView(chart: chart, weightKg: chart.isPerKg ? profile.weightKg : nil)
                                } else {
                                    DoseListView(rows: chart.rows ?? (chart.segments ?? []).map { DoseRow(level: store.t("doseChart.\($0.level)"), amount: $0.amount) })
                                }
                            }
                        }
                        if let note = details.doseNote {
                            Text(note)
                                .font(.footnote)
                                .foregroundStyle(PsyCardsColors.fgMute)
                        }
                    }
                    .animation(.smooth(duration: 0.25), value: showDoseTable)
                }
            }

            combos
                .id(SubstanceCardContent.combosAnchor)

            if details.warning != nil || details.avoidText != nil || details.testKits != nil {
                section(store.t("substanceCard.safety")) {
                    VStack(alignment: .leading, spacing: 12) {
                        if let warning = details.warning { definition(store.t("substanceCard.warning"), warning) }
                        if let avoid = details.avoidText { definition(store.t("substanceCard.avoidCombining"), avoid) }
                        if let kits = details.testKits { definition(store.t("substanceCard.testKits"), kits) }
                    }
                }
            }

            if !details.effects.isEmpty || !details.pwEffects.isEmpty {
                section(store.t("substanceCard.effects")) {
                    VStack(alignment: .leading, spacing: 12) {
                        FlowLayout(spacing: 6) {
                            ForEach(details.effects) { effect in
                                Pill(text: effect.text, icon: effect.icon)
                            }
                        }
                        if !details.pwEffects.isEmpty {
                            DisclosureGroup(isExpanded: $showPwEffects) {
                                FlowLayout(spacing: 6) {
                                    ForEach(details.pwEffects) { effect in
                                        if let url = URL(string: effect.url) {
                                            Link(destination: url) { Pill(text: effect.label, isLink: true) }
                                        }
                                    }
                                }
                                .padding(.top, 10)
                            } label: {
                                Text("\(store.t("substanceCard.pwEffects")) (\(details.pwEffects.count))")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(PsyCardsColors.fg)
                            }
                            .tint(PsyCardsColors.fgMute)
                            .padding(12)
                            .background(PsyCardsColors.tile, in: .rect(cornerRadius: 14, style: .continuous))
                        }
                    }
                }
            }

            if !details.links.isEmpty {
                section(store.t("substanceCard.more")) {
                    HStack(spacing: 16) {
                        if let url = details.links.experiences.flatMap(URL.init(string:)) {
                            Link(store.t("substanceCard.tripReports"), destination: url)
                        }
                        if let url = details.links.pihkal.flatMap(URL.init(string:)) {
                            Link("PiHKAL", destination: url)
                        }
                        if let url = details.links.tihkal.flatMap(URL.init(string:)) {
                            Link("TiHKAL", destination: url)
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .tint(PsyCardsColors.fg)
                }
            }

            section(store.t("card.sources")) {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(card.sources, id: \.title) { source in
                        SourceRow(source: source)
                    }
                }
            }

            if details.hasStructure {
                Text(linkLine(store.t("smilesCitation.prefix") + " ", link: store.t("smilesCitation.tool"), url: "https://github.com/reymond-group/smilesDrawer"))
                    .font(.caption)
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .tint(PsyCardsColors.fgMute)
                    .padding(.top, 18)
            }

            ContributeFooter()
                .padding(.top, 22)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var doseToggle: some View {
        Picker(store.t("doseChart.title"), selection: $showDoseTable) {
            Label(store.t("doseChart.chart"), systemImage: "chart.bar.fill").tag(false)
            Label(store.t("doseChart.table"), systemImage: "tablecells").tag(true)
        }
        .pickerStyle(.segmented)
        .labelStyle(.iconOnly)
        .frame(width: 96)
    }

    @ViewBuilder
    private var combos: some View {
        let groups = store.comboGroups(for: card.key)
        if !groups.isEmpty {
            section(store.t("substanceCard.combos")) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                        ComboStatusRow(group: group, onSelect: onSelectPartner)
                            .padding(.vertical, 10)
                            .overlay(alignment: .bottom) {
                                if index < groups.count - 1 { Divider().opacity(0.6) }
                            }
                    }
                }
            }
        }
    }

    private func definition(_ term: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(term)
                .font(.footnote.weight(.bold))
                .foregroundStyle(PsyCardsColors.fgMute)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(PsyCardsColors.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func section<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        section(title, trailing: EmptyView(), content: content)
    }

    private func section<Trailing: View, Content: View>(
        _ title: String,
        trailing: Trailing,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title)
                    .font(.footnote.weight(.heavy))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(PsyCardsColors.fg)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                trailing
            }
            content()
        }
        .padding(.vertical, 18)
        .overlay(alignment: .top) {
            Rectangle().fill(PsyCardsColors.fg.opacity(0.1)).frame(height: 1)
        }
    }
}

private struct Pill: View {
    let text: String
    var icon: String? = nil
    var isLink: Bool = false

    var body: some View {
        HStack(spacing: 5) {
            if let icon {
                PhIcon(icon, size: 13)
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundStyle(PsyCardsColors.fg)
                .underline(isLink, color: PsyCardsColors.fgMute)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(PsyCardsColors.fg.opacity(0.06), in: .capsule)
        .overlay(Capsule().strokeBorder(PsyCardsColors.tileEdge))
    }
}

struct SourceRow: View {
    let source: CardSource

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let url = source.link {
                Link(destination: url) {
                    Text(source.title)
                        .font(.subheadline.weight(.semibold))
                        .underline(color: PsyCardsColors.fg.opacity(0.35))
                        .multilineTextAlignment(.leading)
                }
                .tint(PsyCardsColors.fg)
            } else {
                Text(source.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PsyCardsColors.fg)
            }
            Text([source.author, source.publication].compactMap { $0 }.joined(separator: ", "))
                .font(.caption)
                .foregroundStyle(PsyCardsColors.fgMute)
        }
        .accessibilityElement(children: .combine)
    }
}

/// "Contribute on GitHub" (web `CardContribute.astro`).
struct ContributeFooter: View {
    @Environment(DataPackStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Link(destination: URL(string: "https://github.com/TripSit/drugs")!) {
                HStack(spacing: 8) {
                    Text(store.t("footer.contributeOn"))
                    PhIcon("github-logo-fill", size: 18)
                    Text("GitHub").fontWeight(.bold)
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(PsyCardsColors.fg)
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
            }
            .buttonStyle(.glass)
            Text(store.t("cardContribute.communityNote"))
                .font(.caption)
                .foregroundStyle(PsyCardsColors.fgMute)
            Text(linkLine(store.t("cardContribute.chartIssuePrefix"), link: store.t("cardContribute.chartIssueLink"), url: "https://github.com/raphaelsaunier/psy.cards"))
                .font(.caption)
                .foregroundStyle(PsyCardsColors.fgMute)
                .tint(PsyCardsColors.fg)
        }
    }
}

/// Plain text followed by an underlined link.
func linkLine(_ prefix: String, link: String, url: String) -> AttributedString {
    var linked = AttributedString(link)
    linked.link = URL(string: url)
    linked.underlineStyle = .single
    return AttributedString(prefix) + linked
}

// MARK: - Combos

struct ComboStatusRow: View {
    let group: ComboStatusGroup
    let onSelect: (String) -> Void

    @ScaledMetric(relativeTo: .subheadline) private var labelWidth: CGFloat = 118

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            HStack(alignment: .top, spacing: 8) {
                StatusIcon(name: group.icon, size: 15)
                    .foregroundStyle(PsyCardsColors.ink(onStatus: group.statusKey))
                    .frame(width: 26, height: 26)
                    .background(PsyCardsColors.status(group.statusKey), in: .rect(cornerRadius: 7, style: .continuous))
                Text(group.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PsyCardsColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: labelWidth, alignment: .leading)

            FlowLayout(spacing: 0, lineSpacing: 4) {
                ForEach(Array(group.partners.enumerated()), id: \.element.id) { index, partner in
                    Button {
                        onSelect(partner.key)
                    } label: {
                        let separator = Text(index < group.partners.count - 1 ? ", " : "").foregroundStyle(PsyCardsColors.fgMute)
                        Text("\(Text(partner.name).underline(color: PsyCardsColors.fg.opacity(0.35)).foregroundStyle(PsyCardsColors.fg))\(separator)")
                    }
                    .font(.subheadline)
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(partner.name), \(group.label)")
                }
            }
            .padding(.top, 3)
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Timing chart (port of packages/web/src/scripts/timing-chart.ts)

struct TimingChartView: View {
    @Environment(DataPackStore.self) private var store

    struct CurvePoint: Identifiable {
        let hour: Double
        let intensity: Double

        var id: Double { hour }
    }

    struct Marker: Identifiable {
        let hour: Double
        let intensity: Double
        let label: String?

        var id: Double { hour }
    }

    private let tint: Color
    private let points: [CurvePoint]
    private let markers: [Marker]
    private let maxHour: Double
    private let ticks: [Double]
    @State private var start = Date.now

    init(onset: TimingValue?, duration: TimingValue?, tint: Color) {
        self.tint = tint
        guard let durationRange = Self.range(from: duration) else {
            points = []
            markers = []
            maxHour = 1
            ticks = []
            return
        }
        let geometry = Self.curveGeometry(onset: Self.range(from: onset), duration: durationRange)
        points = geometry.points
        markers = geometry.markers
        maxHour = geometry.maxHour
        ticks = Self.buildTicks(maxHour: geometry.maxHour)
    }

    var body: some View {
        if !points.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                chart
                HStack {
                    Text(store.t("timingChart.startTime"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(PsyCardsColors.fgMute)
                    Spacer()
                    DatePicker(store.t("timingChart.startTime"), selection: $start, displayedComponents: .hourAndMinute)
                        .labelsHidden()
                        .environment(\.locale, store.swiftLocale)
                }
            }
        }
    }

    private var chart: some View {
        Chart {
            ForEach(points) { point in
                AreaMark(x: .value("Hours", point.hour), y: .value("Intensity", point.intensity))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(.linearGradient(colors: [tint.opacity(0.4), tint.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Hours", point.hour), y: .value("Intensity", point.intensity))
                    .interpolationMethod(.monotone)
                    .lineStyle(StrokeStyle(lineWidth: 2.4, lineCap: .round))
                    .foregroundStyle(tint)
            }
            ForEach(markers) { marker in
                RuleMark(x: .value("Hours", marker.hour))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    .foregroundStyle(PsyCardsColors.fg.opacity(0.2))
                PointMark(x: .value("Hours", marker.hour), y: .value("Intensity", marker.intensity))
                    .symbol {
                        Circle()
                            .fill(PsyCardsColors.ink)
                            .overlay(Circle().strokeBorder(PsyCardsColors.fg, lineWidth: 2))
                            .frame(width: 10, height: 10)
                    }
                    .annotation(position: marker.intensity > 0.8 ? .top : .topLeading, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) {
                        if let label = marker.label {
                            Text(store.t("timingChart.\(label)").uppercased())
                                .font(.caption2.weight(.heavy))
                                .tracking(0.6)
                                .foregroundStyle(PsyCardsColors.fg)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(PsyCardsColors.ink3, in: .capsule)
                        }
                    }
            }
        }
        .chartXScale(domain: 0...maxHour)
        .chartYScale(domain: 0...1.32)
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks(position: .top, values: ticks) { value in
                AxisValueLabel {
                    if let hour = value.as(Double.self) {
                        Text("+\(Int(hour))h")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(PsyCardsColors.fgMute)
                    }
                }
            }
            AxisMarks(position: .bottom, values: ticks) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 1, dash: [2, 4]))
                    .foregroundStyle(PsyCardsColors.fg.opacity(0.12))
                AxisValueLabel {
                    if let hour = value.as(Double.self) {
                        Text(start.addingTimeInterval(hour * 3600), format: .dateTime.hour().minute().locale(store.swiftLocale))
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(PsyCardsColors.fgMute)
                    }
                }
            }
        }
        .chartPlotStyle { plot in
            plot.background(PsyCardsColors.fg.opacity(0.03), in: .rect(cornerRadius: 8))
        }
        .frame(height: 170)
    }

    // MARK: Curve math

    struct TimingRange {
        let min: Double
        let max: Double
        var average: Double { (min + max) / 2 }
    }

    static func range(from timing: TimingValue?) -> TimingRange? {
        guard let timing, let value = timing.value?.lowercased(), !value.contains("unknown") else { return nil }
        let unit = (timing.unit ?? "").lowercased()
        let multiplier: Double = unit.contains("sec") ? 1.0 / 3600 : unit.contains("min") ? 1.0 / 60 : unit.contains("day") ? 24 : 1
        let numbers = value.matches(of: /\d+(?:\.\d+)?/).compactMap { Double($0.output) }
        guard let first = numbers.first else { return nil }
        let second = numbers.count > 1 ? numbers[1] : first
        return TimingRange(min: Swift.min(first, second) * multiplier, max: Swift.max(first, second) * multiplier)
    }

    private static func curveGeometry(onset: TimingRange?, duration: TimingRange) -> (points: [CurvePoint], markers: [Marker], maxHour: Double) {
        func clamp(_ value: Double, _ lo: Double, _ hi: Double) -> Double { Swift.min(Swift.max(value, lo), hi) }

        let durationEnd = Swift.max(duration.average, duration.max)
        // Keep the final whole-hour tick inside the plotted domain.
        let maxHour = Swift.max((durationEnd * 1.08).rounded(.up), 1)
        let onsetStart = onset?.min ?? Swift.max(durationEnd * 0.05, 0.05)
        let onsetEnd = onset?.max ?? Swift.max(durationEnd * 0.16, onsetStart)
        let onsetMid = onset?.average ?? (onsetStart + onsetEnd) / 2
        let activeWindow = Swift.max(durationEnd - onsetEnd, durationEnd * 0.35, 0.5)
        let peakHour = clamp(onsetEnd + activeWindow * 0.3, onsetEnd + 0.12, durationEnd * 0.72)
        let prePeak = clamp(onsetEnd + (peakHour - onsetEnd) * 0.5, onsetEnd, peakHour)
        let plateauEnd = clamp(peakHour + activeWindow * 0.18, peakHour, durationEnd * 0.82)
        let comedownMid = clamp(plateauEnd + (durationEnd - plateauEnd) * 0.45, plateauEnd, durationEnd)
        let tailStart = clamp(durationEnd - Swift.max(activeWindow * 0.12, 0.12), comedownMid, durationEnd)

        let raw: [CurvePoint] = [
            .init(hour: 0, intensity: 0),
            .init(hour: onsetStart, intensity: 0.04),
            .init(hour: onsetMid, intensity: 0.18),
            .init(hour: onsetEnd, intensity: 0.45),
            .init(hour: prePeak, intensity: 0.82),
            .init(hour: peakHour, intensity: 1),
            .init(hour: plateauEnd, intensity: 0.88),
            .init(hour: comedownMid, intensity: 0.32),
            .init(hour: tailStart, intensity: 0.08),
            .init(hour: durationEnd, intensity: 0),
        ]
        var points: [CurvePoint] = []
        for point in raw.sorted(by: { $0.hour < $1.hour }) {
            if let last = points.last, abs(last.hour - point.hour) < 0.01 {
                points[points.count - 1] = CurvePoint(hour: last.hour, intensity: Swift.max(last.intensity, point.intensity))
            } else {
                points.append(point)
            }
        }

        var markers: [Marker] = []
        if let onset { markers.append(Marker(hour: onset.average, intensity: 0.4, label: "onset")) }
        markers.append(Marker(hour: peakHour, intensity: 1, label: "peak"))
        markers.append(Marker(hour: durationEnd, intensity: 0.02, label: nil))
        return (points, markers, maxHour)
    }

    private static func buildTicks(maxHour: Double) -> [Double] {
        let step: Double = switch maxHour {
        case ...4: 1
        case ...8: 2
        case ...18: 4
        case ...36: 6
        default: 12
        }
        var ticks: [Double] = [0]
        var hour = step
        while hour <= maxHour {
            ticks.append(hour)
            hour += step
        }
        return Array(ticks.prefix(7))
    }
}
