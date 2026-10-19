import SwiftUI

@main
struct PsyCardsApp: App {
    @State private var store = DataPackStore()
    @State private var bodyProfile = BodyProfileStore()

    var body: some Scene {
        WindowGroup {
            AppShell()
                .environment(store)
                .environment(bodyProfile)
                .environment(\.locale, store.swiftLocale)
                .preferredColorScheme(.dark)
        }
    }
}
