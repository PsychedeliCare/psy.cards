import Foundation
import Observation
import SwiftUI

@Observable
@MainActor
final class DataPackStore {
    private(set) var locale: String
    private(set) var substancesPack: SubstancesPack?
    private(set) var combosPack: CombosPack?
    private(set) var cardsPack: CardsPack?
    private(set) var meta: MetaPack?
    private(set) var loadError: String?
    /// The selected locale's `.lproj`, so UI strings follow the in-app
    /// language picker rather than only the system language.
    private var strings: Bundle = .main

    let supportedLocales = ["en", "fr", "de", "it"]

    init(locale: String? = nil) {
        let saved = UserDefaults.standard.string(forKey: Self.localeDefaultsKey)
        let preferred = locale
            ?? saved
            ?? Locale.preferredLanguages.lazy.compactMap { Locale(identifier: $0).language.languageCode?.identifier }.first
            ?? "en"
        self.locale = supportedLocales.contains(preferred) ? preferred : "en"
        reload()
    }

    private static let localeDefaultsKey = "psy.cards:locale"

    var substances: [Substance] {
        substancesPack?.substances ?? []
    }

    var groups: [String] {
        substancesPack?.groups ?? []
    }

    var gable: [GableRow] {
        cardsPack?.gable ?? []
    }

    var swiftLocale: Locale { Locale(identifier: locale) }

    func groupLabel(_ key: String) -> String {
        substancesPack?.groupLabels[key] ?? key.capitalized
    }

    func substance(key: String) -> Substance? {
        substances.first { $0.key == key }
    }

    func substance(slug: String) -> Substance? {
        substances.first { $0.slug == slug }
    }

    func card(key: String) -> SubstanceCardData? {
        cardsPack?.cards[key]
    }

    func setLocale(_ newLocale: String) {
        guard supportedLocales.contains(newLocale), newLocale != locale else { return }
        locale = newLocale
        UserDefaults.standard.set(newLocale, forKey: Self.localeDefaultsKey)
        reload()
    }

    /// UI string from the shared i18n JSON (generated into `Localizable.strings`),
    /// with named `{placeholders}` so translations may reorder arguments.
    func t(_ key: String, _ vars: [String: String] = [:]) -> String {
        _ = locale // Observation: re-render string readers on locale change.
        var text = strings.localizedString(forKey: key, value: nil, table: nil)
        if text == key, strings !== Bundle.main {
            text = Bundle.main.localizedString(forKey: key, value: key, table: nil)
        }
        for (name, value) in vars {
            text = text.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return text
    }

    /// Locale-aware number formatting (web `Intl.NumberFormat`).
    func number(_ value: Double, digits: Int = 0) -> String {
        value.formatted(
            .number
                .precision(.fractionLength(digits))
                .locale(swiftLocale)
        )
    }

    func interaction(a: String, b: String) -> ComboCellSummary? {
        combosPack?.matrix[a]?[b]
    }

    func pair(a: String, b: String) -> ComboPair? {
        combosPack?.pairs.first { pair in
            (pair.a == a && pair.b == b) || (pair.a == b && pair.b == a)
        }
    }

    func comboGroups(for key: String) -> [ComboStatusGroup] {
        ComboGrouping.groups(
            for: key,
            substances: substances,
            matrix: combosPack?.matrix ?? [:]
        )
    }

    func search(_ query: String) -> [Substance] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return substances }
        return substances.filter { substance in
            substance.searchTerms.contains { $0.lowercased().contains(trimmed) }
                || substance.key.lowercased().contains(trimmed)
        }
    }

    private func reload() {
        strings = Bundle.main.path(forResource: locale, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        do {
            substancesPack = try Self.decode("substances", locale: locale)
            combosPack = try Self.decode("combos", locale: locale)
            cardsPack = try Self.decode("cards", locale: locale)
            meta = try Self.decode("meta", locale: locale)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    private static func decode<T: Decodable>(_ name: String, locale: String) throws -> T {
        let candidates = [
            Bundle.main.bundleURL.appendingPathComponent("DataPack/\(locale)/\(name).json"),
            Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "DataPack/\(locale)"),
            Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Resources/DataPack/\(locale)"),
        ]
        guard let url = candidates.compactMap({ $0 }).first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            throw DataPackError.missingFile("\(locale)/\(name).json")
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum DataPackError: LocalizedError {
    case missingFile(String)

    var errorDescription: String? {
        switch self {
        case .missingFile(let name):
            "Missing data pack file: \(name)"
        }
    }
}
