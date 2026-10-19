import XCTest

/// Drives the main card flows and keeps a screenshot of each step, so the
/// native card can be compared with the web one (and regressions show up).
final class CardTourUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    /// Starts from a known state: English, empty body profile.
    private func launch() {
        app = XCUIApplication()
        app.launchArguments += [
            "-psy.cards:locale", "en",
            "-psy.cards:body", "<>",
        ]
        app.launch()
    }

    func testSubstanceCardTour() throws {
        try XCTSkipIf(isPad, "Phone flow: iPad shows both card sides side by side")
        launch()
        snapshot("01-list")
        openCard(named: "MDMA")
        XCTAssertTrue(app.otherElements["card-deck"].waitForExistence(timeout: 5))
        sleep(1)
        snapshot("02-floating-card")

        app.buttons["side-safety"].tap()
        sleep(1)
        snapshot("04-back")

        app.buttons["side-dose"].tap()
        sleep(1)
        app.buttons["margin-compare"].tap()
        sleep(1)
        snapshot("05-margin-compare")
        app.swipeDown(velocity: .fast)
        sleep(1)

        // The details panel peeks from the bottom and is pulled up.
        let handle = app.descendants(matching: .any)["card-details-handle"]
        XCTAssertTrue(handle.waitForExistence(timeout: 5))
        handle.swipeUp(velocity: .fast)
        sleep(1)
        snapshot("07-details")
        app.swipeUp(velocity: .fast)
        snapshot("07b-details-combos")
        handle.tap()
        sleep(1)
        snapshot("07c-details-folded")
        app.buttons["card-close"].tap()
        XCTAssertTrue(app.textFields["search"].waitForExistence(timeout: 5))
    }

    func testCombosMatrix() throws {
        try XCTSkipIf(isPad, "Phone flow")
        launch()
        app.tabBars.buttons.element(boundBy: 1).tap()
        sleep(1)
        snapshot("16-combos")
        app.swipeUp(velocity: .slow)
        app.swipeLeft(velocity: .slow)
        sleep(1)
        snapshot("17-combos-scrolled")
        app.swipeUp(velocity: .fast)
        app.swipeUp(velocity: .fast)
        sleep(1)
        snapshot("18-combos-legend")
        // Column headers open the card too.
        app.swipeDown(velocity: .fast)
        app.swipeDown(velocity: .fast)
        app.swipeRight(velocity: .fast)
        sleep(1)
        let matches = app.buttons.matching(NSPredicate(format: "label == %@", "Caffeine"))
        XCTAssertTrue(matches.firstMatch.waitForExistence(timeout: 5))
        let header = matches.allElementsBoundByIndex.filter { $0.isHittable }.min { $0.frame.minY < $1.frame.minY }!
        header.tap()
        XCTAssertTrue(app.otherElements["card-deck"].waitForExistence(timeout: 5))
        sleep(1)
        snapshot("19-combos-card")
        app.buttons["card-close"].tap()
        sleep(1)
        // Bouncing past the top keeps the headers glued to the edge.
        app.swipeDown(velocity: .fast)
        snapshot("19b-combos-bounce")
        sleep(1)
        let cell = app.buttons.matching(NSPredicate(format: "label CONTAINS ' + '")).allElementsBoundByIndex.first { $0.isHittable }!
        cell.tap()
        sleep(1)
        snapshot("19c-combo-sheet")
    }

    func testSwipeFlipsCard() throws {
        try XCTSkipIf(isPad, "Phone flow: iPad shows both card sides side by side")
        launch()
        openCard(named: "Alcohol")
        let deck = app.otherElements["card-deck"]
        XCTAssertTrue(deck.waitForExistence(timeout: 5))
        deck.swipeLeft()
        sleep(1)
        XCTAssertTrue(app.buttons["side-safety"].isSelected)
        snapshot("08-alcohol-back")
        deck.swipeRight()
        sleep(1)
        XCTAssertTrue(app.buttons["side-dose"].isSelected)
    }

    func testOtherCards() throws {
        try XCTSkipIf(isPad, "Phone flow: iPad shows both card sides side by side")
        launch()
        for (query, row, file) in [
            ("DXM", "Dextromethorphan", "09-dxm"),
            ("Ketamine", "Ketamine", "10-ketamine"),
            ("2C-x", "2C-x", "11-2c-x"),
            ("Nitrous", "N2O", "12-nitrous"),
        ] {
            openCard(named: row, query: query)
            XCTAssertTrue(app.otherElements["card-deck"].waitForExistence(timeout: 5))
            snapshot(file)
            app.buttons["card-close"].tap()
        }
    }

    func testWheel() throws {
        try XCTSkipIf(isPad, "Phone flow")
        launch()
        XCTAssertTrue(app.textFields["search"].waitForExistence(timeout: 5))
        // Long-pressing anywhere on the list (even a row) brings up the wheel.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6)).press(forDuration: 0.8)
        let selection = app.buttons["wheel-selection"]
        XCTAssertTrue(selection.waitForExistence(timeout: 5))
        XCTAssertFalse(app.otherElements["card-deck"].exists)
        sleep(1)
        snapshot("13-wheel")

        // Category ring, up-left of the hub in the bottom-right corner.
        let size = app.frame.size
        let radius = min(size.width * 0.66, 300)
        let hub = CGVector(dx: size.width - radius * 0.42, dy: size.height - radius * 0.42)
        let ring = radius * 0.37 * 0.707
        app.coordinate(withNormalizedOffset: .zero)
            .withOffset(CGVector(dx: hub.dx - ring, dy: hub.dy - ring))
            .tap()
        sleep(1)
        snapshot("14-wheel-category")
        app.swipeDown(velocity: .fast)
        sleep(1)

        selection.tap()
        XCTAssertTrue(app.otherElements["card-deck"].waitForExistence(timeout: 5))
        sleep(1)
        snapshot("15-wheel-card")
        app.buttons["card-close"].tap()
        app.buttons["wheel-close"].tap()
        XCTAssertFalse(selection.waitForExistence(timeout: 2))
    }

    func testIPadLayouts() throws {
        try XCTSkipUnless(isPad, "iPad layout")
        XCUIDevice.shared.orientation = .landscapeLeft
        launch()
        openCard(named: "MDMA")
        sleep(2)
        snapshot("20-ipad-card")
        app.swipeUp(velocity: .slow)
        snapshot("21-ipad-details")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.6)).press(forDuration: 0.8)
        sleep(2)
        snapshot("22-ipad-wheel")
    }

    // MARK: Helpers

    private func openCard(named name: String, query: String? = nil) {
        let search = app.textFields["search"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        let clear = app.buttons["search-clear"]
        if clear.exists { clear.tap() }
        search.typeText(query ?? name)
        let row = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'row-' AND label BEGINSWITH[c] %@", name)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.tap()
    }

    private func snapshot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
