import SwiftUI

@main
struct PsyCardsApp: App {
    @State private var store = DataPackStore()

    var body: some Scene {
        WindowGroup {
            AppShell()
                .environment(store)
                .preferredColorScheme(.dark)
        }
    }
}
