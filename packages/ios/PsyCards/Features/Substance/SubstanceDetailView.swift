import Charts
import SwiftUI

struct SubstanceDetailView: View {
    @Environment(DataPackStore.self) private var store
    let substance: Substance
    var embedded: Bool = false
    @State private var selectedPair: ComboPair?
    @State private var showAllCombos = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PsyCardsSpacing.l) {
                hero
                if let summary = substance.summary ?? substance.classDescription {
                    sectionCard(title: String(localized: "substanceCard.more")) {
                        Text(summary)
                            .foregroundStyle(PsyCardsColors.fg)
                    }
                }
                if let dose = substance.dose, !dose.isEmpty {
                    sectionCard(title: String(localized: "substanceCard.doses")) {
                        DoseChartView(dose: dose)
                        if let note = substance.doseNote {
                            Text(note)
                                .font(.footnote)
                                .foregroundStyle(PsyCardsColors.fgMute)
                        }
                    }
                }
                if substance.onset != nil || substance.duration != nil {
                    sectionCard(title: String(localized: "substanceCard.timing")) {
                        TimingChartView(
                            onset: substance.onset,
                            duration: substance.duration,
                            afterEffects: substance.afterEffects,
                            tint: PsyCardsColors.group(substance.group)
                        )
                    }
                }
                if let effects = substance.effects, !effects.isEmpty {
                    sectionCard(title: String(localized: "substanceCard.effects")) {
                        FlowLayout(spacing: 8) {
                            ForEach(effects, id: \.self) { effect in
                                Text(effect)
                                    .font(.caption.weight(.medium))
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .glassEffect(.regular, in: .capsule)
                            }
                        }
                    }
                }
                if let molecule = substance.molecule {
                    sectionCard(title: molecule.compound) {
                        MoleculeView(info: molecule, tint: PsyCardsColors.group(substance.group))
                    }
                }
                comboStrip
                if let avoid = substance.avoid {
                    sectionCard(title: String(localized: "substanceCard.avoidCombining")) {
                        Text(avoid).foregroundStyle(PsyCardsColors.fg)
                    }
                }
            }
            .padding(.horizontal, embedded ? 12 : 16)
            .padding(.top, embedded ? 4 : 8)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background {
            PsyCardsBackground(accent: PsyCardsColors.group(substance.group))
        }
        .modifier(SubstanceDetailChrome(title: substance.prettyName, embedded: embedded))
        .sheet(item: $selectedPair) { pair in
            ComboPairSheet(pair: pair)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: PsyCardsSpacing.s) {
            HStack(spacing: 8) {
                Image(systemName: PsyCardsColors.groupSymbol(substance.group))
                    .font(.caption.weight(.bold))
                Text(store.groupLabel(substance.group).uppercased())
                    .font(.caption.weight(.bold))
                    .tracking(1.2)
            }
            .foregroundStyle(PsyCardsColors.group(substance.group))
            if embedded {
                Text(substance.prettyName)
                    .font(.title.bold())
                    .foregroundStyle(PsyCardsColors.fg)
            }
            if !substance.aliases.isEmpty {
                Text(substance.aliases.prefix(6).joined(separator: " · "))
                    .font(.footnote)
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PsyCardsSpacing.m)
        .glassEffect(
            .regular.tint(PsyCardsColors.group(substance.group).opacity(0.22)),
            in: .rect(cornerRadius: PsyCardsRadius.l)
        )
    }

    private var comboStrip: some View {
        let groups = store.comboGroups(for: substance.key)
        let preview = ComboGrouping.preview(groups)
        let visible = showAllCombos ? groups : preview.visible
        return sectionCard(title: String(localized: "substanceCard.combos")) {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(visible) { group in
                    ComboStatusRow(group: group) { partnerKey in
                        selectedPair = store.pair(a: substance.key, b: partnerKey)
                    }
                }
                if preview.hiddenCount > 0 {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            showAllCombos.toggle()
                        }
                    } label: {
                        Text(
                            showAllCombos
                                ? String(localized: "substanceCard.comboShowLess")
                                : String(
                                    format: String(localized: "substanceCard.comboShowAll"),
                                    "\(preview.hiddenCount)"
                                )
                        )
                        .font(.caption.weight(.semibold))
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(PsyCardsColors.fgMute)
                }
            }
        }
    }

    private func sectionCard<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: PsyCardsSpacing.s) {
            Text(title)
                .font(.headline)
                .foregroundStyle(PsyCardsColors.fg)
            content()
        }
        .padding(PsyCardsSpacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(.regular, in: .rect(cornerRadius: PsyCardsRadius.m))
    }
}

private struct SubstanceDetailChrome: ViewModifier {
    let title: String
    let embedded: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if embedded {
            content
        } else {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct ComboStatusRow: View {
    let group: ComboStatusGroup
    let onSelect: (String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(PsyCardsColors.status(group.statusKey))
                .frame(width: 4)
                .padding(.vertical, 2)
            VStack(alignment: .leading, spacing: 4) {
                Label(group.label, systemImage: PsyCardsColors.statusSymbol(group.icon))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PsyCardsColors.status(group.statusKey))
                    .labelStyle(.titleAndIcon)
                    .symbolRenderingMode(.hierarchical)
                ComboNameList(partners: group.partners, statusLabel: group.label, onSelect: onSelect)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

private struct ComboNameList: View {
    let partners: [ComboPartner]
    let statusLabel: String
    let onSelect: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 0) {
            ForEach(Array(partners.enumerated()), id: \.element.id) { index, partner in
                Button {
                    onSelect(partner.key)
                } label: {
                    Text(index < partners.count - 1 ? "\(partner.name), " : partner.name)
                        .font(.subheadline)
                        .foregroundStyle(PsyCardsColors.fg)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(partner.name), \(statusLabel)")
                .accessibilityHint(String(localized: "landing.navCombos"))
            }
        }
    }
}

// MARK: - Dose chart (port of packages/web/src/lib/dose-chart.ts)

struct DoseChartView: View {
    private let charts: [DoseRouteChart]

    init(dose: [String: [String: String]]) {
        charts = dose
            .sorted { $0.key < $1.key }
            .map { DoseRouteChart(route: $0.key, levels: $0.value) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: PsyCardsSpacing.m) {
            ForEach(charts) { chart in
                DoseRouteChartView(chart: chart)
            }
        }
    }
}

struct DoseRouteChart: Identifiable {
    struct Segment: Identifiable {
        let level: String
        let amount: String
        let color: Color
        /// Percentages of the full scale (0-100).
        let left: Double
        let width: Double
        let isPoint: Bool
        let openEnd: Bool

        var id: String { level }
    }

    struct FallbackRow: Identifiable {
        let level: String
        let amount: String

        var id: String { level }
    }

    let route: String
    let unit: String?
    let scaleMax: Double
    let segments: [Segment]
    let fallbackRows: [FallbackRow]

    var id: String { route }
    var isChartable: Bool { !segments.isEmpty }

    private static let levelOrder = ["threshold", "light", "common", "strong", "heavy", "dangerous", "fatal"]
    private static let chartableUnits: Set<String> = ["µg", "mg", "g", "ml", "units", "seeds"]

    private struct ParsedAmount {
        let min: Double
        let max: Double?
        let openEnd: Bool
        let unit: String
    }

    init(route: String, levels: [String: String]) {
        self.route = route

        let ordered = levels
            .map { (level: $0.key, amount: $0.value) }
            .sorted { a, b in
                let ai = Self.levelOrder.firstIndex(of: a.level.lowercased()) ?? 99
                let bi = Self.levelOrder.firstIndex(of: b.level.lowercased()) ?? 99
                return ai < bi
            }

        let fallback = ordered.map { FallbackRow(level: $0.level, amount: $0.amount) }

        var parsedRows: [(level: String, amount: String, parsed: ParsedAmount)] = []
        for row in ordered where Self.levelOrder.contains(row.level.lowercased()) {
            guard let parsed = Self.parseAmount(row.amount) else {
                self.unit = nil
                self.scaleMax = 1
                self.segments = []
                self.fallbackRows = fallback
                return
            }
            parsedRows.append((row.level, row.amount, parsed))
        }

        let units = Set(parsedRows.map(\.parsed.unit))
        guard !parsedRows.isEmpty, units.count == 1, let unit = units.first,
              Self.chartableUnits.contains(unit) else {
            self.unit = nil
            self.scaleMax = 1
            self.segments = []
            self.fallbackRows = fallback
            return
        }

        var scaleMax = parsedRows
            .flatMap { [$0.parsed.min, $0.parsed.max ?? $0.parsed.min] }
            .max() ?? 1
        for row in parsedRows where row.parsed.openEnd {
            scaleMax = Swift.max(scaleMax, Self.niceScaleMax(row.parsed.min * 1.2))
        }
        scaleMax = Self.niceScaleMax(scaleMax)

        func percent(_ value: Double) -> Double {
            scaleMax > 0 ? value / scaleMax * 100 : 0
        }

        self.unit = unit
        self.scaleMax = scaleMax
        self.fallbackRows = []
        self.segments = parsedRows.map { row in
            let start = row.parsed.min
            let end = row.parsed.openEnd ? scaleMax : (row.parsed.max ?? row.parsed.min)
            let left = percent(start)
            let right = percent(end)
            let isPoint = start == end
            return Segment(
                level: row.level,
                amount: row.amount,
                color: PsyCardsColors.doseLevel(row.level),
                left: left,
                width: isPoint ? 0 : Swift.max(right - left, 0.5),
                isPoint: isPoint,
                openEnd: row.parsed.openEnd
            )
        }
    }

    private static func parseAmount(_ raw: String) -> ParsedAmount? {
        let compact = raw.trimmingCharacters(in: .whitespaces)
            .lowercased()
            .replacingOccurrences(of: " ", with: "")
        guard !compact.isEmpty, compact != "unknown" else { return nil }

        func normalize(_ unit: Substring) -> String {
            let u = String(unit)
            return (u == "ug" || u == "mcg") ? "µg" : u
        }

        if let match = compact.wholeMatch(of: /([\d.]+)-([\d.]+)([a-zµ][a-z0-9\/µ]*?)(\+?)/) {
            guard let lo = Double(match.1), let hi = Double(match.2) else { return nil }
            return ParsedAmount(min: lo, max: hi, openEnd: !match.4.isEmpty, unit: normalize(match.3))
        }
        if let match = compact.wholeMatch(of: /([\d.]+)([a-zµ][a-z0-9\/µ]*?)\+/) {
            guard let value = Double(match.1) else { return nil }
            return ParsedAmount(min: value, max: nil, openEnd: true, unit: normalize(match.2))
        }
        if let match = compact.wholeMatch(of: /([\d.]+)([a-zµ][a-z0-9\/µ]*)/) {
            guard let value = Double(match.1) else { return nil }
            return ParsedAmount(min: value, max: value, openEnd: false, unit: normalize(match.2))
        }
        return nil
    }

    private static func niceScaleMax(_ value: Double) -> Double {
        guard value > 0 else { return 1 }
        let magnitude = pow(10, floor(log10(value)))
        let normalized = value / magnitude
        let factor: Double = switch normalized {
        case ...1.2: 1.2
        case ...1.5: 1.5
        case ...2: 2
        case ...2.5: 2.5
        case ...3: 3
        case ...5: 5
        case ...7.5: 7.5
        default: 10
        }
        return factor * magnitude
    }

    static func routeSymbol(_ route: String) -> String {
        let key = route.lowercased().split(separator: "(").first.map(String.init) ?? route.lowercased()
        return switch key.trimmingCharacters(in: .whitespaces) {
        case "oral": "pill.fill"
        case "insufflated": "wind"
        case "rectal": "cross.case.fill"
        case "vapourized", "vaporized": "cloud.fill"
        case "intravenous", "intramuscular": "syringe.fill"
        case "smoked": "smoke.fill"
        case "sublingual", "buccal": "mouth.fill"
        case "transdermal": "bandage.fill"
        case "dried", "fresh", "dry": "leaf.fill"
        case "wet": "drop.fill"
        default: "circle.fill"
        }
    }

    static func formatScale(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String((value * 100).rounded() / 100)
    }
}

private struct DoseRouteChartView: View {
    let chart: DoseRouteChart

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: DoseRouteChart.routeSymbol(chart.route))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(PsyCardsColors.fgMute)
                Text(chart.route.replacingOccurrences(of: "_", with: " ").capitalized)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(PsyCardsColors.fg)
                Spacer()
                if let unit = chart.unit {
                    Text(unit)
                        .font(.caption2.weight(.semibold).monospaced())
                        .foregroundStyle(PsyCardsColors.fgMute)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.white.opacity(0.08), in: .capsule)
                }
            }

            if chart.isChartable {
                track
                HStack {
                    Text("0")
                    Spacer()
                    Text("\(DoseRouteChart.formatScale(chart.scaleMax))\(chart.unit ?? "")")
                }
                .font(.caption2.monospaced())
                .foregroundStyle(PsyCardsColors.fgMute)
                FlowLayout(spacing: 6) {
                    ForEach(chart.segments) { segment in
                        HStack(spacing: 5) {
                            Circle()
                                .fill(segment.color)
                                .frame(width: 7, height: 7)
                            Text(segment.level.capitalized)
                                .font(.caption2.weight(.medium))
                                .foregroundStyle(PsyCardsColors.fg)
                            Text(segment.amount)
                                .font(.caption2.monospaced())
                                .foregroundStyle(PsyCardsColors.fgMute)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.white.opacity(0.06), in: .capsule)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(chart.fallbackRows) { row in
                        HStack {
                            Text(row.level.capitalized)
                                .font(.caption.weight(.medium))
                                .foregroundStyle(PsyCardsColors.fg)
                            Spacer()
                            Text(row.amount)
                                .font(.caption.monospaced())
                                .foregroundStyle(PsyCardsColors.fgMute)
                        }
                    }
                }
            }
        }
    }

    private var track: some View {
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.white.opacity(0.07))
                    .frame(height: 6)
                    .frame(maxHeight: .infinity, alignment: .center)

                ForEach(chart.segments) { segment in
                    if segment.isPoint {
                        Circle()
                            .fill(segment.color)
                            .frame(width: 12, height: 12)
                            .offset(x: width * segment.left / 100 - 6)
                    } else {
                        RoundedRectangle(cornerRadius: 5, style: .continuous)
                            .fill(segmentFill(segment))
                            .frame(width: max(width * segment.width / 100, 6), height: 14)
                            .offset(x: width * segment.left / 100)
                    }
                }
            }
        }
        .frame(height: 16)
    }

    private func segmentFill(_ segment: DoseRouteChart.Segment) -> LinearGradient {
        LinearGradient(
            colors: segment.openEnd
                ? [segment.color, segment.color.opacity(0.15)]
                : [segment.color, segment.color.mix(with: .black, by: 0.18)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}

// MARK: - Timing chart (port of packages/web/src/scripts/timing-chart.ts)

struct TimingChartView: View {
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

    private let onset: TimingValue?
    private let duration: TimingValue?
    private let afterEffects: String?
    private let tint: Color
    private let points: [CurvePoint]
    private let markers: [Marker]
    private let maxHour: Double
    private let ticks: [Double]

    init(onset: TimingValue?, duration: TimingValue?, afterEffects: String?, tint: Color) {
        self.onset = onset
        self.duration = duration
        self.afterEffects = afterEffects
        self.tint = tint

        let onsetRange = Self.range(from: onset)
        let durationRange = Self.range(from: duration)

        guard let durationRange else {
            points = []
            markers = []
            maxHour = 1
            ticks = []
            return
        }

        let geometry = Self.curveGeometry(onset: onsetRange, duration: durationRange)
        points = geometry.points
        markers = geometry.markers
        maxHour = geometry.maxHour
        ticks = Self.buildTicks(maxHour: geometry.maxHour)
    }

    var body: some View {
        if !points.isEmpty {
            Chart {
                ForEach(points) { point in
                    AreaMark(
                        x: .value("Hours", point.hour),
                        y: .value("Intensity", point.intensity)
                    )
                    .interpolationMethod(.monotone)
                    .foregroundStyle(
                        .linearGradient(
                            colors: [tint.opacity(0.36), tint.opacity(0)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("Hours", point.hour),
                        y: .value("Intensity", point.intensity)
                    )
                    .interpolationMethod(.monotone)
                    .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round))
                    .foregroundStyle(tint)
                }

                ForEach(markers) { marker in
                    RuleMark(x: .value("Hours", marker.hour))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .foregroundStyle(.white.opacity(0.18))

                    PointMark(
                        x: .value("Hours", marker.hour),
                        y: .value("Intensity", marker.intensity)
                    )
                    .symbolSize(38)
                    .foregroundStyle(tint)
                    .annotation(
                        position: marker.intensity > 0.8 ? .trailing : .top,
                        overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))
                    ) {
                        if let label = marker.label {
                            Text(label)
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(PsyCardsColors.fg)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.1), in: .capsule)
                        }
                    }
                }
            }
            .chartXScale(domain: 0...maxHour)
            .chartYScale(domain: 0...1.12)
            .chartYAxis(.hidden)
            .chartXAxis {
                AxisMarks(values: ticks) { value in
                    AxisTick(stroke: StrokeStyle(lineWidth: 1))
                        .foregroundStyle(.white.opacity(0.2))
                    AxisValueLabel {
                        if let hour = value.as(Double.self) {
                            Text(Self.formatTick(hour))
                                .font(.caption2.monospaced())
                                .foregroundStyle(PsyCardsColors.fgMute)
                        }
                    }
                }
            }
            .frame(height: 150)
            .accessibilityLabel(String(localized: "substanceCard.timing"))
        }

        VStack(alignment: .leading, spacing: 6) {
            if let onset {
                timingRow(
                    label: String(localized: "substanceCard.onset"),
                    value: "\(onset.value ?? "—") \(onset.unit ?? "")"
                )
            }
            if let duration {
                timingRow(
                    label: String(localized: "substanceCard.duration"),
                    value: "\(duration.value ?? "—") \(duration.unit ?? "")"
                )
            }
            if let afterEffects {
                timingRow(
                    label: String(localized: "substanceCard.afterEffects"),
                    value: afterEffects
                )
            }
        }
    }

    private func timingRow(label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Circle()
                .fill(tint.opacity(0.8))
                .frame(width: 6, height: 6)
            Text(label)
                .font(.footnote.weight(.medium))
                .foregroundStyle(PsyCardsColors.fg)
            Spacer()
            Text(value)
                .font(.footnote.monospaced())
                .foregroundStyle(PsyCardsColors.fgMute)
        }
    }

    // MARK: Curve math

    struct TimingRange {
        let min: Double
        let max: Double
        var average: Double { (min + max) / 2 }
    }

    private static func range(from timing: TimingValue?) -> TimingRange? {
        guard let timing, let value = timing.value?.lowercased(), !value.contains("unknown") else {
            return nil
        }
        let multiplier: Double = {
            let unit = (timing.unit ?? "").lowercased()
            if unit.contains("sec") { return 1.0 / 3600 }
            if unit.contains("min") { return 1.0 / 60 }
            if unit.contains("day") { return 24 }
            return 1
        }()
        let numbers = value.matches(of: /\d+(?:\.\d+)?/).compactMap { Double($0.output) }
        guard let first = numbers.first else { return nil }
        let second = numbers.count > 1 ? numbers[1] : first
        let lo = Swift.min(first, second) * multiplier
        let hi = Swift.max(first, second) * multiplier
        return TimingRange(min: lo, max: hi)
    }

    private static func curveGeometry(
        onset: TimingRange?,
        duration: TimingRange
    ) -> (points: [CurvePoint], markers: [Marker], maxHour: Double) {
        func clamp(_ value: Double, _ lo: Double, _ hi: Double) -> Double {
            Swift.min(Swift.max(value, lo), hi)
        }

        let durationEnd = Swift.max(duration.average, duration.max)
        let maxHour = Swift.max(durationEnd * 1.08, 1)

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
            CurvePoint(hour: 0, intensity: 0),
            CurvePoint(hour: onsetStart, intensity: 0.04),
            CurvePoint(hour: onsetMid, intensity: 0.18),
            CurvePoint(hour: onsetEnd, intensity: 0.45),
            CurvePoint(hour: prePeak, intensity: 0.82),
            CurvePoint(hour: peakHour, intensity: 1),
            CurvePoint(hour: plateauEnd, intensity: 0.88),
            CurvePoint(hour: comedownMid, intensity: 0.32),
            CurvePoint(hour: tailStart, intensity: 0.08),
            CurvePoint(hour: durationEnd, intensity: 0),
        ]

        // Merge points closer than 0.01h, keeping the higher intensity.
        var points: [CurvePoint] = []
        for point in raw.sorted(by: { $0.hour < $1.hour }) {
            if let last = points.last, abs(last.hour - point.hour) < 0.01 {
                points[points.count - 1] = CurvePoint(
                    hour: last.hour,
                    intensity: Swift.max(last.intensity, point.intensity)
                )
            } else {
                points.append(point)
            }
        }

        var markers: [Marker] = []
        if let onset {
            markers.append(Marker(hour: onset.average, intensity: 0.4, label: "onset"))
        }
        markers.append(Marker(hour: peakHour, intensity: 1, label: "peak"))
        markers.append(Marker(hour: durationEnd, intensity: 0.04, label: nil))

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
        while hour < maxHour {
            ticks.append(hour)
            hour += step
        }
        let roundedMax = maxHour.rounded(.up)
        if roundedMax > ticks.last ?? 0 {
            ticks.append(roundedMax)
        }
        return Array(ticks.prefix(6))
    }

    private static func formatTick(_ hour: Double) -> String {
        "+\(Int(hour))h"
    }
}

// MARK: - Molecule

struct MoleculeView: View {
    let info: MoleculeInfo
    let tint: Color

    var body: some View {
        VStack(spacing: PsyCardsSpacing.s) {
            Image(info.assetName)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: 280, maxHeight: 280)
                .frame(maxWidth: .infinity)
                .background {
                    RadialGradient(
                        colors: [tint.opacity(0.16), .clear],
                        center: .center,
                        startRadius: 10,
                        endRadius: 190
                    )
                }
            if info.representative {
                Text("Representative structure")
                    .font(.caption)
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
            Text(info.smiles)
                .font(.caption2.monospaced())
                .foregroundStyle(PsyCardsColors.fgMute)
                .textSelection(.enabled)
        }
    }
}

/// Simple wrapping layout for effect chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: maxWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
