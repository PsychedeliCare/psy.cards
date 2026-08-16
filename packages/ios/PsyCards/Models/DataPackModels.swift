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
    static let previewLimit = 10

    /// Low-risk first, then combinations to avoid, then caution.
    private static let rank: [String: Int] = [
        "synergy": 0,
        "safe": 1,
        "decrease": 2,
        "dangerous": 3,
        "unsafe": 4,
        "serotoninsyndrome": 5,
        "caution": 6,
    ]

    static func groups(
        for key: String,
        substances: [Substance],
        matrix: [String: [String: ComboCellSummary]]
    ) -> [ComboStatusGroup] {
        var buckets: [String: ComboStatusGroup] = [:]
        for other in substances where other.key != key {
            guard let cell = matrix[key]?[other.key] ?? matrix[other.key]?[key] else { continue }
            var group = buckets[cell.statusKey] ?? ComboStatusGroup(
                statusKey: cell.statusKey,
                label: cell.label,
                icon: cell.icon,
                partners: []
            )
            group.partners.append(ComboPartner(key: other.key, name: other.prettyName))
            buckets[cell.statusKey] = group
        }
        return buckets.values
            .map { group in
                var sorted = group
                sorted.partners.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                return sorted
            }
            .sorted { (rank[$0.statusKey] ?? 99) < (rank[$1.statusKey] ?? 99) }
    }

    static func preview(
        _ groups: [ComboStatusGroup],
        limit: Int = previewLimit
    ) -> (visible: [ComboStatusGroup], hiddenCount: Int) {
        let total = groups.reduce(0) { $0 + $1.partners.count }
        guard total > limit else { return (groups, 0) }

        var remaining = limit
        var visible: [ComboStatusGroup] = []
        for group in groups {
            guard remaining > 0 else { break }
            if group.partners.count <= remaining {
                visible.append(group)
                remaining -= group.partners.count
            } else {
                var clipped = group
                clipped.partners = Array(group.partners.prefix(remaining))
                visible.append(clipped)
                remaining = 0
            }
        }
        return (visible, total - limit)
    }
}
