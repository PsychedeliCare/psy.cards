import SwiftUI

/// Full-screen interaction grid. The substance row and column headers stay
/// pinned while the cells scroll beneath them, and both open the card. Each
/// axis is one stack of overlapping cards (every card runs under the next):
/// a tapped card lifts up, zooms into the floating card and drops back
/// into place when the card closes.
struct CombosMatrixView: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var deckZoom
    @State private var selectedPair: ComboPair?
    @State private var selectedSubstance: Substance?
    /// Header card currently lifted off its deck ("row-<key>" / "col-<key>").
    @State private var pulledID: String?
    @State private var presentedSourceID: String?
    @State private var scale: CGFloat = 1
    @State private var pinchBase: CGFloat?
    /// Scroll offset from the content origin. Negative while bouncing past
    /// the top/leading edge, so the headers stay glued to the screen edge.
    @State private var offset: CGPoint = .zero
    @State private var viewportWidth: CGFloat = 0

    private let baseCellSize: CGFloat = 50
    private let rowHeaderWidth: CGFloat = 100
    private let columnHeaderHeight: CGFloat = 50
    private let legendGap: CGFloat = 20

    private var cellSize: CGFloat { (baseCellSize * scale).rounded() }
    private var columns: [ComboColumn] { store.combosPack?.columns ?? [] }
    private var gridSide: CGFloat { CGFloat(columns.count) * cellSize }
    private var legendWidth: CGFloat { max(viewportWidth - 2 * PsyCardsSpacing.m, 0) }

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .leading, spacing: legendGap) {
                ZStack(alignment: .topLeading) {
                    ComboGrid(columns: columns, cellSize: cellSize) { row, col in
                        selectedPair = store.pair(a: row.key, b: col.key)
                    }
                    .equatable()
                    .offset(x: rowHeaderWidth, y: columnHeaderHeight)

                    rowHeaders
                        .offset(x: offset.x, y: columnHeaderHeight)
                        .zIndex(1)
                    columnHeaders
                        .offset(x: rowHeaderWidth, y: offset.y)
                        .zIndex(2)
                    headerBackground
                        .frame(width: rowHeaderWidth, height: columnHeaderHeight)
                        .offset(x: offset.x, y: offset.y)
                        .zIndex(3)
                }
                .frame(width: rowHeaderWidth + gridSide, height: columnHeaderHeight + gridSide, alignment: .topLeading)

                // Pinned horizontally so it stays readable under a wide grid.
                if let legend = store.combosPack?.legend {
                    legendView(legend)
                        .frame(width: legendWidth, alignment: .leading)
                        .offset(x: offset.x + PsyCardsSpacing.m)
                }
            }
        }
        .contentMargins(.bottom, PsyCardsSpacing.xl, for: .scrollContent)
        .scrollIndicators(.hidden)
        // The pinned headers already separate the grid from the status bar.
        .scrollEdgeEffectHidden(true, for: .top)
        .onScrollGeometryChange(for: ScrollGeometry.self) { $0 } action: { _, geometry in
            offset = CGPoint(
                x: geometry.contentOffset.x + geometry.contentInsets.leading,
                y: geometry.contentOffset.y + geometry.contentInsets.top
            )
            viewportWidth = geometry.containerSize.width
        }
        .simultaneousGesture(
            MagnifyGesture()
                .onChanged { value in
                    let base = pinchBase ?? scale
                    pinchBase = base
                    scale = min(1.8, max(0.6, base * value.magnification))
                }
                .onEnded { _ in pinchBase = nil }
        )
        // Same ink as the headers, so bouncing past any edge never reveals
        // a different surface.
        .background(PsyCardsColors.ink.ignoresSafeArea())
        // Keeps the status bar legible over cells scrolling under it.
        .safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background(PsyCardsColors.ink.ignoresSafeArea(edges: .top))
        }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(item: $selectedPair) { pair in
            ComboPairSheet(pair: pair)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
        .floatingCard(item: $selectedSubstance, zoomNamespace: deckZoom, sourceID: presentedSourceID)
        .onChange(of: selectedSubstance) { _, substance in
            guard substance == nil, pulledID != nil else { return }
            // Let the card zoom back first, then drop it onto its deck.
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(reduceMotion ? 0 : 380))
                withAnimation(reduceMotion ? nil : .spring(response: 0.34, dampingFraction: 0.58)) {
                    pulledID = nil
                }
            }
        }
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.75), trigger: pulledID) { _, new in new != nil }
        .sensoryFeedback(.impact(flexibility: .rigid, intensity: 0.4), trigger: pulledID) { old, new in old != nil && new == nil }
    }

    // MARK: Headers

    private var headerBackground: some View {
        Rectangle().fill(PsyCardsColors.ink)
    }

    private var columnHeaders: some View {
        HStack(spacing: 0) {
            ForEach(columns) { column in
                headerButton(column, axis: .column, slot: CGSize(width: cellSize, height: columnHeaderHeight)) {
                    // Single words shrink onto one line rather than breaking
                    // mid-word; names with spaces or hyphens use two.
                    let isOneWord = !column.label.contains(where: { $0 == " " || $0 == "-" || $0 == "/" })
                    Text(column.label)
                        .font(.system(size: 10, weight: .heavy))
                        .lineLimit(isOneWord ? 1 : 2)
                        .minimumScaleFactor(isOneWord ? 0.6 : 0.8)
                        .allowsTightening(true)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 3)
                }
            }
        }
        .background(headerBackground)
    }

    private var rowHeaders: some View {
        VStack(spacing: 0) {
            ForEach(columns) { row in
                headerButton(row, axis: .row, slot: CGSize(width: rowHeaderWidth, height: cellSize)) {
                    Text(row.label)
                        .font(.caption2.weight(.heavy))
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .padding(.leading, 9)
                        .padding(.trailing, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .background(headerBackground)
    }

    private func headerButton<Label: View>(
        _ column: ComboColumn,
        axis: StackAxis,
        slot: CGSize,
        @ViewBuilder label: () -> Label
    ) -> some View {
        let id = "\(axis == .row ? "row" : "col")-\(column.key)"
        return Button {
            pull(column, id: id)
        } label: {
            StackCard(
                axis: axis,
                hue: PsyCardsColors.group(column.group),
                slot: slot,
                extends: column.key != columns.last?.key,
                pulled: pulledID == id,
                zoomID: id,
                zoomNamespace: deckZoom,
                label: label
            )
        }
        .buttonStyle(StackPressStyle())
        // A pulled card comes out over the one that covered it.
        .zIndex(pulledID == id ? 1 : 0)
        .accessibilityLabel(column.label)
        .accessibilityHint(store.t("search.substanceCard"))
    }

    /// Lifts the header card off its deck, then zooms it into the card.
    private func pull(_ column: ComboColumn, id: String) {
        guard selectedSubstance == nil, let substance = store.substance(key: column.key) else { return }
        presentedSourceID = id
        withAnimation(reduceMotion ? nil : .spring(response: 0.22, dampingFraction: 0.72)) {
            pulledID = id
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 0 : 140))
            selectedSubstance = substance
        }
    }

    // MARK: Legend

    private func legendView(_ legend: [StatusDefinition]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(store.t("legend.ariaLabel"))
                .font(.footnote.weight(.heavy))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(PsyCardsColors.fgMute)
                .accessibilityAddTraits(.isHeader)
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(legend) { item in
                    Label {
                        Text(item.label)
                    } icon: {
                        StatusIcon(name: item.icon, size: 14)
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .glassEffect(
                        .regular.tint(PsyCardsColors.status(item.statusKey).opacity(0.35)),
                        in: .capsule
                    )
                }
            }
        }
    }
}

/// A substance header as one card of its axis' stack (web `ComboTable.astro`
/// `.stack`): solid category colour with ink text. The card runs under the
/// next one (rows: down, columns: right), whose shadow falls back on it;
/// `pulled` lifts it up out of the stack.
private enum StackAxis { case row, column }

private struct StackCard<Label: View>: View {
    let axis: StackAxis
    let hue: Color
    /// The cell the card occupies; the card itself extends past it.
    let slot: CGSize
    let extends: Bool
    let pulled: Bool
    let zoomID: String
    let zoomNamespace: Namespace.ID
    @ViewBuilder let label: Label

    private let radius: CGFloat = 8
    /// Room left above column cards so they can slide up.
    private let columnHeadroom: CGFloat = 5

    private var overlap: CGFloat {
        guard extends else { return 0 }
        return axis == .row ? (slot.height * 0.5).rounded() : (slot.width * 0.4).rounded()
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        let visible = axis == .row
            ? CGSize(width: slot.width - 4, height: slot.height)
            : CGSize(width: slot.width, height: slot.height - columnHeadroom)
        label
            .foregroundStyle(PsyCardsColors.ink)
            .frame(width: visible.width, height: visible.height)
            .padding(.bottom, axis == .row ? overlap : 0)
            .padding(.trailing, axis == .column ? overlap : 0)
            .background {
                shape.fill(
                    LinearGradient(
                        colors: [hue.mix(with: .white, by: 0.06), hue, hue.mix(with: .black, by: 0.08)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
            }
            .overlay {
                shape.strokeBorder(
                    LinearGradient(colors: [.white.opacity(0.38), .clear], startPoint: .topLeading, endPoint: .center),
                    lineWidth: 1
                )
            }
            .clipShape(shape)
            .matchedTransitionSource(id: zoomID, in: zoomNamespace) { source in
                source.clipShape(shape)
            }
            .shadow(
                color: .black.opacity(pulled ? 0.6 : 0.5),
                radius: pulled ? 8 : 3,
                x: axis == .column ? -2 : 0,
                y: axis == .row ? -2 : (pulled ? 5 : 0)
            )
            .offset(y: (axis == .column ? columnHeadroom : 0) + (pulled ? -7 : 0))
            .frame(width: slot.width, height: slot.height, alignment: .topLeading)
            .contentShape(.rect)
    }
}

/// Pressing a stack card lifts it slightly.
private struct StackPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(y: configuration.isPressed ? -4 : 0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// The interaction cells. Equatable on its inputs so the per-frame scroll
/// offset that moves the pinned headers never re-renders the whole grid.
private struct ComboGrid: View, Equatable {
    @Environment(DataPackStore.self) private var store
    let columns: [ComboColumn]
    let cellSize: CGFloat
    let onSelect: (ComboColumn, ComboColumn) -> Void

    nonisolated static func == (lhs: ComboGrid, rhs: ComboGrid) -> Bool {
        lhs.columns == rhs.columns && lhs.cellSize == rhs.cellSize
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(columns) { row in
                HStack(spacing: 0) {
                    ForEach(columns) { col in
                        cellView(row: row, col: col)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func cellView(row: ComboColumn, col: ComboColumn) -> some View {
        let inner = cellSize - 4
        if row.key == col.key {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(PsyCardsColors.ink3)
                .frame(width: inner, height: inner)
                .padding(2)
        } else if let cell = store.interaction(a: row.key, b: col.key) {
            Button {
                onSelect(row, col)
            } label: {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(PsyCardsColors.status(cell.statusKey).opacity(0.9))
                    .frame(width: inner, height: inner)
                    .overlay {
                        StatusIcon(name: cell.icon, size: min(18, inner * 0.4))
                            .foregroundStyle(PsyCardsColors.ink(onStatus: cell.statusKey))
                    }
                    .padding(2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(row.label) + \(col.label): \(cell.label)")
        } else {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(PsyCardsColors.ink3, lineWidth: 1)
                .frame(width: inner, height: inner)
                .padding(2)
        }
    }
}

struct ComboPairSheet: View {
    @Environment(DataPackStore.self) private var store
    let pair: ComboPair

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: PsyCardsSpacing.l) {
                    HStack(spacing: 12) {
                        substanceChip(key: pair.a)
                        Image(systemName: "plus")
                            .foregroundStyle(PsyCardsColors.fgMute)
                        substanceChip(key: pair.b)
                    }

                    HStack(spacing: 10) {
                        StatusIcon(name: pair.icon, size: 24)
                        Text(pair.label)
                            .font(.title2.bold())
                    }
                    .foregroundStyle(PsyCardsColors.status(pair.statusKey))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        LinearGradient(
                            colors: [
                                PsyCardsColors.status(pair.statusKey).opacity(0.24),
                                PsyCardsColors.status(pair.statusKey).opacity(0.08),
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        in: .rect(cornerRadius: PsyCardsRadius.m)
                    )

                    Text(pair.definition)
                        .foregroundStyle(PsyCardsColors.fg)

                    if let note = pair.note, !note.isEmpty {
                        Text(note)
                            .foregroundStyle(PsyCardsColors.fgMute)
                    }

                    if !pair.sources.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(store.t("comboCard.sources"))
                                .font(.headline)
                            ForEach(Array(pair.sources.enumerated()), id: \.offset) { _, source in
                                Link(destination: URL(string: source.url) ?? URL(string: "https://tripsit.me")!) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(source.title)
                                            .font(.subheadline.weight(.semibold))
                                        Text(source.author)
                                            .font(.caption)
                                            .foregroundStyle(PsyCardsColors.fgMute)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(PsyCardsSpacing.l)
            }
            .navigationTitle(store.t("landing.navCombos"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private func substanceChip(key: String) -> some View {
        if let substance = store.substance(key: key) {
            NavigationLink {
                SubstanceDetailView(substance: substance)
            } label: {
                chipLabel(
                    substance.prettyName,
                    color: PsyCardsColors.group(substance.group),
                    symbol: PsyCardsColors.groupSymbol(substance.group),
                    isLink: true
                )
            }
            .buttonStyle(.plain)
        } else {
            chipLabel(key, color: PsyCardsColors.fgMute, symbol: nil, isLink: false)
        }
    }

    private func chipLabel(_ title: String, color: Color, symbol: String?, isLink: Bool) -> some View {
        HStack(spacing: 6) {
            if let symbol {
                Image(systemName: symbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(color)
            }
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(PsyCardsColors.fg)
            if isLink {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .glassEffect(
            isLink ? .regular.tint(color.opacity(0.2)).interactive() : .regular,
            in: .capsule
        )
    }
}
