import Foundation
import Testing
@testable import PsyCards

struct DataPackDecodingTests {
    @Test func substancesPackDecodes() throws {
        let pack = try decodePack(SubstancesPack.self, "substances")
        #expect(pack.substances.count == 25)
        let mdma = try #require(pack.substances.first { $0.key == "mdma" })
        #expect(mdma.listAliases.count <= 3)
        #expect(mdma.listMeta.commonDose != nil)
    }

    @Test func combosPackDecodes() throws {
        let pack = try decodePack(CombosPack.self, "combos")
        #expect(!pack.columns.isEmpty)
        #expect(!pack.legend.isEmpty)
        #expect(!pack.pairs.isEmpty)
    }

    /// Column keys that differ from the dataset's (dxm → dextromethorphan)
    /// must still resolve, like the web's getInteraction.
    @Test func comboMatrixResolvesAliasedKeys() throws {
        let pack = try decodePack(CombosPack.self, "combos")
        #expect(pack.matrix["mdma"]?["dxm"]?.statusKey == "dangerous")
        let unknown = pack.matrix.values.flatMap(\.values).filter { $0.statusKey == "unknown" }
        #expect(unknown.isEmpty)
    }

    @Test func cardsPackDecodesEveryCard() throws {
        let pack = try decodePack(CardsPack.self, "cards")
        #expect(pack.cards.count == 25)
        #expect(!pack.gable.isEmpty)

        let mdma = try #require(pack.cards["mdma"])
        #expect(mdma.primary?.chartable == true)
        #expect(mdma.primary?.unit == "mg")
        #expect(mdma.avoid.map(\.key) == ["maois", "dxm", "tramadol"])
        #expect(mdma.personal == .mgPerKg(male: 1.5, female: 1.3))
        #expect(mdma.content.overdose?.actions.isEmpty == false)

        guard case let .perKgChart(min, max) = pack.cards["dxm"]?.personal else {
            Issue.record("DXM should use a per-kg chart")
            return
        }
        #expect(min == 2.5 && max == 7.5)
    }

    @Test func everyLocaleHasCards() throws {
        for locale in ["en", "fr", "de", "it"] {
            let pack = try decodePack(CardsPack.self, "cards", locale: locale)
            #expect(pack.cards.count == 25, "\(locale)")
            #expect(pack.cards.values.allSatisfy { $0.content.overdose != nil || $0.content.risks != nil }, "\(locale)")
        }
    }

    @Test func comboGroupsFollowWebRiskOrder() throws {
        let substances = try decodePack(SubstancesPack.self, "substances")
        let combos = try decodePack(CombosPack.self, "combos")
        let groups = ComboGrouping.groups(for: "lsd", substances: substances.substances, matrix: combos.matrix)
        #expect(!groups.isEmpty)

        let indexes = groups.compactMap { ComboGrouping.riskOrder.firstIndex(of: $0.statusKey) }
        #expect(indexes == indexes.sorted())
        #expect(groups.reduce(0) { $0 + $1.partners.count } == substances.substances.count - 1)
    }

    @Test func metaPackDecodes() throws {
        let pack = try decodePack(MetaPack.self, "meta")
        #expect(pack.locale == "en")
        #expect(!pack.siteTitle.isEmpty)
    }

    private func decodePack<T: Decodable>(_ type: T.Type, _ name: String, locale: String = "en") throws -> T {
        let url = try #require(fixtureURL(name, locale: locale))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func fixtureURL(_ name: String, locale: String) -> URL? {
        let candidates = [
            Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "DataPack/\(locale)"),
            Bundle(for: BundleToken.self).url(forResource: name, withExtension: "json", subdirectory: "DataPack/\(locale)"),
        ]
        if let found = candidates.compactMap({ $0 }).first {
            return found
        }
        let source = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("PsyCards/Resources/DataPack/\(locale)/\(name).json")
        return FileManager.default.fileExists(atPath: source.path) ? source : nil
    }
}

/// Pure maths, mirrored from packages/web/src/lib/personal-dose.ts and
/// covered by the same expectations as the web's card-layout tests.
struct PersonalDoseTests {
    @Test func mdmaUpperLimit() {
        #expect(PersonalDoseMath.upperLimitMg(weightKg: 70, mgPerKg: 1.5) == 105)
        #expect(PersonalDoseMath.upperLimitMg(weightKg: 60, mgPerKg: 1.3) == 78)
    }

    @Test func perKgConversionRounds() {
        #expect(PersonalDoseMath.perKgToMg(2.5, weightKg: 70) == 175)
        #expect(PersonalDoseMath.perKgToMg(1.5, weightKg: 50) == 75)
    }

    @Test func widmarkUnits() {
        let perUnit = PersonalDoseMath.bacPerUnit(gramsPerUnit: 8, weightKg: 70, r: 0.68)
        #expect(abs(perUnit - 0.168) < 0.001)
        #expect(PersonalDoseMath.unitsToLimit(limitPermille: 0.5, perUnit: perUnit) == 2.5)
    }

    @Test func caffeineCap() {
        #expect(PersonalDoseMath.caffeineSingleDoseMg(weightKg: 70, mgPerKg: 3, maxMg: 200) == 200)
        #expect(PersonalDoseMath.caffeineSingleDoseMg(weightKg: 50, mgPerKg: 3, maxMg: 200) == 150)
    }

    @Test func lighterPercentage() {
        #expect(PersonalDoseMath.lighterThanPct(referenceKg: 68, weightKg: 55) == 19)
        #expect(PersonalDoseMath.lighterThanPct(referenceKg: 68, weightKg: 90) == 0)
    }
}

struct LabelLayoutTests {
    @Test func labelsNeverOverlap() {
        let placed = LabelLayout.spread([
            .init(pos: 20, width: 18, priority: 1),
            .init(pos: 25, width: 18, priority: 3),
            .init(pos: 30, width: 18, priority: 1),
        ], gap: 2)
        let sorted = placed.sorted { $0.x < $1.x }
        for (a, b) in zip(sorted, sorted.dropFirst()) {
            #expect(b.x - a.x >= 18 + 2 - 0.05)
        }
        #expect(sorted.allSatisfy { $0.x >= 9 && $0.x <= 91 })
    }

    @Test func lowestPriorityDroppedWhenCrowded() {
        let placed = LabelLayout.spread([
            .init(pos: 20, width: 45, priority: 0),
            .init(pos: 50, width: 45, priority: 3),
            .init(pos: 80, width: 45, priority: 1),
        ], gap: 2)
        #expect(placed.count == 2)
        #expect(!placed.contains { $0.index == 0 })
    }
}

@MainActor
struct BodyProfileTests {
    private func makeDefaults() -> UserDefaults {
        let name = "psy.cards.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func remembersOnlyWhenSaveIsOn() {
        let defaults = makeDefaults()
        let profile = BodyProfileStore(defaults: defaults)
        profile.setSex(.female)
        profile.setDisplayWeight(62)
        #expect(BodyProfileStore(defaults: defaults).weightKg == 62)

        profile.setRemember(false)
        #expect(BodyProfileStore(defaults: defaults).weightKg == nil)
        #expect(profile.weightKg == 62)
    }

    @Test func rejectsOutOfRangeWeightsAndConvertsPounds() {
        let profile = BodyProfileStore(defaults: makeDefaults())
        #expect(profile.setDisplayWeight(12) == false)
        #expect(profile.weightKg == nil)
        profile.setUnit(.lb)
        profile.setDisplayWeight(154)
        #expect(abs((profile.weightKg ?? 0) - 69.9) < 0.05)
        #expect(profile.displayWeight == 154)
    }

    @Test func steppingStartsFromTypicalAdult() {
        let profile = BodyProfileStore(defaults: makeDefaults())
        profile.stepWeight(by: 1)
        #expect(profile.weightKg == 70)
        profile.stepWeight(by: 1)
        #expect(profile.weightKg == 71)
    }

    @Test func tappingSelectedSexClearsIt() {
        let profile = BodyProfileStore(defaults: makeDefaults())
        profile.toggleSex(.male)
        #expect(profile.sex == .male)
        profile.toggleSex(.male)
        #expect(profile.sex == nil)
    }
}

private final class BundleToken {}
