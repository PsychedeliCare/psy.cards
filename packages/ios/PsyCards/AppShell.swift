import SwiftUI

enum AppTab: Hashable {
    case substances
    case combos
    case wheel
    case about
}

struct AppShell: View {
    @Environment(DataPackStore.self) private var store
    @State private var selectedTab: AppTab = .substances
    @State private var selectedSubstanceKey: String?

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
                    substancesTab
                        .tabItem { Label(String(localized: "landing.navList"), systemImage: "pills") }
                        .tag(AppTab.substances)

                    NavigationStack {
                        CombosMatrixView()
                    }
                    .tabItem { Label(String(localized: "landing.navCombos"), systemImage: "square.grid.3x3.fill") }
                    .tag(AppTab.combos)

                    NavigationStack {
                        WheelView()
                    }
                    .tabItem { Label(String(localized: "dial.ariaLabel"), systemImage: "circle.dotted") }
                    .tag(AppTab.wheel)

                    NavigationStack {
                        AboutView()
                    }
                    .tabItem { Label(String(localized: "categoryNav.settings"), systemImage: "info.circle") }
                    .tag(AppTab.about)
                }
            }
        }
        .background(PsyCardsColors.ink.ignoresSafeArea())
        .tint(PsyCardsColors.safe)
    }

    @ViewBuilder
    private var substancesTab: some View {
        if UIDevice.current.userInterfaceIdiom == .pad {
            NavigationSplitView {
                SubstanceListView(selectedKey: $selectedSubstanceKey)
            } detail: {
                if let key = selectedSubstanceKey, let substance = store.substance(key: key) {
                    NavigationStack {
                        SubstanceDetailView(substance: substance)
                    }
                } else {
                    ContentUnavailableView(
                        String(localized: "landing.navList"),
                        systemImage: "pills",
                        description: Text("Pick a substance to open its card.")
                    )
                }
            }
        } else {
            NavigationStack {
                SubstanceListView(selectedKey: $selectedSubstanceKey)
                    .navigationDestination(isPresented: Binding(
                        get: { selectedSubstanceKey != nil },
                        set: { if !$0 { selectedSubstanceKey = nil } }
                    )) {
                        if let key = selectedSubstanceKey, let substance = store.substance(key: key) {
                            SubstanceDetailView(substance: substance)
                        }
                    }
            }
        }
    }
}
