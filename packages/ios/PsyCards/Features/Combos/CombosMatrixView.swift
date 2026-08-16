import SwiftUI

struct CombosMatrixView: View {
    @Environment(DataPackStore.self) private var store
    @State private var selectedPair: ComboPair?
    @State private var selectedSubstance: Substance?
    @State private var scale: CGFloat = 1
    @State private var query = ""

    private let cellSize: CGFloat = 44
    private let labelWidth: CGFloat = 92

    private var columns: [ComboColumn] {
        guard let columns = store.combosPack?.columns else { return [] }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return columns }
        return columns.filter { $0.label.lowercased().contains(trimmed) || $0.key.lowercased().contains(trimmed) }
    }

    var body: some View {
        VStack(spacing: 0) {
            if let legend = store.combosPack?.legend {
                legendBar(legend)
            }
            ScrollView([.horizontal, .vertical]) {
                matrix
                    .scaleEffect(scale, anchor: .topLeading)
                    .frame(
                        width: labelWidth + CGFloat(columns.count) * cellSize * scale,
                        height: labelWidth + CGFloat(columns.count) * cellSize * scale,
                        alignment: .topLeading
                    )
                    .padding(PsyCardsSpacing.m)
            }
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { value in
                        scale = min(1.8, max(0.55, value.magnification))
                    }
            )
        }
        .background {
            PsyCardsBackground(accent: PsyCardsColors.synergy)
        }
        .navigationTitle(String(localized: "landing.navCombos"))
        .searchable(text: $query, prompt: String(localized: "comboTable.search"))
        .sheet(item: $selectedPair) { pair in
            ComboPairSheet(pair: pair)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
        .sheet(item: $selectedSubstance) { substance in
            NavigationStack {
                SubstanceDetailView(substance: substance)
            }
            .psyCardsSheetPresentation()
        }
    }

    private var matrix: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                Color.clear.frame(width: labelWidth, height: labelWidth)
                ForEach(columns) { column in
                    Text(column.label)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(PsyCardsColors.group(column.group))
                        .frame(width: cellSize, height: labelWidth)
                        .rotationEffect(.degrees(-60))
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
            }
            ForEach(columns) { row in
                HStack(spacing: 0) {
                    Button {
                        selectedSubstance = store.substance(key: row.key)
                    } label: {
                        Text(row.label)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(PsyCardsColors.group(row.group))
                            .frame(width: labelWidth, height: cellSize, alignment: .leading)
                            .lineLimit(2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the substance card")
                    ForEach(columns) { col in
                        cellView(row: row, col: col)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func cellView(row: ComboColumn, col: ComboColumn) -> some View {
        if row.key == col.key {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(PsyCardsColors.ink3)
                .frame(width: cellSize - 4, height: cellSize - 4)
                .padding(2)
        } else if let cell = store.interaction(a: row.key, b: col.key) {
            Button {
                selectedPair = store.pair(a: row.key, b: col.key)
            } label: {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(PsyCardsColors.status(cell.statusKey).opacity(0.9))
                    .frame(width: cellSize - 4, height: cellSize - 4)
                    .overlay {
                        Image(systemName: PsyCardsColors.statusSymbol(cell.icon))
                            .font(.system(size: 14, weight: .bold))
                            .foregroundStyle(.white.opacity(0.95))
                    }
                    .padding(2)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(row.label) + \(col.label): \(cell.label)")
        } else {
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(PsyCardsColors.ink3, lineWidth: 1)
                .frame(width: cellSize - 4, height: cellSize - 4)
                .padding(2)
        }
    }

    private func legendBar(_ legend: [StatusDefinition]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(legend) { item in
                    Label(item.label, systemImage: PsyCardsColors.statusSymbol(item.icon))
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .glassEffect(
                            .regular.tint(PsyCardsColors.status(item.statusKey).opacity(0.35)),
                            in: .capsule
                        )
                }
            }
            .padding(.horizontal, PsyCardsSpacing.m)
            .padding(.vertical, PsyCardsSpacing.s)
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
                        Image(systemName: PsyCardsColors.statusSymbol(pair.icon))
                            .font(.title3.weight(.bold))
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
                            Text(String(localized: "comboCard.sources"))
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
            .navigationTitle(String(localized: "landing.navCombos"))
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
