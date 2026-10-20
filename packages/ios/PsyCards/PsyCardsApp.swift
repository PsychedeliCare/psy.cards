import SwiftUI

@main
struct PsyCardsApp: App {
    @State private var store = DataPackStore()
    @State private var bodyProfile = BodyProfileStore()
    @State private var localInfo = LocalInfoStore()

    var body: some Scene {
        WindowGroup {
            AppShell()
                .environment(store)
                .environment(bodyProfile)
                .environment(localInfo)
                .environment(\.locale, store.swiftLocale)
                .preferredColorScheme(.dark)
        }
    }
}
