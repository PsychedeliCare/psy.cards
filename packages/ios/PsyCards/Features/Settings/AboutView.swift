import SwiftUI

struct AboutView: View {
    @Environment(DataPackStore.self) private var store
    @Environment(BodyProfileStore.self) private var profile

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    PsyCardsBrandLabel(size: 34)
                    Text(store.t("meta.landingDescription"))
                        .foregroundStyle(PsyCardsColors.fgMute)
                }
                .padding(.vertical, 6)
                .listRowBackground(Color.clear)
            }

            Section {
                Picker(store.t("layout.language"), selection: Binding(get: { store.locale }, set: { store.setLocale($0) })) {
                    ForEach(store.supportedLocales, id: \.self) { locale in
                        Text(localeLabel(locale)).tag(locale)
                    }
                }
                .pickerStyle(.navigationLink)
            }

            bodySection

            if let legend = store.combosPack?.legend {
                Section(store.t("legend.ariaLabel")) {
                    ForEach(legend) { item in
                        HStack(alignment: .top, spacing: 12) {
                            StatusIcon(name: item.icon, size: 16)
                                .foregroundStyle(PsyCardsColors.ink(onStatus: item.statusKey))
                                .frame(width: 28, height: 28)
                                .background(PsyCardsColors.status(item.statusKey), in: .rect(cornerRadius: 8, style: .continuous))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.label)
                                    .font(.subheadline.weight(.semibold))
                                Text(item.definition)
                                    .font(.footnote)
                                    .foregroundStyle(PsyCardsColors.fgMute)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }

            if let sources = store.cardsPack?.sources {
                Section(store.t("card.sources")) {
                    ForEach(sources.keys.sorted(), id: \.self) { id in
                        if let source = sources[id] {
                            SourceRow(source: source)
                                .padding(.vertical, 2)
                        }
                    }
                }
            }

            Section(store.t("acknowledgements.title")) {
                Text(store.meta?.about ?? "")
                    .font(.footnote)
                    .foregroundStyle(PsyCardsColors.fgMute)
                Link("TripSit", destination: URL(string: "https://tripsit.me")!)
                Link("PsychonautWiki", destination: URL(string: "https://psychonautwiki.org")!)
                Link("\(store.t("footer.contributeOn")) GitHub", destination: URL(string: "https://github.com/TripSit/drugs")!)
            }

            Section {
                Text(store.meta?.disclaimer ?? store.t("landing.disclaimer"))
                    .font(.caption)
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
        }
        .scrollContentBackground(.hidden)
        .background {
            PsyCardsBackground()
        }
        .navigationTitle(store.t("categoryNav.settings"))
    }

    private var bodySection: some View {
        Section {
            Picker(store.t("body.sex"), selection: Binding(get: { profile.sex }, set: { profile.setSex($0) })) {
                Text("—").tag(BodyProfileStore.Sex?.none)
                Text(store.t("body.male")).tag(BodyProfileStore.Sex?.some(.male))
                Text(store.t("body.female")).tag(BodyProfileStore.Sex?.some(.female))
            }
            Stepper {
                HStack {
                    Text(store.t("body.weight"))
                    Spacer()
                    Text(profile.displayWeight.map { "\(store.number($0)) \(profile.unit.rawValue)" } ?? "—")
                        .monospacedDigit()
                        .foregroundStyle(PsyCardsColors.fgMute)
                        .contentTransition(.numericText())
                }
            } onIncrement: {
                profile.stepWeight(by: 1)
            } onDecrement: {
                profile.stepWeight(by: -1)
            }
            Picker(store.t("body.weight"), selection: Binding(get: { profile.unit }, set: { profile.setUnit($0) })) {
                Text("kg").tag(BodyProfileStore.WeightUnit.kg)
                Text("lb").tag(BodyProfileStore.WeightUnit.lb)
            }
            .pickerStyle(.segmented)
            Toggle(store.t("body.saveHint"), isOn: Binding(get: { profile.remember }, set: { profile.setRemember($0) }))
            if !profile.isEmpty {
                Button(store.t("body.clear"), role: .destructive) {
                    profile.clear()
                }
            }
        } header: {
            Text(store.t("body.title"))
        } footer: {
            Text(store.t("body.privacyDevice"))
        }
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
