import SwiftUI

enum AppTab: Hashable {
    case substances
    case combos
    case about
}

struct AppShell: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedTab: AppTab = .substances
    @State private var selectedSubstanceKey: String?
    @State private var floatingSubstance: Substance?
    @State private var showsWheel = false
    @Namespace private var cardZoom

    var body: some View {
        Group {
            if store.loadError != nil {
                ContentUnavailableView(
                    "Data pack missing",
                    systemImage: "exclamationmark.triangle",
                    description: Text(store.loadError ?? "Run pnpm datapack")
                )
            } else {
                TabView(selection: $selectedTab) {
                    Tab(store.t("landing.navList"), systemImage: "rectangle.portrait.on.rectangle.portrait.angled.fill", value: AppTab.substances) {
                        substancesTab
                    }
                    Tab(store.t("landing.navCombos"), systemImage: "square.grid.3x3.fill", value: AppTab.combos) {
                        NavigationStack {
                            CombosMatrixView()
                        }
                    }
                    Tab(store.t("categoryNav.settings"), systemImage: "gearshape.fill", value: AppTab.about) {
                        NavigationStack {
                            AboutView()
                        }
                    }
                }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .background(PsyCardsColors.ink.ignoresSafeArea())
        .tint(PsyCardsColors.fg)
        .onOpenURL(perform: open)
    }

    private var usesSplitList: Bool {
        horizontalSizeClass == .regular
    }

    private var substancesTab: some View {
        substancesList
            .fullScreenCover(isPresented: $showsWheel) {
                WheelOverlay(selectedKey: $selectedSubstanceKey, isPresented: $showsWheel)
                    .presentationBackground(.clear)
            }
            .sensoryFeedback(.impact(weight: .medium), trigger: showsWheel) { _, shown in shown }
    }

    /// Long-pressing the list brings up the wheel; it fades in by itself.
    private func showWheel() {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { showsWheel = true }
    }

    @ViewBuilder
    private var substancesList: some View {
        if usesSplitList {
            NavigationSplitView {
                SubstanceListView(
                    selectedKey: $selectedSubstanceKey,
                    onLongPress: showWheel
                )
                .navigationSplitViewColumnWidth(min: 320, ideal: 400, max: 520)
            } detail: {
                if let key = selectedSubstanceKey, let substance = store.substance(key: key) {
                    NavigationStack {
                        SubstanceDetailView(substance: substance)
                    }
                } else {
                    ContentUnavailableView(
                        store.t("landing.navList"),
                        systemImage: "rectangle.portrait.on.rectangle.portrait.angled",
                        description: Text(store.t("search.substanceCard"))
                    )
                }
            }
            .navigationSplitViewStyle(.balanced)
            .onAppear(perform: selectDefaultSubstanceIfNeeded)
        } else {
            NavigationStack {
                SubstanceListView(
                    selectedKey: $selectedSubstanceKey,
                    zoomNamespace: cardZoom,
                    onChoose: { key in
                        // The finger lifting after a long press is not a tap.
                        guard !showsWheel else { return }
                        floatingSubstance = store.substance(key: key)
                    },
                    onLongPress: showWheel
                )
            }
            .floatingCard(item: $floatingSubstance, zoomNamespace: cardZoom)
        }
    }

    /// `psycards://<slug>` opens a card, mirroring the web's `psy.cards/<slug>`
    /// (and `/<locale>/<slug>`), so printed QR codes can deep-link into the app.
    private func open(_ url: URL) {
        let parts = ([url.host()] + url.pathComponents)
            .compactMap { $0 }
            .filter { $0 != "/" && !$0.isEmpty }
        var remaining = parts[...]
        if let first = remaining.first, store.supportedLocales.contains(first) {
            store.setLocale(first)
            remaining = remaining.dropFirst()
        }
        if remaining.first == "card" { remaining = remaining.dropFirst() }
        if remaining.first == "combos" {
            selectedTab = .combos
            return
        }
        if remaining.first == "wheel" {
            selectedTab = .substances
            showWheel()
            return
        }
        guard let slug = remaining.first, let substance = store.substance(slug: slug) else { return }
        selectedTab = .substances
        selectedSubstanceKey = substance.key
        if !usesSplitList {
            floatingSubstance = substance
        }
    }

    private func selectDefaultSubstanceIfNeeded() {
        guard selectedSubstanceKey == nil else { return }
        selectedSubstanceKey = store.substances.first?.key
    }
}
