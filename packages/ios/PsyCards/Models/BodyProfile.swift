import Foundation
import Observation

/// The person's sex and weight, used to personalise doses (web
/// `scripts/body-profile.ts`). It never leaves the device: with "Save" on it
/// persists in UserDefaults, otherwise it only lives for this app session.
@Observable
@MainActor
final class BodyProfileStore {
    enum Sex: String, Codable, CaseIterable, Sendable {
        case male
        case female
    }

    enum WeightUnit: String, Codable, Sendable {
        case kg
        case lb
    }

    struct Snapshot: Codable, Equatable, Sendable {
        var sex: Sex?
        var weightKg: Double?
        var unit: WeightUnit = .kg
        var remember: Bool = true
    }

    static let minWeightKg = 30.0
    static let maxWeightKg = 250.0
    static let kgPerLb = 0.45359237
    static let defaultWeightKg = 70.0
    private static let storageKey = "psy.cards:body"

    private(set) var snapshot: Snapshot

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.storageKey),
           let saved = try? JSONDecoder().decode(Snapshot.self, from: data) {
            snapshot = Self.sanitize(saved, remember: true)
        } else {
            snapshot = Snapshot()
        }
    }

    var sex: Sex? { snapshot.sex }
    var weightKg: Double? { snapshot.weightKg }
    var unit: WeightUnit { snapshot.unit }
    var remember: Bool { snapshot.remember }
    var isEmpty: Bool { snapshot.sex == nil && snapshot.weightKg == nil }

    func setSex(_ sex: Sex?) { update { $0.sex = sex } }
    /// Tapping the selected sex again clears it (web body dock).
    func toggleSex(_ sex: Sex) { setSex(snapshot.sex == sex ? nil : sex) }
    func setWeightKg(_ weight: Double?) { update { $0.weightKg = weight } }
    func setUnit(_ unit: WeightUnit) { update { $0.unit = unit } }
    func setRemember(_ remember: Bool) { update { $0.remember = remember } }
    func clear() { update { $0.sex = nil; $0.weightKg = nil } }

    /// Steps the weight by one display unit, starting from a typical adult.
    func stepWeight(by steps: Int) {
        let unit = snapshot.unit
        let current = snapshot.weightKg.map { Self.toDisplay($0, unit: unit) }
            ?? Self.toDisplay(Self.defaultWeightKg, unit: unit) - Double(steps)
        let kg = Self.fromDisplay(current + Double(steps), unit: unit)
        setWeightKg(min(Self.maxWeightKg, max(Self.minWeightKg, (kg * 10).rounded() / 10)))
    }

    var displayWeight: Double? {
        snapshot.weightKg.map { Self.toDisplay($0, unit: snapshot.unit) }
    }

    /// Typed weights outside 30–250 kg are rejected rather than clamped.
    @discardableResult
    func setDisplayWeight(_ value: Double?) -> Bool {
        guard let value else {
            setWeightKg(nil)
            return true
        }
        let kg = Self.fromDisplay(value, unit: snapshot.unit)
        guard kg.isFinite, kg >= Self.minWeightKg, kg <= Self.maxWeightKg else { return false }
        setWeightKg((kg * 10).rounded() / 10)
        return true
    }

    private func update(_ change: (inout Snapshot) -> Void) {
        var next = snapshot
        change(&next)
        snapshot = Self.sanitize(next, remember: next.remember)
        persist()
    }

    private func persist() {
        if snapshot.remember, let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: Self.storageKey)
        } else {
            defaults.removeObject(forKey: Self.storageKey)
        }
    }

    static func sanitize(_ input: Snapshot, remember: Bool) -> Snapshot {
        var output = input
        output.remember = remember
        if let weight = input.weightKg, !(weight.isFinite && weight >= minWeightKg && weight <= maxWeightKg) {
            output.weightKg = nil
        }
        return output
    }

    static func toDisplay(_ weightKg: Double, unit: WeightUnit) -> Double {
        unit == .lb ? (weightKg / kgPerLb).rounded() : weightKg.rounded()
    }

    static func fromDisplay(_ value: Double, unit: WeightUnit) -> Double {
        unit == .lb ? value * kgPerLb : value
    }
}

/// Pure dose maths behind the "For you" tile (web `lib/personal-dose.ts`).
enum PersonalDoseMath {
    /// Upper limit from a mg/kg guideline, e.g. MDMA 1.5 mg/kg (men) / 1.3 mg/kg (women).
    static func upperLimitMg(weightKg: Double, mgPerKg: Double) -> Double {
        (weightKg * mgPerKg).rounded()
    }

    /// Converts a mg/kg amount to mg, rounded to a sensible precision.
    static func perKgToMg(_ mgPerKg: Double, weightKg: Double) -> Double {
        let mg = mgPerKg * weightKg
        return mg >= 100 ? (mg / 5).rounded() * 5 : mg.rounded()
    }

    /// Widmark: peak blood alcohol (‰, g/kg) added by one unit of `grams` of ethanol.
    static func bacPerUnit(gramsPerUnit: Double, weightKg: Double, r: Double) -> Double {
        gramsPerUnit / (weightKg * r)
    }

    /// Units needed to reach a blood alcohol limit, rounded down to half units.
    static func unitsToLimit(limitPermille: Double, perUnit: Double) -> Double {
        max(0.5, (limitPermille / perUnit * 2).rounded(.down) / 2)
    }

    /// EFSA: single caffeine doses up to ~3 mg/kg (200 mg for a 70 kg adult) raise no concerns.
    static func caffeineSingleDoseMg(weightKg: Double, mgPerKg: Double, maxMg: Double) -> Double {
        min(maxMg, (weightKg * mgPerKg).rounded())
    }

    /// How much lighter than the reference body the person is, in % (0 when heavier).
    static func lighterThanPct(referenceKg: Double, weightKg: Double) -> Int {
        max(0, Int(((referenceKg - weightKg) / referenceKg * 100).rounded()))
    }
}

/// The "For you" tile's computed figure (web `personalResult`).
struct PersonalResult: Equatable {
    var value: String
    var label: String
    var formula: String

    @MainActor
    static func make(_ personal: PersonalDose, profile: BodyProfileStore.Snapshot, store: DataPackStore) -> PersonalResult? {
        guard let weight = profile.weightKg else { return nil }
        let kg = "\(store.number(weight)) kg"
        let mg = { (value: Double) in store.number(value) }

        switch personal {
        case let .mgPerKg(male, female):
            let label = store.t("card.yourMax")
            if let sex = profile.sex {
                let factor = sex == .male ? male : female
                return PersonalResult(
                    value: "\(mg(PersonalDoseMath.upperLimitMg(weightKg: weight, mgPerKg: factor))) mg",
                    label: label,
                    formula: "\(store.number(factor, digits: 1)) mg/kg × \(kg)"
                )
            }
            let low = PersonalDoseMath.upperLimitMg(weightKg: weight, mgPerKg: female)
            let high = PersonalDoseMath.upperLimitMg(weightKg: weight, mgPerKg: male)
            return PersonalResult(
                value: "\(mg(low))–\(mg(high)) mg",
                label: label,
                formula: "\(store.number(female, digits: 1))–\(store.number(male, digits: 1)) mg/kg × \(kg)"
            )
        case let .perKgChart(min, max):
            guard let min, let max else { return nil }
            return PersonalResult(
                value: "\(mg(PersonalDoseMath.perKgToMg(min, weightKg: weight)))–\(mg(PersonalDoseMath.perKgToMg(max, weightKg: weight))) mg",
                label: store.t("card.yourRange"),
                formula: "\(store.number(min, digits: 1))–\(store.number(max, digits: 1)) mg/kg × \(kg)"
            )
        case let .bac(grams, rMale, rFemale, limit):
            guard let sex = profile.sex else { return nil }
            let perUnit = PersonalDoseMath.bacPerUnit(gramsPerUnit: grams, weightKg: weight, r: sex == .male ? rMale : rFemale)
            let units = PersonalDoseMath.unitsToLimit(limitPermille: limit, perUnit: perUnit)
            return PersonalResult(
                value: "+\(store.number(perUnit, digits: 2)) ‰",
                label: store.t("card.perUnit"),
                formula: store.t("card.unitsToLimit", [
                    "count": units.truncatingRemainder(dividingBy: 1) == 0 ? store.number(units) : store.number(units, digits: 1),
                    "limit": store.number(limit, digits: 1),
                ])
            )
        case let .caffeine(perKg, maxMg, dailyMg):
            let single = PersonalDoseMath.caffeineSingleDoseMg(weightKg: weight, mgPerKg: perKg, maxMg: maxMg)
            return PersonalResult(
                value: "≤ \(mg(single)) mg",
                label: store.t("card.singleDose"),
                formula: store.t("card.perDay", ["amount": "≤ \(mg(dailyMg)) mg"])
            )
        case .referenceWeight:
            return nil
        }
    }
}
