import SwiftUI

// MARK: - Front: dose & timing

/// Card front (web `card/CardFront.astro`): dose scale, personal figure,
/// timing, toxicity margin and preparation advice.
struct CardFrontView: View {
    @Environment(DataPackStore.self) private var store
    @Environment(BodyProfileStore.self) private var profile
    let card: SubstanceCardData
    let moleculeAsset: String?
    var swipe: Double = 0
    let onFlip: () -> Void

    @State private var showRoutes = false
    @State private var showCompare = false

    private var content: CardContent { card.content }
    private var face: Color { PsyCardsColors.face(card.group) }
    private var hue: Color { PsyCardsColors.group(card.group) }

    private var isPerKgChart: Bool {
        if case .perKgChart = card.personal { true } else { false }
    }

    private var showDoseTip: Bool {
        card.primary?.chartable == true && content.dose != nil && !isPerKgChart
    }

    private var showSideTile: Bool { card.personal != nil || showDoseTip }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
                .padding(.bottom, 4)
            doseTile
            if showSideTile || card.hasTiming {
                TileRow(weights: [1, 1]) {
                    if showSideTile { personalTile }
                    if card.hasTiming { timingTile }
                }
            }
            marginTile
            if let prepare = content.prepare {
                prepareTile(prepare)
            } else {
                Spacer(minLength: 0)
            }
            footer
        }
        .padding(.horizontal, 14)
        .padding(.top, 20)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(alignment: .topTrailing) {
            if let moleculeAsset {
                MoleculeHologram(assetName: moleculeAsset, swipe: swipe)
                    .frame(width: 210, height: 210)
                    .offset(x: 14, y: -8)
            }
        }
        .sheet(isPresented: $showRoutes) {
            OtherRoutesSheet(card: card)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
        .sheet(isPresented: $showCompare) {
            MarginCompareSheet(card: card)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(card.groupLabel)
                .font(.caption2.weight(.heavy))
                .tracking(1.1)
                .textCase(.uppercase)
                .foregroundStyle(PsyCardsColors.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(hue, in: .capsule)
            Text(card.displayName)
                .font(.system(size: card.displayName.count > 11 ? 30 : 38, weight: .heavy))
                .tracking(card.displayName.count > 11 ? -0.8 : -1.4)
                .foregroundStyle(PsyCardsColors.fg)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            if !card.aliases.isEmpty {
                Text(card.aliases.prefix(4).joined(separator: " · "))
                    .font(.footnote)
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .padding(.trailing, 90)
            }
        }
    }

    // MARK: Dose

    private var markerValue: Double? {
        guard case let .mgPerKg(male, female) = card.personal,
              let sex = profile.sex, let weight = profile.weightKg else { return nil }
        return PersonalDoseMath.upperLimitMg(weightKg: weight, mgPerKg: sex == .male ? male : female)
    }

    private var perKgWeight: Double? {
        card.primary?.isPerKg == true ? profile.weightKg : nil
    }

    private var doseTile: some View {
        CardTile {
            HStack(spacing: 6) {
                TileHeading(icon: "scales-fill", title: store.t("card.dose"), iconColor: hue)
                    .layoutPriority(1)
                if let reference = card.referenceName, card.primary?.chartable == true {
                    Text(reference)
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(PsyCardsColors.fg)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(hue.opacity(0.22), in: .capsule)
                        .lineLimit(1)
                        .accessibilityLabel(store.t("card.reference", ["name": reference]))
                }
                Spacer(minLength: 4)
                if let primary = card.primary {
                    RouteLabel(
                        chart: primary,
                        unitOverride: perKgWeight.map { "mg · \(store.number($0)) kg" }
                    )
                }
                if !card.otherRoutes.isEmpty {
                    Button {
                        showRoutes = true
                    } label: {
                        HStack(spacing: 3) {
                            Text(store.t("card.otherRoutesCount", ["count": "\(card.otherRoutes.count)"]))
                            PhIcon("caret-down-bold", size: 11)
                        }
                    }
                    .buttonStyle(.tileChip)
                    .accessibilityLabel("\(store.t("card.otherRoutes")) (\(card.otherRoutes.count))")
                    .accessibilityIdentifier("other-routes")
                }
            }
            if let primary = card.primary, primary.chartable {
                DoseScaleView(chart: primary, face: face, weightKg: perKgWeight, markerValue: markerValue)
                    .padding(.horizontal, 2)
            } else if let primary = card.primary, let rows = primary.rows {
                DoseListView(rows: rows)
            } else if let dose = content.dose {
                Text(dose)
                    .font(.subheadline)
                    .foregroundStyle(PsyCardsColors.fg)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Personal ("For you" / "Start low")

    @ViewBuilder
    private var personalTile: some View {
        CardTile(grows: true) {
            TileHeading(
                icon: card.personal == nil ? "sparkle-fill" : "user-fill",
                title: store.t(card.personal == nil ? "card.startLow" : "card.forYou"),
                iconColor: hue
            )
            if let personal = card.personal {
                personalBody(personal)
            } else if let dose = content.dose {
                tileText(dose)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func personalBody(_ personal: PersonalDose) -> some View {
        if case let .referenceWeight(reference) = personal {
            let lighter = profile.weightKg.map { PersonalDoseMath.lighterThanPct(referenceKg: reference, weightKg: $0) }
            let lighterLine = Text(lighterText(lighter).map { " " + $0 } ?? "").foregroundStyle(PsyCardsColors.fg).bold()
            Text("\(store.t("card.refWeight", ["weight": store.number(reference)]))\(lighterLine)")
            .font(.footnote)
            .foregroundStyle(PsyCardsColors.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
        } else if let result = PersonalResult.make(personal, profile: profile.snapshot, store: store) {
            VStack(alignment: .leading, spacing: 2) {
                Text(result.value)
                    .font(.system(size: result.value.count > 9 ? 19 : 24, weight: .heavy).monospacedDigit())
                    .tracking(-0.6)
                    .foregroundStyle(PsyCardsColors.fg)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .contentTransition(.numericText())
                Text(result.label)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(PsyCardsColors.fg)
                Text(result.formula)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .padding(.top, 2)
                    .contentTransition(.numericText())
            }
            .animation(.snappy, value: result)
        } else {
            switch personal {
            case .bac: tileText(store.t("card.setBody"))
            case .caffeine: tileText(store.t("card.setWeight"))
            default: if let dose = content.dose { tileText(dose) }
            }
        }
    }

    private func lighterText(_ pct: Int?) -> String? {
        guard let pct else { return nil }
        return pct >= 5 ? store.t("card.lighter", ["pct": "\(pct)"]) : store.t("card.notLighter")
    }

    // MARK: Timing

    private var timingTile: some View {
        CardTile(grows: true) {
            TileHeading(icon: "clock-fill", title: store.t("card.timing"), iconColor: hue)
            VStack(spacing: 0) {
                let rows: [(String, CardTimingValue)] = [
                    ("card.onset", card.timing.onset),
                    ("card.duration", card.timing.duration),
                    ("card.afterEffects", card.timing.after),
                ].compactMap { key, value in value.map { (key, $0) } }
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(store.t(row.0))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(PsyCardsColors.fgMute)
                        Spacer(minLength: 4)
                        let unit = Text(" \(row.1.shortUnit)").font(.caption2.weight(.semibold)).foregroundStyle(PsyCardsColors.fgMute)
                        Text("\(Text(row.1.value).font(.subheadline.weight(.heavy).monospacedDigit()))\(unit)")
                            .foregroundStyle(PsyCardsColors.fg)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .padding(.vertical, 6)
                    .overlay(alignment: .bottom) {
                        if index < rows.count - 1 {
                            Line()
                                .stroke(PsyCardsColors.tileEdge, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                                .frame(height: 1)
                        }
                    }
                }
            }
        }
    }

    // MARK: Margin

    /// "Lethal dose ≈ 16× a usual dose (compound), estimated from animal data"
    private var marginLine: AttributedString {
        var line = AttributedString(marginText)
        line.inlinePresentationIntent = .stronglyEmphasized
        line.foregroundColor = PsyCardsColors.fg
        if let compound = card.margin?.compound {
            line += AttributedString(" (\(compound))")
        }
        if card.margin?.isEstimate == true {
            var estimate = AttributedString(", \(store.t("card.marginExtrapolated"))")
            estimate.foregroundColor = PsyCardsColors.fgMute
            line += estimate
        }
        if card.margin == nil, let note = content.marginNote {
            line += AttributedString(" \(note)")
        }
        return line
    }

    private var marginText: String {
        guard let margin = card.margin else { return store.t("card.marginUnknown") }
        return store.t(margin.isLowerBound ? "card.marginAtLeast" : "card.marginLabel", ["ratio": store.number(margin.ratio)])
    }

    private var marginTile: some View {
        CardTile {
            HStack {
                TileHeading(icon: "skull-fill", title: store.t("card.margin"), iconColor: hue)
                Spacer(minLength: 4)
                Button {
                    showCompare = true
                } label: {
                    HStack(spacing: 4) {
                        PhIcon("chart-bar-horizontal-fill", size: 13)
                        Text(store.t("card.marginCompare"))
                    }
                }
                .buttonStyle(.tileChip)
                .accessibilityIdentifier("margin-compare")
            }
            MarginMeterView(
                margin: card.margin,
                danger: card.marginDanger,
                alcoholRatio: card.key == "alcohol" ? nil : (store.gable.first { $0.key == "alcohol" }?.ratio ?? 10),
                face: face
            )
            .padding(.horizontal, 2)
            .padding(.top, card.margin == nil ? 2 : 6)
            Text(marginLine)
            .font(.footnote)
            .foregroundStyle(PsyCardsColors.inkSoft)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Prepare

    private func prepareTile(_ prepare: String) -> some View {
        CardTile(grows: true) {
            TileHeading(icon: "test-tube-fill", title: store.t("card.prepare"), iconColor: hue)
            tileText(prepare)
            if let dose = content.dose, isBacOrCaffeine {
                tileText(dose, color: PsyCardsColors.fgMute)
                    .padding(.top, 6)
                    .overlay(alignment: .top) {
                        Line()
                            .stroke(PsyCardsColors.tileEdge, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .frame(height: 1)
                    }
            }
        }
    }

    private var isBacOrCaffeine: Bool {
        switch card.personal {
        case .bac, .caffeine: true
        default: false
        }
    }

    // MARK: Footer

    private var footer: some View {
        HStack {
            HStack(spacing: 6) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 18, height: 18)
                    .clipShape(.rect(cornerRadius: 4, style: .continuous))
                Text(store.t("card.brand"))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
            .accessibilityHidden(true)
            Spacer()
            FlipButton(title: store.t("card.flipToSafety"), icon: "arrows-clockwise-bold", prominent: true, action: onFlip)
        }
        .padding(.top, 4)
    }
}

// MARK: - Back: risks & safety

/// Card back (web `card/CardBack.astro`): spacing, dependence, key risks,
/// combinations to avoid and what to do in an emergency.
struct CardBackView: View {
    @Environment(DataPackStore.self) private var store
    let card: SubstanceCardData
    let onFlip: () -> Void
    let onSelectCombo: (String) -> Void
    let onShowAllCombos: () -> Void

    @State private var showDependence = false

    private var content: CardContent { card.content }
    private var hue: Color { PsyCardsColors.group(card.group) }
    private static let maxAvoid = 7

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            header
                .padding(.bottom, 4)
            TileRow(weights: content.spacing == nil ? [1] : [1.5, 1]) {
                if let spacing = content.spacing {
                    spacingTile(spacing)
                }
                dependenceTile
            }
            if let risks = content.risks, !risks.isEmpty {
                risksTile(risks)
            }
            avoidTile
            if let overdose = content.overdose {
                emergencyTile(overdose)
            } else {
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 20)
        .padding(.bottom, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(card.displayName)
                    .font(.caption.weight(.heavy))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(hue)
                Text(store.t("card.flipToSafety"))
                    .font(.system(size: 26, weight: .heavy))
                    .tracking(-0.8)
                    .foregroundStyle(PsyCardsColors.fg)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer()
            FlipButton(title: store.t("card.faceDose"), icon: "arrows-counter-clockwise-bold", prominent: false, action: onFlip)
                .accessibilityLabel(store.t("card.flipToDose"))
        }
    }

    // MARK: Spacing

    private func spacingTile(_ spacing: SpacingText) -> some View {
        CardTile(grows: true) {
            TileHeading(icon: "calendar-dots-fill", title: store.t("card.spacing"), iconColor: hue)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 6) { spacingValue(spacing) }
                VStack(alignment: .leading, spacing: 2) { spacingValue(spacing) }
            }
            let cells = card.spacing.cells
            if !cells.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        ForEach(Array(cells.enumerated()), id: \.offset) { _, used in
                            Circle()
                                .fill(used ? hue : PsyCardsColors.fg.opacity(0.13))
                                .frame(width: 8, height: 8)
                                .shadow(color: used ? hue.opacity(0.7) : .clear, radius: 4)
                        }
                    }
                    Text(store.t("card.spacingSpan", [
                        "count": "\(cells.count)",
                        "unit": store.t("card.units.\(card.spacing.unit ?? "week")"),
                    ]))
                    .font(.caption2)
                    .foregroundStyle(PsyCardsColors.fgMute)
                }
                .accessibilityHidden(true)
            }
            tileText(spacing.text)
        }
    }

    @ViewBuilder
    private func spacingValue(_ spacing: SpacingText) -> some View {
        Text(spacing.value)
            .font(.system(size: 22, weight: .heavy))
            .tracking(-0.6)
            .foregroundStyle(PsyCardsColors.fg)
            .fixedSize()
        Text(spacing.label)
            .font(.caption.weight(.heavy))
            .foregroundStyle(hue)
    }

    // MARK: Dependence

    private var dependenceTile: some View {
        let level = card.dependence.clampedLevel
        let label = store.t("card.dependenceLevels.\(level)")
        return CardTile(grows: true) {
            HStack(spacing: 4) {
                TileHeading(icon: "link-break-fill", title: store.t("card.dependence"), iconColor: hue)
                Spacer(minLength: 0)
                Button {
                    showDependence = true
                } label: {
                    PhIcon("info-bold", size: 12)
                        .foregroundStyle(PsyCardsColors.fgMute)
                        .frame(width: 24, height: 24)
                        .background(PsyCardsColors.fg.opacity(0.07), in: .circle)
                        .overlay(Circle().strokeBorder(PsyCardsColors.tileEdge))
                        .contentShape(.circle)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(store.t("card.info"))
                .popover(isPresented: $showDependence) {
                    DependenceInfoView(card: card)
                        .presentationCompactAdaptation(.popover)
                }
            }
            DependenceMeter(level: level)
                .accessibilityElement()
                .accessibilityLabel(store.t("card.dependence"))
                .accessibilityValue(label)
            Text(label)
                .font(.headline.weight(.heavy))
                .foregroundStyle(PsyCardsColors.fg)
            if let text = content.dependence {
                Text(text)
                    .font(.caption)
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Risks

    private func risksTile(_ risks: [RiskItem]) -> some View {
        CardTile {
            TileHeading(icon: "warning-fill", title: store.t("card.risks"), iconColor: hue)
            VStack(alignment: .leading, spacing: 9) {
                ForEach(risks) { risk in
                    HStack(alignment: .top, spacing: 10) {
                        PhIcon(risk.icon, size: 16)
                            .foregroundStyle(PsyCardsColors.riskIcon)
                            .frame(width: 30, height: 30)
                            .background(PsyCardsColors.riskIconWell, in: .rect(cornerRadius: 9, style: .continuous))
                        Text("\(Text("\(risk.title).").fontWeight(.bold).foregroundStyle(PsyCardsColors.fg)) \(risk.text)")
                            .font(.footnote)
                            .foregroundStyle(PsyCardsColors.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: Avoid

    private var avoidTile: some View {
        let shown = card.avoid.count > Self.maxAvoid + 1 ? Array(card.avoid.prefix(Self.maxAvoid)) : card.avoid
        let hidden = card.avoid.count - shown.count
        return CardTile {
            TileHeading(icon: "prohibit-fill", title: store.t("card.avoid"), iconColor: hue)
            if card.avoid.isEmpty {
                tileText(store.t("card.avoidNone"))
            } else {
                FlowLayout(spacing: 5) {
                    ForEach(shown) { combo in
                        Button {
                            onSelectCombo(combo.key)
                        } label: {
                            HStack(spacing: 4) {
                                StatusIcon(name: combo.icon, size: 14)
                                Text(combo.label)
                                    .font(.caption.weight(.heavy))
                            }
                            .foregroundStyle(PsyCardsColors.ink(onStatus: combo.statusKey))
                            .padding(.leading, 7)
                            .padding(.trailing, 10)
                            .frame(minHeight: 30)
                            .background(PsyCardsColors.status(combo.statusKey), in: .capsule)
                            .contentShape(.capsule)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(combo.label), \(combo.statusLabel)")
                    }
                    if hidden > 0 {
                        Button(action: onShowAllCombos) {
                            Text(store.t("card.otherRoutesCount", ["count": "\(hidden)"]))
                                .font(.caption.weight(.heavy))
                                .foregroundStyle(PsyCardsColors.fg)
                                .padding(.horizontal, 10)
                                .frame(minHeight: 30)
                                .background(PsyCardsColors.fg.opacity(0.1), in: .capsule)
                                .overlay(Capsule().strokeBorder(PsyCardsColors.tileEdge))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(store.t("substanceCard.combos"))
                    }
                }
            }
        }
    }

    // MARK: Emergency

    private func emergencyTile(_ overdose: Overdose) -> some View {
        let number = store.t("card.emergencyNumber")
        return CardTile(
            tint: PsyCardsColors.emergency.opacity(0.11),
            edge: PsyCardsColors.emergency.opacity(0.45),
            grows: true
        ) {
            HStack {
                TileHeading(
                    icon: "siren-fill",
                    title: store.t("card.emergency"),
                    iconColor: PsyCardsColors.emergencyIcon,
                    textColor: PsyCardsColors.emergencyInk
                )
                Spacer(minLength: 4)
                if let url = URL(string: "tel:\(number)") {
                    Link(destination: url) {
                        HStack(spacing: 5) {
                            PhIcon("phone-call-fill", size: 15)
                            Text(store.t("card.call", ["number": number]))
                                .font(.footnote.weight(.heavy))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 34)
                        .background(PsyCardsColors.emergencyStrong, in: .capsule)
                        .shadow(color: PsyCardsColors.emergencyStrong.opacity(0.6), radius: 8, y: 3)
                    }
                }
            }
            Text("\(Text("\(store.t("card.signs")):").fontWeight(.bold).foregroundStyle(PsyCardsColors.emergencyInk)) \(overdose.signs.joined(separator: " · "))")
                .font(.footnote)
                .foregroundStyle(PsyCardsColors.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(overdose.actions.enumerated()), id: \.offset) { index, action in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("\(index + 1).")
                            .fontWeight(.heavy)
                            .foregroundStyle(PsyCardsColors.emergencyMarker)
                            .monospacedDigit()
                        Text(action)
                            .foregroundStyle(PsyCardsColors.fg)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .font(.footnote)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(store.t("card.actions"))
        }
        .background {
            RadialGradient(
                colors: [PsyCardsColors.emergency.opacity(0.26), .clear],
                center: .topTrailing,
                startRadius: 0,
                endRadius: 260
            )
            .clipShape(.rect(cornerRadius: 14, style: .continuous))
        }
    }
}

// MARK: - Shared pieces

private func tileText(_ text: String, color: Color = PsyCardsColors.inkSoft) -> some View {
    Text(text)
        .font(.footnote)
        .foregroundStyle(color)
        .fixedSize(horizontal: false, vertical: true)
}

private struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return path
    }
}

/// "Risks & safety ⟳" / "⟲ Dose" (web `.psy-flip`).
struct FlipButton: View {
    let title: String
    let icon: String
    let prominent: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if !prominent { PhIcon(icon, size: 14) }
                Text(title)
                    .font(.footnote.weight(.heavy))
                if prominent { PhIcon(icon, size: 14) }
            }
            .foregroundStyle(prominent ? PsyCardsColors.ink : PsyCardsColors.fg)
            .padding(.horizontal, 14)
            .frame(minHeight: 38)
            .background(prominent ? PsyCardsColors.fg : PsyCardsColors.fg.opacity(0.1), in: .capsule)
            .shadow(color: prominent ? .black.opacity(0.45) : .clear, radius: 8, y: 4)
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
    }
}

struct DependenceMeter: View {
    let level: Int
    var height: CGFloat = 8

    var body: some View {
        HStack(spacing: 3) {
            ForEach(1...5, id: \.self) { step in
                Capsule()
                    .fill(step <= level ? PsyCardsColors.dependence(level) : PsyCardsColors.fg.opacity(0.12))
                    .frame(height: height)
            }
        }
    }
}

// MARK: - Popovers & sheets

private struct DependenceInfoView: View {
    @Environment(DataPackStore.self) private var store
    let card: SubstanceCardData

    var body: some View {
        let level = card.dependence.clampedLevel
        VStack(alignment: .leading, spacing: 12) {
            Text("\(store.t("card.dependence")): \(store.t("card.dependenceLevels.\(level)"))")
                .font(.headline)
            DependenceMeter(level: level, height: 10)
            if let text = card.content.dependence {
                Text(text).font(.subheadline)
            }
            Text(source)
                .font(.footnote)
                .foregroundStyle(PsyCardsColors.fgMute)
        }
        .padding(18)
        .frame(width: 300, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var source: String {
        if let nutt = card.dependence.nutt {
            return store.t("card.nuttScore", [
                "score": store.number(nutt, digits: 2),
                "drug": card.dependence.nuttDrug ?? card.displayName,
            ])
        }
        return store.t("card.editorial")
    }
}

struct OtherRoutesSheet: View {
    @Environment(DataPackStore.self) private var store
    @Environment(BodyProfileStore.self) private var profile
    @Environment(\.dismiss) private var dismiss
    let card: SubstanceCardData

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(card.otherRoutes) { chart in
                        VStack(alignment: .leading, spacing: 10) {
                            RouteLabel(
                                chart: chart,
                                unitOverride: chart.isPerKg ? profile.weightKg.map { "mg · \(store.number($0)) kg" } : nil
                            )
                            if chart.chartable {
                                DoseScaleView(chart: chart, weightKg: chart.isPerKg ? profile.weightKg : nil)
                            } else if let rows = chart.rows {
                                DoseListView(rows: rows)
                            }
                        }
                        .padding(14)
                        .background(PsyCardsColors.tile, in: .rect(cornerRadius: 16, style: .continuous))
                    }
                    if let note = card.doseNote {
                        Text(note)
                            .font(.footnote)
                            .foregroundStyle(PsyCardsColors.fgMute)
                    }
                }
                .padding(20)
            }
            .navigationTitle("\(card.displayName) · \(store.t("card.otherRoutes"))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .close) { dismiss() }
                }
            }
        }
    }
}

struct MarginCompareSheet: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let card: SubstanceCardData

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    GableChartView(rows: store.gable, current: card.key)
                    Text(store.t("card.marginChartNote"))
                        .font(.footnote)
                        .foregroundStyle(PsyCardsColors.fgMute)
                    Text(store.t("card.marginCaveat"))
                        .font(.footnote)
                        .foregroundStyle(PsyCardsColors.fgMute)
                }
                .padding(20)
            }
            .navigationTitle(store.t("card.marginChartTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(role: .close) { dismiss() }
                }
            }
        }
    }
}
