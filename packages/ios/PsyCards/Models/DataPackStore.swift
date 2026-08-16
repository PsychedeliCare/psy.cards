import Foundation
import Observation
import SwiftUI

@Observable
@MainActor
final class DataPackStore {
    private(set) var locale: String
    private(set) var substancesPack: SubstancesPack?
    private(set) var combosPack: CombosPack?
    private(set) var meta: MetaPack?
    private(set) var loadError: String?

    let supportedLocales = ["en", "fr", "de", "it"]

    init(locale: String? = nil) {
        let preferred = locale
            ?? Locale.current.language.languageCode?.identifier
            ?? "en"
        self.locale = supportedLocales.contains(preferred) ? preferred : "en"
        reload()
    }

    var substances: [Substance] {
        substancesPack?.substances ?? []
    }

    var groups: [String] {
        substancesPack?.groups ?? []
    }

    func groupLabel(_ key: String) -> String {
        substancesPack?.groupLabels[key] ?? key.capitalized
    }

    func substance(key: String) -> Substance? {
        substances.first { $0.key == key }
    }

    func substance(slug: String) -> Substance? {
        substances.first { $0.slug == slug }
    }

    func setLocale(_ newLocale: String) {
        guard supportedLocales.contains(newLocale), newLocale != locale else { return }
        locale = newLocale
        reload()
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
        do {
            substancesPack = try Self.decode("substances", locale: locale)
            combosPack = try Self.decode("combos", locale: locale)
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
