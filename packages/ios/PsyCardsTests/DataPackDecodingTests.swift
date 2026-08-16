import CoreGraphics
import Foundation
import Testing
@testable import PsyCards

struct DataPackDecodingTests {
    @Test func substancesPackDecodes() throws {
        let url = try #require(fixtureURL("substances"))
        let data = try Data(contentsOf: url)
        let pack = try JSONDecoder().decode(SubstancesPack.self, from: data)
        #expect(pack.substances.count == 25)
        #expect(pack.substances.contains { $0.key == "lsd" })
    }

    @Test func combosPackDecodes() throws {
        let url = try #require(fixtureURL("combos"))
        let data = try Data(contentsOf: url)
        let pack = try JSONDecoder().decode(CombosPack.self, from: data)
        #expect(!pack.columns.isEmpty)
        #expect(!pack.legend.isEmpty)
        #expect(!pack.pairs.isEmpty)
    }

    @Test func comboGroupsPrioritizeLowRiskThenAvoid() throws {
        let substances = try decodePack(SubstancesPack.self, "substances")
        let combos = try decodePack(CombosPack.self, "combos")
        let groups = ComboGrouping.groups(
            for: "lsd",
            substances: substances.substances,
            matrix: combos.matrix
        )
        #expect(!groups.isEmpty)

        let ranks = ["synergy", "safe", "decrease", "dangerous", "unsafe", "serotoninsyndrome", "caution"]
        let indexes = groups.compactMap { ranks.firstIndex(of: $0.statusKey) }
        #expect(indexes == indexes.sorted())

        let preview = ComboGrouping.preview(groups, limit: 10)
        let visibleCount = preview.visible.reduce(0) { $0 + $1.partners.count }
        #expect(visibleCount == min(10, groups.reduce(0) { $0 + $1.partners.count }))
        if groups.reduce(0, { $0 + $1.partners.count }) > 10 {
            #expect(preview.hiddenCount > 0)
        }
    }

    @Test func wheelSnapPrefersNearestSideOrBottom() {
        let size = CGSize(width: 400, height: 800)
        #expect(WheelSnap.dock(from: CGPoint(x: 20, y: 400), in: size) == .leading)
        #expect(WheelSnap.dock(from: CGPoint(x: 380, y: 400), in: size) == .trailing)
        #expect(WheelSnap.dock(from: CGPoint(x: 200, y: 780), in: size) == .bottom)
    }

    @Test func metaPackDecodes() throws {
        let url = try #require(fixtureURL("meta"))
        let data = try Data(contentsOf: url)
        let pack = try JSONDecoder().decode(MetaPack.self, from: data)
        #expect(pack.locale == "en")
        #expect(!pack.siteTitle.isEmpty)
    }

    private func decodePack<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        let url = try #require(fixtureURL(name))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    private func fixtureURL(_ name: String) -> URL? {
        let candidates = [
            Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "DataPack/en"),
            Bundle(for: BundleToken.self).url(forResource: name, withExtension: "json", subdirectory: "DataPack/en"),
        ]
        if let found = candidates.compactMap({ $0 }).first {
            return found
        }
        // Fall back to source-tree path when running in SPM-like layouts.
        let source = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("PsyCards/Resources/DataPack/en/\(name).json")
        return FileManager.default.fileExists(atPath: source.path) ? source : nil
    }
}

private final class BundleToken {}
