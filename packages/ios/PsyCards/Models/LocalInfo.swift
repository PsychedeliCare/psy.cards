import Foundation
import Observation

/// Country-specific card data (`DataPack/local.json`, web
/// `data/local-info.ts`): legal status per substance, emergency numbers and
/// harm reduction organisations.
struct LocalInfoPack: Decodable, Sendable {
    var countries: [String: CountryInfo]
}

struct CountryInfo: Decodable, Hashable, Sendable, Identifiable {
    var country: String
    var name: String
    var asOf: String
    var summary: String?
    var emergency: Emergency
    var callingForHelp: String?
    var drugChecking: String?
    var substances: [String: LegalEntry]
    var organisations: [Organisation]

    var id: String { country }

    struct Emergency: Decodable, Hashable, Sendable {
        /// The number to call for an overdose (ambulance, else general).
        var number: String
        var general: String?
        var poison: Poison?
        var poisonNote: String?
    }

    struct Poison: Decodable, Hashable, Sendable {
        var name: String
        var phone: String
    }
}

enum LegalStatus: String, Decodable, Sendable, CaseIterable {
    case legal, medical, decriminalised, grey, illegal, unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = LegalStatus(rawValue: raw) ?? .unknown
    }
}

struct LegalEntry: Decodable, Hashable, Sendable {
    var status: LegalStatus
    var note: String?
    var confidence: String?
    var sources: [LegalSource]
}

struct LegalSource: Decodable, Hashable, Sendable, Identifiable {
    var title: String
    var url: String?

    var id: String { title + (url ?? "") }
    var link: URL? { url.flatMap(URL.init(string:)) }
}

struct Organisation: Decodable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var city: String?
    var scope: String
    var services: [String]
    var url: String?
    var phone: String?
    var substances: [String]
    var featured: Bool
    var description: [String: String]

    var link: URL? { url.flatMap(URL.init(string:)) }

    func description(locale: String) -> String? {
        description[locale] ?? description["en"]
    }
}

/// The person's country (web `scripts/local-info.ts`): chosen in Settings,
/// otherwise the device region. Stays on the device.
@Observable
@MainActor
final class LocalInfoStore {
    private(set) var countries: [String: CountryInfo] = [:]
    private(set) var code: String?
    /// Whether the person picked the country (vs. the device region).
    private(set) var isChosen = false

    private let defaults: UserDefaults
    private static let storageKey = "psy.cards:country"
    private static let maxOrganisations = 3

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        countries = (try? Self.decode())?.countries ?? [:]
        if let saved = defaults.string(forKey: Self.storageKey), countries[saved] != nil {
            code = saved
            isChosen = true
        } else if let region = Locale.current.region?.identifier, countries[region] != nil {
            code = region
        }
    }

    var current: CountryInfo? { code.flatMap { countries[$0] } }

    /// Overdose number: the country's ambulance number, else 112.
    var emergencyNumber: String { current?.emergency.number ?? "112" }

    func setCountry(_ newCode: String?) {
        code = newCode.flatMap { countries[$0] == nil ? nil : $0 }
        isChosen = code != nil
        if let code {
            defaults.set(code, forKey: Self.storageKey)
        } else {
            defaults.removeObject(forKey: Self.storageKey)
        }
    }

    func name(of code: String, locale: Locale) -> String {
        locale.localizedString(forRegionCode: code).flatMap { $0 == code ? nil : $0 }
            ?? countries[code]?.name
            ?? code
    }

    func sortedCodes(locale: Locale) -> [String] {
        countries.keys.sorted {
            name(of: $0, locale: locale).compare(name(of: $1, locale: locale), locale: locale) == .orderedAscending
        }
    }

    /// Substance-specific services first, then general ones (not poison
    /// centres, which the emergency tile already shows).
    func organisations(for key: String) -> [Organisation] {
        guard let current else { return [] }
        let shown = current.organisations.filter { !$0.services.contains("poison-centre") }
        let specific = shown.filter { $0.substances.contains(key) }
        let general = shown.filter { $0.substances.contains("all") }
        var picked: [Organisation] = []
        for org in specific + general where !picked.contains(org) {
            picked.append(org)
            if picked.count == Self.maxOrganisations { break }
        }
        return picked
    }

    static func flag(_ code: String) -> String {
        code.uppercased().unicodeScalars
            .compactMap { UnicodeScalar(0x1F1E6 + $0.value - 65) }
            .map { String($0) }
            .joined()
    }

    static func telURL(_ number: String) -> URL? {
        URL(string: "tel:\(number.filter { $0.isNumber || $0 == "+" })")
    }

    private static func decode() throws -> LocalInfoPack {
        let candidates = [
            Bundle.main.bundleURL.appendingPathComponent("DataPack/local.json"),
            Bundle.main.url(forResource: "local", withExtension: "json", subdirectory: "DataPack"),
            Bundle.main.url(forResource: "local", withExtension: "json", subdirectory: "Resources/DataPack"),
        ]
        guard let url = candidates.compactMap({ $0 }).first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
            throw DataPackError.missingFile("local.json")
        }
        return try JSONDecoder().decode(LocalInfoPack.self, from: Data(contentsOf: url))
    }
}
