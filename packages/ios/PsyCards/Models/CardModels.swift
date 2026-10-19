import Foundation

/// `cards.json`: everything the two-sided substance card needs, resolved by
/// `packages/shared/scripts/build-datapack.mjs` (web `getCardData` parity).
struct CardsPack: Decodable, Sendable {
    var locale: String
    var sources: [String: CardSource]
    var gable: [GableRow]
    var cards: [String: SubstanceCardData]
}

/// Card sources carry their registry id; entries of the top-level registry don't.
struct CardSource: Codable, Hashable, Sendable {
    var id: String?
    var author: String
    var title: String
    var publication: String?
    var url: String?

    var link: URL? { url.flatMap(URL.init(string:)) }
}

struct GableRow: Codable, Hashable, Sendable, Identifiable {
    var name: String
    var key: String?
    var label: String
    var route: String
    var ratio: Double
    var extrapolated: Bool?
    var atLeast: Bool?

    var id: String { "\(name)-\(route)" }
    var isEstimate: Bool { extrapolated ?? false }
    var isLowerBound: Bool { atLeast ?? false }
}

struct SubstanceCardData: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var slug: String
    var group: String
    var displayName: String
    var groupLabel: String
    var aliases: [String]
    var content: CardContent
    var primary: DoseChart?
    var otherRoutes: [DoseChart]
    var referenceName: String?
    var doseNote: String?
    var timing: CardTiming
    var margin: ToxicityMargin?
    var marginDanger: Bool
    var dependence: DependenceRating
    var spacing: SpacingPattern
    var personal: PersonalDose?
    var avoid: [AvoidCombo]
    var sources: [CardSource]
    var details: CardDetails

    var id: String { key }
    var hasTiming: Bool { timing.onset != nil || timing.duration != nil || timing.after != nil }
}

struct CardContent: Codable, Hashable, Sendable {
    var dose: String?
    var prepare: String?
    var marginNote: String?
    var spacing: SpacingText?
    var dependence: String?
    var risks: [RiskItem]?
    var overdose: Overdose?
}

struct SpacingText: Codable, Hashable, Sendable {
    var value: String
    var label: String
    var text: String
}

struct RiskItem: Codable, Hashable, Sendable, Identifiable {
    var icon: String
    var title: String
    var text: String

    var id: String { title }
}

struct Overdose: Codable, Hashable, Sendable {
    var signs: [String]
    var actions: [String]
}

struct CardTiming: Codable, Hashable, Sendable {
    var onset: CardTimingValue?
    var duration: CardTimingValue?
    var after: CardTimingValue?
}

struct CardTimingValue: Codable, Hashable, Sendable {
    var value: String
    var unit: String

    /// Card shorthand for units (web CardFront `unitLabel`).
    var shortUnit: String {
        switch unit {
        case "minutes": "min"
        case "hours": "h"
        default: unit
        }
    }

    var asTimingValue: TimingValue { TimingValue(unit: unit, value: value) }
}

struct ToxicityMargin: Codable, Hashable, Sendable {
    var ratio: Double
    var source: String
    var extrapolated: Bool?
    var atLeast: Bool?
    var compound: String?

    var isEstimate: Bool { extrapolated ?? false }
    var isLowerBound: Bool { atLeast ?? false }
}

struct DependenceRating: Codable, Hashable, Sendable {
    var level: Int
    var nutt: Double?
    var nuttDrug: String?
    var editorial: Bool?

    var clampedLevel: Int { min(5, max(1, level)) }
}

struct SpacingPattern: Codable, Hashable, Sendable {
    var pattern: String?
    var unit: String?

    var cells: [Bool] { (pattern ?? "").map { $0 == "x" } }
}

struct AvoidCombo: Codable, Hashable, Sendable, Identifiable {
    var key: String
    var label: String
    var statusKey: String
    var statusLabel: String
    var icon: String

    var id: String { key }
}

struct CardDetails: Codable, Hashable, Sendable {
    var summary: String?
    var isClassFallback: Bool
    var warning: String?
    var avoidText: String?
    var testKits: String?
    var effects: [EffectItem]
    var pwEffects: [PsychonautEffect]
    var links: SubstanceLinks
    var doseCharts: [DoseChart]
    var doseNote: String?
    var hasStructure: Bool
}

struct EffectItem: Codable, Hashable, Sendable, Identifiable {
    var text: String
    var icon: String

    var id: String { text }
}

struct PsychonautEffect: Codable, Hashable, Sendable, Identifiable {
    var label: String
    var url: String

    var id: String { label }
}

struct SubstanceLinks: Codable, Hashable, Sendable {
    var experiences: String?
    var pihkal: String?
    var tihkal: String?

    var isEmpty: Bool { experiences == nil && pihkal == nil && tihkal == nil }
}

// MARK: - Dose charts

/// One route's dose scale, parsed by the web's `lib/dose-chart.ts`.
struct DoseChart: Codable, Hashable, Sendable, Identifiable {
    var route: String
    var routeLabel: String
    var routeIcon: String
    var chartable: Bool
    var unit: String?
    var perKg: Bool?
    var scaleMax: Double?
    var segments: [DoseSegment]?
    var labels: [ScaleLabel]?
    var ticks: [ScaleTick]?
    var rows: [DoseRow]?

    var id: String { route }
    var isPerKg: Bool { perKg ?? false }
}

struct DoseSegment: Codable, Hashable, Sendable, Identifiable {
    var level: String
    var amount: String
    var color: String
    /// Percent of the full scale (0–100).
    var left: Double
    var width: Double
    var start: Double
    var end: Double
    var openEnd: Bool
    var isPoint: Bool

    var id: String { level }
}

struct ScaleLabel: Codable, Hashable, Sendable {
    var text: String
    var pos: Double
    var color: String
    var priority: Int
}

struct ScaleTick: Codable, Hashable, Sendable {
    var value: Double
    var text: String
    var pos: Double
    var priority: Int
    var suffix: String
}

struct DoseRow: Codable, Hashable, Sendable, Identifiable {
    var level: String
    var amount: String

    var id: String { level }
}

// MARK: - Personal dosing

/// Body-dependent guidance for the "For you" tile (web `Personal`).
enum PersonalDose: Codable, Hashable, Sendable {
    /// Upper limit from a mg/kg guideline (MDMA, Saferparty).
    case mgPerKg(male: Double, female: Double)
    /// The chart itself is in mg/kg (DXM); the common range converts to mg.
    case perKgChart(minMgPerKg: Double?, maxMgPerKg: Double?)
    /// Figures assume a reference body weight (ketamine, MXE).
    case referenceWeight(weightKg: Double)
    /// EFSA single-dose and daily guidance.
    case caffeine(singleMgPerKg: Double, singleMaxMg: Double, dailyMg: Double)
    /// Widmark blood alcohol estimate.
    case bac(gramsPerUnit: Double, rMale: Double, rFemale: Double, limitPermille: Double)

    private enum CodingKeys: String, CodingKey {
        case kind, male, female, minMgPerKg, maxMgPerKg, weightKg
        case singleMgPerKg, singleMaxMg, dailyMg
        case gramsPerUnit, rMale, rFemale, limitPermille
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "mgPerKg":
            self = .mgPerKg(male: try c.decode(Double.self, forKey: .male), female: try c.decode(Double.self, forKey: .female))
        case "perKgChart":
            self = .perKgChart(
                minMgPerKg: try c.decodeIfPresent(Double.self, forKey: .minMgPerKg),
                maxMgPerKg: try c.decodeIfPresent(Double.self, forKey: .maxMgPerKg)
            )
        case "referenceWeight":
            self = .referenceWeight(weightKg: try c.decode(Double.self, forKey: .weightKg))
        case "caffeine":
            self = .caffeine(
                singleMgPerKg: try c.decode(Double.self, forKey: .singleMgPerKg),
                singleMaxMg: try c.decode(Double.self, forKey: .singleMaxMg),
                dailyMg: try c.decode(Double.self, forKey: .dailyMg)
            )
        case "bac":
            self = .bac(
                gramsPerUnit: try c.decode(Double.self, forKey: .gramsPerUnit),
                rMale: try c.decode(Double.self, forKey: .rMale),
                rFemale: try c.decode(Double.self, forKey: .rFemale),
                limitPermille: try c.decode(Double.self, forKey: .limitPermille)
            )
        case let other:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "Unknown personal kind \(other)")
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .mgPerKg(male, female):
            try c.encode("mgPerKg", forKey: .kind)
            try c.encode(male, forKey: .male)
            try c.encode(female, forKey: .female)
        case let .perKgChart(minMgPerKg, maxMgPerKg):
            try c.encode("perKgChart", forKey: .kind)
            try c.encodeIfPresent(minMgPerKg, forKey: .minMgPerKg)
            try c.encodeIfPresent(maxMgPerKg, forKey: .maxMgPerKg)
        case let .referenceWeight(weightKg):
            try c.encode("referenceWeight", forKey: .kind)
            try c.encode(weightKg, forKey: .weightKg)
        case let .caffeine(singleMgPerKg, singleMaxMg, dailyMg):
            try c.encode("caffeine", forKey: .kind)
            try c.encode(singleMgPerKg, forKey: .singleMgPerKg)
            try c.encode(singleMaxMg, forKey: .singleMaxMg)
            try c.encode(dailyMg, forKey: .dailyMg)
        case let .bac(gramsPerUnit, rMale, rFemale, limitPermille):
            try c.encode("bac", forKey: .kind)
            try c.encode(gramsPerUnit, forKey: .gramsPerUnit)
            try c.encode(rMale, forKey: .rMale)
            try c.encode(rFemale, forKey: .rFemale)
            try c.encode(limitPermille, forKey: .limitPermille)
        }
    }
}
