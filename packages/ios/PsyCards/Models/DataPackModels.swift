import Foundation

struct DataPackManifest: Codable, Sendable {
    var version: Int
    var generatedAt: String
    var locales: [String]
    var substanceCount: Int
}

struct SubstancesPack: Codable, Sendable {
    var locale: String
    var groups: [String]
    var groupLabels: [String: String]
    var substances: [Substance]
}

struct Substance: Codable, Identifiable, Hashable, Sendable {
    var key: String
    var slug: String
    var label: String
    var prettyName: String
    var group: String
    var aliases: [String]
    /// Up to three aliases for list rows (web SubstanceListCard).
    var listAliases: [String]
    var listMeta: ListMeta
    var searchTerms: [String]
    var summary: String?
    var isClass: Bool
    var classDescription: String?
    var dose: [String: [String: String]]?
    var doseNote: String?
    var onset: TimingValue?
    var duration: TimingValue?
    var afterEffects: String?
    var effects: [String]?
    var avoid: String?
    var halfLife: String?
    var molecule: MoleculeInfo?

    var id: String { key }
}

struct ListMeta: Codable, Hashable, Sendable {
    var onset: String?
    var duration: String?
    var commonDose: String?

    var isEmpty: Bool { onset == nil && duration == nil && commonDose == nil }
}

struct TimingValue: Codable, Hashable, Sendable {
    var unit: String?
    var value: String?

    enum CodingKeys: String, CodingKey {
        case unit = "_unit"
        case value
    }
}

struct MoleculeInfo: Codable, Hashable, Sendable {
    var smiles: String
    var compound: String
    var representative: Bool
    var assetName: String
}

struct CombosPack: Codable, Sendable {
    var locale: String
    var columns: [ComboColumn]
    var matrix: [String: [String: ComboCellSummary]]
    var pairs: [ComboPair]
    var legend: [StatusDefinition]
}

struct ComboColumn: Codable, Identifiable, Hashable, Sendable {
    var key: String
    var slug: String
    var label: String
    var group: String

    var id: String { key }
}

struct ComboCellSummary: Codable, Hashable, Sendable {
    var statusKey: String
    var label: String
    var icon: String
}

struct ComboPair: Codable, Identifiable, Hashable, Sendable {
    var id: String
    var a: String
    var b: String
    var statusKey: String
    var label: String
    var icon: String
    var emoji: String
    var definition: String
    var note: String?
    var sources: [ComboSource]
}

struct ComboSource: Codable, Hashable, Sendable {
    var author: String
    var title: String
    var url: String
}

struct StatusDefinition: Codable, Identifiable, Hashable, Sendable {
    var statusKey: String
    var icon: String
    var rawStatus: String
    var label: String
    var emoji: String
    var definition: String

    var id: String { statusKey }
}

struct MetaPack: Codable, Sendable {
    var locale: String
    var siteTitle: String
    var siteDescription: String
    var disclaimer: String
    var about: String
}

struct ComboPartner: Identifiable, Equatable, Sendable {
    var key: String
    var name: String

    var id: String { key }
}

struct ComboStatusGroup: Identifiable, Equatable, Sendable {
    var statusKey: String
    var label: String
    var icon: String
    var partners: [ComboPartner]

    var id: String { statusKey }
}

enum ComboGrouping {
    /// Riskiest first, then low-risk combinations (web SubstanceComboTable).
    static let riskOrder = [
        "serotoninsyndrome", "dangerous", "unsafe", "caution",
        "synergy", "safe", "decrease", "unknown",
    ]

    static func groups(
        for key: String,
        substances: [Substance],
        matrix: [String: [String: ComboCellSummary]]
    ) -> [ComboStatusGroup] {
        var buckets: [String: ComboStatusGroup] = [:]
        // Partners keep the curated table order, like the web list.
        for other in substances where other.key != key {
            guard let cell = matrix[key]?[other.key] ?? matrix[other.key]?[key] else { continue }
            var group = buckets[cell.statusKey] ?? ComboStatusGroup(
                statusKey: cell.statusKey,
                label: cell.label,
                icon: cell.icon,
                partners: []
            )
            group.partners.append(ComboPartner(key: other.key, name: other.label))
            buckets[cell.statusKey] = group
        }
        return riskOrder.compactMap { buckets[$0] }
    }
}
