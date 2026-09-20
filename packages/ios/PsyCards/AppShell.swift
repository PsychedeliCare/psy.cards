import SwiftUI

enum AppTab: Hashable {
    case substances
    case combos
    case about
}

enum SubstanceBrowseMode: String {
    case list
    case wheel
}

struct SubstanceBrowsePicker: View {
    @Binding var mode: SubstanceBrowseMode

    var body: some View {
        Picker(String(localized: "landing.browseSwitchAria"), selection: $mode) {
            Text(String(localized: "landing.viewList")).tag(SubstanceBrowseMode.list)
            Text(String(localized: "landing.viewWheel")).tag(SubstanceBrowseMode.wheel)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(maxWidth: 220)
        .accessibilityLabel(Text(String(localized: "landing.browseSwitchAria")))
    }
}

struct AppShell: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedTab: AppTab = .substances
    @State private var selectedSubstanceKey: String?
    @State private var listPath: [String] = []
    @AppStorage("substances.browseMode") private var browseMode = SubstanceBrowseMode.list

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
                    Tab("landing.navList", systemImage: "pills", value: AppTab.substances) {
                        substancesTab
                    }
                    Tab("landing.navCombos", systemImage: "square.grid.3x3.fill", value: AppTab.combos) {
                        NavigationStack {
                            CombosMatrixView()
                        }
                    }
                    Tab("categoryNav.settings", systemImage: "info.circle", value: AppTab.about) {
                        NavigationStack {
                            AboutView()
                        }
                    }
                }
            }
        }
        .background(PsyCardsColors.ink.ignoresSafeArea())
        .tint(PsyCardsColors.safe)
        .onChange(of: browseMode) { _, mode in
            if mode != .list {
                listPath = []
            } else if horizontalSizeClass == .regular {
                selectDefaultSubstanceIfNeeded()
            }
        }
    }

    private var usesSplitList: Bool {
        horizontalSizeClass == .regular && browseMode == .list
    }

    @ViewBuilder
    private var substancesTab: some View {
        switch browseMode {
        case .wheel:
            NavigationStack {
                WheelView(selectedKey: $selectedSubstanceKey, browseMode: $browseMode)
            }
        case .list:
            if usesSplitList {
                NavigationSplitView {
                    SubstanceListView(
                        selectedKey: $selectedSubstanceKey,
                        browseMode: $browseMode
                    )
                    .navigationSplitViewColumnWidth(min: 320, ideal: 400, max: 520)
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
                .navigationSplitViewStyle(.balanced)
                .onAppear(perform: selectDefaultSubstanceIfNeeded)
            } else {
                NavigationStack(path: $listPath) {
                    SubstanceListView(
                        selectedKey: $selectedSubstanceKey,
                        browseMode: $browseMode,
                        onChoose: { listPath = [$0] }
                    )
                    .navigationDestination(for: String.self) { key in
                        if let substance = store.substance(key: key) {
                            SubstanceDetailView(substance: substance)
                        }
                    }
                }
            }
        }
    }

    private func selectDefaultSubstanceIfNeeded() {
        guard selectedSubstanceKey == nil else { return }
        selectedSubstanceKey = store.substances.first?.key
    }
}
