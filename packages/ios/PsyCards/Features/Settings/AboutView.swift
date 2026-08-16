import SwiftUI

struct AboutView: View {
    @Environment(DataPackStore.self) private var store

    var body: some View {
        List {
            Section {
                Text(store.meta?.siteTitle ?? "psy.cards")
                    .font(.largeTitle.bold())
                    .listRowBackground(Color.clear)
                Text(store.meta?.siteDescription ?? "")
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .listRowBackground(Color.clear)
            }

            Section(String(localized: "layout.language")) {
                ForEach(store.supportedLocales, id: \.self) { locale in
                    Button {
                        store.setLocale(locale)
                    } label: {
                        HStack {
                            Text(localeLabel(locale))
                            Spacer()
                            if store.locale == locale {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(PsyCardsColors.safe)
                            }
                        }
                    }
                    .foregroundStyle(PsyCardsColors.fg)
                }
            }

            if let legend = store.combosPack?.legend {
                Section(String(localized: "legend.ariaLabel")) {
                    ForEach(legend) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Label(item.label, systemImage: "circle.fill")
                                .foregroundStyle(PsyCardsColors.status(item.statusKey))
                                .font(.subheadline.weight(.semibold))
                            Text(item.definition)
                                .font(.footnote)
                                .foregroundStyle(PsyCardsColors.fgMute)
                        }
                    }
                }
            }

            Section(String(localized: "acknowledgements.title")) {
                Text(store.meta?.about ?? "")
                    .font(.footnote)
                    .foregroundStyle(PsyCardsColors.fgMute)
                Link("TripSit", destination: URL(string: "https://tripsit.me")!)
                Link("PsychonautWiki", destination: URL(string: "https://psychonautwiki.org")!)
                Link("Contribute on GitHub", destination: URL(string: "https://github.com/TripSit/drugs")!)
            }

            Section {
                Text(store.meta?.disclaimer ?? String(localized: "landing.disclaimer"))
                    .font(.caption)
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
        }
        .scrollContentBackground(.hidden)
        .background {
            PsyCardsBackground()
        }
        .navigationTitle(String(localized: "categoryNav.settings"))
    }

    private func localeLabel(_ code: String) -> String {
        switch code {
        case "en": "English"
        case "fr": "Français"
        case "de": "Deutsch"
        case "it": "Italiano"
        default: code
        }
    }
}
