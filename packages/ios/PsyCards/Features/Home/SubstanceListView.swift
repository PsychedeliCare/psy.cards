import SwiftUI

struct SubstanceListView: View {
    @Environment(DataPackStore.self) private var store
    @Binding var selectedKey: String?
    /// Rows become zoom sources for the floating card when given.
    var zoomNamespace: Namespace.ID? = nil
    var onChoose: ((String) -> Void)? = nil
    var onLongPress: (() -> Void)? = nil
    @State private var query = ""
    @State private var selectedGroup: String? = nil
    @FocusState private var searchFocused: Bool

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
            VStack(alignment: .leading, spacing: PsyCardsSpacing.m) {
                header
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(grouped, id: \.group) { section in
                        Section {
                            ForEach(section.items) { substance in
                                Button {
                                    selectedKey = substance.key
                                    onChoose?(substance.key)
                                } label: {
                                    SubstanceRow(substance: substance, isSelected: selectedKey == substance.key)
                                        .zoomSource(id: substance.key, in: zoomNamespace)
                                }
                                .buttonStyle(RowPressStyle())
                                .accessibilityIdentifier("row-\(substance.slug)")
                            }
                        } header: {
                            sectionHeader(section.group)
                        }
                    }
                }
                if grouped.isEmpty {
                    ContentUnavailableView.search(text: query)
                        .padding(.top, 40)
                }
            }
            .padding(.horizontal, PsyCardsSpacing.m)
            .padding(.bottom, 100)
        }
        .scrollDismissesKeyboard(.immediately)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.45)
                .onEnded { _ in onLongPress?() },
            isEnabled: onLongPress != nil
        )
        .accessibilityAction(named: Text(store.t("dial.ariaLabel"))) { onLongPress?() }
        .background {
            PsyCardsBackground(accent: PsyCardsColors.group(selectedGroup ?? "dissociative"))
                .animation(.smooth, value: selectedGroup)
        }
        .navigationTitle("psy.cards")
        .toolbar(.hidden, for: .navigationBar)
        // Brand, search and filters float over the list on its own
        // background; cards scrolling under them fade out softly.
        .safeAreaBar(edge: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 14) {
                brandBar
                    .padding(.horizontal, PsyCardsSpacing.m)
                searchField
                    .padding(.horizontal, PsyCardsSpacing.m)
                groupChips
            }
            .padding(.top, 8)
        }
        .scrollEdgeEffectStyle(.soft, for: .top)
    }

    private var brandBar: some View {
        HStack(spacing: 10) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 34, height: 34)
                .clipShape(.rect(cornerRadius: 8, style: .continuous))
                .shadow(color: .black.opacity(0.35), radius: 6, y: 2)
                .accessibilityHidden(true)
            Text("psy.cards")
                .font(.title2.weight(.heavy))
                .foregroundStyle(PsyCardsColors.fg)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.body.weight(.semibold))
                .foregroundStyle(PsyCardsColors.fgMute)
            TextField(store.t("search.placeholder"), text: $query)
                .focused($searchFocused)
                .textFieldStyle(.plain)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .foregroundStyle(PsyCardsColors.fg)
                .accessibilityIdentifier("search")
            if !query.isEmpty {
                Button {
                    query = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(PsyCardsColors.fgMute)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(store.t("layout.close"))
                .accessibilityIdentifier("search-clear")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .contentShape(.capsule)
        .onTapGesture { searchFocused = true }
        .glassEffect(.regular.interactive(), in: .capsule)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: PsyCardsSpacing.s) {
            Text(store.t("landing.title"))
                .font(.largeTitle.bold())
                .foregroundStyle(PsyCardsColors.fg)
            Text(store.t("landing.lede"))
                .font(.body)
                .foregroundStyle(PsyCardsColors.fgMute)
        }
        .padding(.top, PsyCardsSpacing.s)
    }

    private func sectionHeader(_ group: String) -> some View {
        HStack(spacing: 8) {
            Capsule()
                .fill(PsyCardsColors.group(group))
                .frame(width: 14, height: 4)
            Text(store.groupLabel(group))
                .font(.footnote.weight(.heavy))
                .tracking(1.1)
                .textCase(.uppercase)
                .foregroundStyle(PsyCardsColors.group(group))
            Spacer()
        }
        .padding(.top, 14)
        .padding(.bottom, 4)
        .accessibilityAddTraits(.isHeader)
    }

    private var groupChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            GlassEffectContainer(spacing: 6) {
                HStack(spacing: 6) {
                    chip(title: store.t("landing.tabAll"), group: nil)
                    ForEach(store.groups, id: \.self) { group in
                        chip(title: store.groupLabel(group), group: group)
                    }
                }
                .padding(.horizontal, PsyCardsSpacing.m)
                .padding(.bottom, 8)
            }
        }
        .accessibilityLabel(store.t("categoryNav.ariaLabel"))
    }

    private func chip(title: String, group: String?) -> some View {
        let selected = selectedGroup == group
        return Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                selectedGroup = group
            }
        } label: {
            VStack(spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(selected ? PsyCardsColors.ink : PsyCardsColors.fg)
                if let group {
                    Capsule()
                        .fill(selected ? PsyCardsColors.ink.opacity(0.5) : PsyCardsColors.group(group))
                        .frame(height: 3)
                }
            }
            .fixedSize()
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .glassEffect(
            selected ? .regular.tint(group.map(PsyCardsColors.group) ?? PsyCardsColors.fg).interactive() : .regular.interactive(),
            in: .capsule
        )
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

private extension View {
    @ViewBuilder
    func zoomSource(id: String, in namespace: Namespace.ID?) -> some View {
        if let namespace {
            matchedTransitionSource(id: id, in: namespace) { $0.clipShape(.rect(cornerRadius: 18, style: .continuous)) }
        } else {
            self
        }
    }
}

private struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// List card (web `SubstanceListCard.astro`): name, a few aliases, timing
/// and the common oral dose, with the molecule as a faded watermark.
struct SubstanceRow: View {
    @Environment(DataPackStore.self) private var store
    let substance: Substance
    var isSelected: Bool = false

    var body: some View {
        let hue = PsyCardsColors.group(substance.group)
        VStack(alignment: .leading, spacing: 8) {
            Text(substance.prettyName)
                .font(.title3.weight(.heavy))
                .foregroundStyle(PsyCardsColors.fg)
            if !substance.listAliases.isEmpty {
                HStack(spacing: 5) {
                    ForEach(substance.listAliases, id: \.self) { alias in
                        Text(alias)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(PsyCardsColors.inkSoft)
                            .lineLimit(1)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(PsyCardsColors.fg.opacity(0.08), in: .rect(cornerRadius: 6, style: .continuous))
                    }
                }
            }
            if !substance.listMeta.isEmpty {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 14) { metaItems }
                    VStack(alignment: .leading, spacing: 4) { metaItems }
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .trailing) {
            if let info = substance.molecule {
                Image(info.assetName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 130, height: 130)
                    .opacity(0.16)
                    .offset(x: 18)
                    .accessibilityHidden(true)
            }
        }
        .background {
            LinearGradient(
                colors: [hue.opacity(isSelected ? 0.3 : 0.1), hue.opacity(isSelected ? 0.12 : 0.02)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
        .background(PsyCardsColors.ink2.opacity(0.75))
        .clipShape(.rect(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(isSelected ? hue.opacity(0.6) : PsyCardsColors.fg.opacity(0.1), lineWidth: 1)
        }
        .contentShape(.rect(cornerRadius: 18))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    @ViewBuilder
    private var metaItems: some View {
        if let onset = substance.listMeta.onset {
            meta(icon: "timer", text: onset, label: store.t("substanceCard.onset"))
        }
        if let duration = substance.listMeta.duration {
            meta(icon: "hourglass-medium", text: duration, label: store.t("substanceCard.duration"))
        }
        if let dose = substance.listMeta.commonDose {
            meta(icon: "pill", text: dose, label: store.t("doseChart.common"))
        }
    }

    private func meta(icon: String, text: String, label: String) -> some View {
        HStack(spacing: 4) {
            PhIcon(icon, size: 14)
                .foregroundStyle(PsyCardsColors.fgMute)
            Text(text)
                .font(.footnote.weight(.bold))
                .foregroundStyle(PsyCardsColors.fg)
                .lineLimit(1)
        }
        .fixedSize()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(text)")
    }
}
