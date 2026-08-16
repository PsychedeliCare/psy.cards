import SwiftUI

struct SubstanceListView: View {
    @Environment(DataPackStore.self) private var store
    @Binding var selectedKey: String?
    @State private var query = ""
    @State private var selectedGroup: String? = nil

    private var filtered: [Substance] {
        let base = store.search(query)
        guard let selectedGroup else { return base }
        return base.filter { $0.group == selectedGroup }
    }

    private var grouped: [(group: String, items: [Substance])] {
        store.groups.compactMap { group in
            let items = filtered.filter { $0.group == group }
            guard !items.isEmpty else { return nil }
            return (group, items)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PsyCardsSpacing.l) {
                header
                groupChips
                LazyVStack(spacing: PsyCardsSpacing.s) {
                    ForEach(grouped, id: \.group) { section in
                        Text(store.groupLabel(section.group))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(PsyCardsColors.group(section.group))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, PsyCardsSpacing.s)

                        ForEach(section.items) { substance in
                            Button {
                                selectedKey = substance.key
                            } label: {
                                SubstanceRow(substance: substance, isSelected: selectedKey == substance.key)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, PsyCardsSpacing.m)
            .padding(.bottom, 100)
        }
        .background {
            PsyCardsBackground(accent: PsyCardsColors.group(selectedGroup ?? "dissociative"))
        }
        .navigationTitle("psy.cards")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                PsyCardsBrandLabel()
            }
        }
        .searchable(text: $query, prompt: String(localized: "comboTable.search"))
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PsyCardsSpacing.s) {
            Text(String(localized: "landing.title"))
                .font(.largeTitle.bold())
                .foregroundStyle(PsyCardsColors.fg)
            Text(String(localized: "landing.lede"))
                .font(.body)
                .foregroundStyle(PsyCardsColors.fgMute)
        }
        .padding(.top, PsyCardsSpacing.s)
    }

    private var groupChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PsyCardsSpacing.xs) {
                chip(title: String(localized: "landing.tabAll"), group: nil)
                ForEach(store.groups, id: \.self) { group in
                    chip(title: store.groupLabel(group), group: group)
                }
            }
        }
    }

    private func chip(title: String, group: String?) -> some View {
        let selected = selectedGroup == group
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                selectedGroup = group
            }
        } label: {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .foregroundStyle(selected ? PsyCardsColors.ink : PsyCardsColors.fg)
        }
        .glassEffect(
            selected
                ? .regular.tint(PsyCardsColors.group(group ?? "stimulant")).interactive()
                : .regular.interactive(),
            in: .capsule
        )
    }
}

struct SubstanceRow: View {
    let substance: Substance
    var isSelected: Bool = false
    @ScaledMetric(relativeTo: .title) private var moleculeSize: CGFloat = 84

    var body: some View {
        HStack(spacing: PsyCardsSpacing.m) {
            molecule
            VStack(alignment: .leading, spacing: 4) {
                Text(substance.prettyName)
                    .font(.headline)
                    .foregroundStyle(PsyCardsColors.fg)
                if let summary = substance.summary {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(PsyCardsColors.fgMute)
                        .lineLimit(2)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(PsyCardsColors.fgMute)
        }
        .padding(PsyCardsSpacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassEffect(
            isSelected
                ? .regular.tint(PsyCardsColors.group(substance.group).opacity(0.35)).interactive()
                : .regular.interactive(),
            in: .rect(cornerRadius: PsyCardsRadius.m)
        )
    }

    @ViewBuilder
    private var molecule: some View {
        if let info = substance.molecule {
            Image(info.assetName)
                .resizable()
                .scaledToFit()
                .frame(width: moleculeSize, height: moleculeSize)
                .padding(8)
                .background(
                    PsyCardsColors.group(substance.group).opacity(0.16),
                    in: .rect(cornerRadius: 20, style: .continuous)
                )
                .accessibilityHidden(true)
        } else {
            Image(systemName: PsyCardsColors.groupSymbol(substance.group))
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: moleculeSize, height: moleculeSize)
                .background(
                    PsyCardsColors.groupGradient(substance.group),
                    in: .rect(cornerRadius: 20, style: .continuous)
                )
                .accessibilityHidden(true)
        }
    }
}
