import SwiftUI

// MARK: - Geometry
//
// Swift port of `packages/web/src/lib/dial-geometry.ts` — keep the two in
// sync. Angle convention: degrees, 0° = north (12 o'clock), increasing
// clockwise. Radii live in the web dial's unit space (SVG viewBox −100…100);
// multiply by `scale` (= diameter / 200) to get points.

enum DialGeometry {
    static let hubRadius = 27.0
    static let categoryInner = 27.0
    static let categoryOuter = 62.0
    static let substanceInner = 62.0
    static let substanceOuter = 98.0
    static let rimRadius = 98.0
    static let substanceLabelRadius = 66.0
    static let categoryLabelRadius = 44.5
    static let categoryLabelInset = 2.0
    static let labelBaseSize = 3.9
    static let labelMinSize = 2.4
    /** Available radial run for a substance label (66 → ~96). */
    static let labelMaxWidth = 30.0
    static let categoryLabelBaseSize = 4.6
    static let categoryLabelMinSize = 2.6
    static let categoryLabelTracking = 0.45

    /// Detent at 90° (east) — dial anchored on the leading edge.
    static let leadingDetent = 90.0
    /// Detent at 270° (west) — dial anchored on the trailing edge.
    static let trailingDetent = 270.0
    /// Detent at 0° (north) — dial anchored on the bottom edge.
    static let bottomDetent = 0.0
    /// Detent at 90° (east) — dial anchored bottom-leading (regular width).
    static let regularDetent = leadingDetent
    /// Detent at 270° (west) — dial anchored bottom-trailing (compact width).
    static let compactDetent = trailingDetent

    enum Dock: String, CaseIterable {
        case leading
        case trailing
        case bottom

        var detent: Double {
            switch self {
            case .leading: DialGeometry.leadingDetent
            case .trailing: DialGeometry.trailingDetent
            case .bottom: DialGeometry.bottomDetent
            }
        }
    }

    static func normalize(_ deg: Double) -> Double {
        let a = deg.truncatingRemainder(dividingBy: 360)
        return a < 0 ? a + 360 : a
    }

    /// Shortest circular distance between two angles, 0–180.
    static func circularDistance(_ a: Double, _ b: Double) -> Double {
        let d = abs(normalize(a) - normalize(b))
        return d > 180 ? 360 - d : d
    }

    /// Point for an angle (0° = north, CW) in y-down screen coordinates,
    /// relative to the dial centre.
    static func point(radius: CGFloat, angle: Double) -> CGPoint {
        let rad = angle * .pi / 180
        return CGPoint(x: radius * CGFloat(sin(rad)), y: -radius * CGFloat(cos(rad)))
    }

    /// Annular sector between two radii and two angles (both rings' wedges).
    static func ringWedge(inner: Double, outer: Double, start: Double, end: Double, scale: CGFloat) -> Path {
        var path = Path()
        path.addArc(
            center: .zero,
            radius: outer * scale,
            startAngle: .degrees(start - 90),
            endAngle: .degrees(end - 90),
            clockwise: false
        )
        path.addArc(
            center: .zero,
            radius: inner * scale,
            startAngle: .degrees(end - 90),
            endAngle: .degrees(start - 90),
            clockwise: true
        )
        path.closeSubpath()
        return path
    }

    /// The active substance is derived, never stored: the angle under the
    /// detent is `detent − rotation`; pick the nearest mid-angle.
    static func activeIndex(midAngles: [Double], rotation: Double, detent: Double) -> Int {
        let target = normalize(detent - rotation)
        var best = 0
        var bestDistance = Double.infinity
        for (index, mid) in midAngles.enumerated() {
            let distance = circularDistance(mid, target)
            if distance < bestDistance {
                bestDistance = distance
                best = index
            }
        }
        return best
    }

    /// Rotation that puts `midAngle` under the detent, choosing the
    /// equivalent target within ±180° of `current` so the dial never unwinds
    /// a full turn.
    static func rotation(for midAngle: Double, detent: Double, current: Double) -> Double {
        let base = detent - midAngle
        let k = ((current - base) / 360).rounded()
        return base + k * 360
    }

    static func wedgeContains(_ angle: Double, start: Double, end: Double) -> Bool {
        normalize(angle - start) < (end - start)
    }
}

// MARK: - Layout model

struct DialSubstanceLayout: Equatable, Identifiable {
    let key: String
    let slug: String
    let label: String
    let group: String
    let startAngle: Double
    let endAngle: Double
    let midAngle: Double

    var id: String { key }
}

struct DialCategoryLayout: Equatable, Identifiable {
    let group: String
    let label: String
    let startAngle: Double
    let endAngle: Double
    let midAngle: Double
    let substances: [DialSubstanceLayout]

    var id: String { group }
}

struct DialLayout: Equatable {
    let categories: [DialCategoryLayout]
    let substances: [DialSubstanceLayout]
    let midAngles: [Double]

    static let empty = DialLayout(categories: [], substances: [], midAngles: [])

    /// Same curated data as the web `/wheel` page: the pack's visible group
    /// order, capped at 4 substances per category (pack order is the curated
    /// table order), equal category arcs split among their substances.
    @MainActor
    static func build(from store: DataPackStore, maxPerCategory: Int = 4) -> DialLayout {
        let inputs: [(group: String, substances: [Substance])] = store.groups.compactMap { group in
            let subs = Array(store.substances.filter { $0.group == group }.prefix(maxPerCategory))
            return subs.isEmpty ? nil : (group, subs)
        }
        guard !inputs.isEmpty else { return .empty }

        let step = 360.0 / Double(inputs.count)
        let categories: [DialCategoryLayout] = inputs.enumerated().map { index, input in
            let start = -step / 2 + Double(index) * step
            let substanceStep = step / Double(input.substances.count)
            let substances = input.substances.enumerated().map { subIndex, substance in
                let subStart = start + Double(subIndex) * substanceStep
                return DialSubstanceLayout(
                    key: substance.key,
                    slug: substance.slug,
                    label: substance.label,
                    group: substance.group,
                    startAngle: subStart,
                    endAngle: subStart + substanceStep,
                    midAngle: subStart + substanceStep / 2
                )
            }
            return DialCategoryLayout(
                group: input.group,
                label: store.groupLabel(input.group),
                startAngle: start,
                endAngle: start + step,
                midAngle: Double(index) * step,
                substances: substances
            )
        }

        let all = categories.flatMap(\.substances)
        return DialLayout(categories: categories, substances: all, midAngles: all.map(\.midAngle))
    }
}

// MARK: - Canvas renderer
//
// The entire dial face (both wedge rings, all labels, hub, rim) is a single
// Metal-backed Canvas. The live rotation is applied as a GPU-only
// `rotationEffect` on the canvas layer, so dragging and snapping never
// trigger a content redraw. The canvas only re-renders when the label-flip
// snapshot advances (every ~30° of travel, mirroring the web dial) or when
// the active substance changes.

private struct DialCanvas: View, Equatable {
    let layout: DialLayout
    /// Rotation snapshot used only for keeping labels upright. Deliberately
    /// lags the live rotation to keep redraws rare.
    let labelFlipRotation: Double
    let activeKey: String?
    /// Rim stroke width in dial units (web: 4.5 compact, 2 regular).
    let rimWidth: Double

    private let labelInk = PsyCardsColors.ink

    var body: some View {
        Canvas { context, size in
            var ctx = context
            ctx.translateBy(x: size.width / 2, y: size.height / 2)
            let scale = size.width / 200

            for category in layout.categories {
                let wedge = DialGeometry.ringWedge(
                    inner: DialGeometry.categoryInner,
                    outer: DialGeometry.categoryOuter,
                    start: category.startAngle,
                    end: category.endAngle,
                    scale: scale
                )
                ctx.fill(wedge, with: .color(PsyCardsColors.group(category.group)))
                ctx.stroke(wedge, with: .color(PsyCardsColors.ink), lineWidth: 0.5 * scale)
            }

            for substance in layout.substances {
                let wedge = DialGeometry.ringWedge(
                    inner: DialGeometry.substanceInner,
                    outer: DialGeometry.substanceOuter,
                    start: substance.startAngle,
                    end: substance.endAngle,
                    scale: scale
                )
                ctx.fill(wedge, with: .color(PsyCardsColors.group(substance.group)))
                if substance.key == activeKey {
                    ctx.fill(wedge, with: .color(.white.opacity(0.14)))
                }
                ctx.stroke(wedge, with: .color(PsyCardsColors.ink), lineWidth: 0.5 * scale)
            }

            for category in layout.categories {
                drawCategoryLabel(ctx, category, scale: scale)
            }
            for substance in layout.substances {
                drawSubstanceLabel(ctx, substance, scale: scale)
            }

            // Hub and rim are concentric circles, so they are rotation
            // invariant and safe to draw inside the rotating layer.
            let hubRadius = DialGeometry.hubRadius * scale
            ctx.fill(
                Path(ellipseIn: CGRect(x: -hubRadius, y: -hubRadius, width: hubRadius * 2, height: hubRadius * 2)),
                with: .color(PsyCardsColors.ink)
            )
            let rimRadius = DialGeometry.rimRadius * scale
            ctx.stroke(
                Path(ellipseIn: CGRect(x: -rimRadius, y: -rimRadius, width: rimRadius * 2, height: rimRadius * 2)),
                with: .color(.black),
                lineWidth: rimWidth * scale
            )
        }
    }

    private func labelText(_ string: String, size: CGFloat, weight: Font.Weight) -> Text {
        Text(string)
            .font(.system(size: size, weight: weight))
            .foregroundStyle(labelInk)
    }

    private func measure(_ text: GraphicsContext.ResolvedText) -> CGSize {
        text.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
    }

    /// Radial label starting at r = 66, auto-fitted so it never bleeds past
    /// the rim, flipped in place on the left half so it never reads upside
    /// down (web `substanceLabelOrientation`).
    private func drawSubstanceLabel(_ ctx: GraphicsContext, _ substance: DialSubstanceLayout, scale: CGFloat) {
        let weight: Font.Weight = substance.key == activeKey ? .heavy : .medium
        let baseSize = DialGeometry.labelBaseSize * scale
        var resolved = ctx.resolve(labelText(substance.label, size: baseSize, weight: weight))
        let maxWidth = DialGeometry.labelMaxWidth * scale
        let width = measure(resolved).width
        if width > maxWidth {
            let fitted = max(DialGeometry.labelMinSize * scale, baseSize * maxWidth / width)
            resolved = ctx.resolve(labelText(substance.label, size: fitted, weight: weight))
        }

        let absolute = DialGeometry.normalize(substance.midAngle + labelFlipRotation)
        let flipped = absolute > 180
        var c = ctx
        let anchor = DialGeometry.point(
            radius: DialGeometry.substanceLabelRadius * scale,
            angle: substance.midAngle
        )
        c.translateBy(x: anchor.x, y: anchor.y)
        c.rotate(by: .degrees(substance.midAngle - 90 + (flipped ? 180 : 0)))
        c.draw(resolved, at: .zero, anchor: flipped ? .trailing : .leading)
    }

    /// Uppercase label laid glyph-by-glyph along an arc at r = 44.5, centred
    /// on the wedge, auto-fitted to the arc length, and drawn in reverse on
    /// the lower half so it stays upright (web textPath forward/reverse).
    private func drawCategoryLabel(_ ctx: GraphicsContext, _ category: DialCategoryLayout, scale: CGFloat) {
        let label = category.label.uppercased()
        guard !label.isEmpty else { return }

        let radius = DialGeometry.categoryLabelRadius * scale
        let spanDeg = category.endAngle - category.startAngle - 2 * DialGeometry.categoryLabelInset
        let budget = radius * CGFloat(spanDeg * Double.pi / 180) - 2 * scale
        let tracking = DialGeometry.categoryLabelTracking * scale

        func resolveGlyphs(size: CGFloat) -> (glyphs: [GraphicsContext.ResolvedText], widths: [CGFloat], total: CGFloat) {
            let glyphs = label.map { ctx.resolve(labelText(String($0), size: size, weight: .bold)) }
            let widths = glyphs.map { measure($0).width }
            let total = widths.reduce(0, +) + tracking * CGFloat(max(0, label.count - 1))
            return (glyphs, widths, total)
        }

        var fontSize = DialGeometry.categoryLabelBaseSize * scale
        var run = resolveGlyphs(size: fontSize)
        if run.total > budget {
            fontSize = max(DialGeometry.categoryLabelMinSize * scale, fontSize * budget / run.total)
            run = resolveGlyphs(size: fontSize)
        }

        let absolute = DialGeometry.normalize(category.midAngle + labelFlipRotation)
        let reversed = absolute > 90 && absolute < 270

        let degPerPoint = 180 / (.pi * Double(radius))
        let totalDeg = Double(run.total) * degPerPoint
        let trackingDeg = Double(tracking) * degPerPoint
        var cursor = category.midAngle + (reversed ? totalDeg / 2 : -totalDeg / 2)

        for (glyph, width) in zip(run.glyphs, run.widths) {
            let widthDeg = Double(width) * degPerPoint
            let glyphAngle = reversed ? cursor - widthDeg / 2 : cursor + widthDeg / 2
            var c = ctx
            let position = DialGeometry.point(radius: radius, angle: glyphAngle)
            c.translateBy(x: position.x, y: position.y)
            c.rotate(by: .degrees(glyphAngle + (reversed ? 180 : 0)))
            c.draw(glyph, at: .zero, anchor: .center)
            cursor += (reversed ? -1 : 1) * (widthDeg + trackingDeg)
        }
    }
}

// MARK: - Interactive dial

private struct SubstanceDialView: View {
    let layout: DialLayout
    let diameter: CGFloat
    let detent: Double
    let rimWidth: Double
    let selectedKey: String?
    let onSelect: (DialSubstanceLayout) -> Void
    let onActivate: (DialSubstanceLayout) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rotation = 0.0
    @State private var labelFlipRotation = 0.0
    @State private var dragPreviousAngle: Double?

    /// Degrees of travel between label-flip resyncs (matches the web dial).
    private let labelSyncTravel = 30.0
    /// Fling projection horizon: extra travel ≈ angular velocity × τ.
    private let flingProjection = 0.15
    private let maxFlingTravel = 720.0

    private var scale: CGFloat { diameter / 200 }

    private var activeIndex: Int {
        layout.substances.isEmpty
            ? -1
            : DialGeometry.activeIndex(midAngles: layout.midAngles, rotation: rotation, detent: detent)
    }

    private var activeSubstance: DialSubstanceLayout? {
        layout.substances.indices.contains(activeIndex) ? layout.substances[activeIndex] : nil
    }

    var body: some View {
        ZStack {
            // Static opaque backing carries the drop shadow so the rotating
            // canvas layer never re-renders one.
            Circle()
                .fill(PsyCardsColors.ink)
                .padding(1)

            DialCanvas(
                layout: layout,
                labelFlipRotation: labelFlipRotation,
                activeKey: activeSubstance?.key,
                rimWidth: rimWidth
            )
            .equatable()
            .rotationEffect(.degrees(rotation))

            // Unrotated hit surface: gesture locations stay in dial-local
            // coordinates regardless of the current rotation.
            Color.clear
                .contentShape(Circle())
                .gesture(SpatialTapGesture().onEnded { handleTap($0.location) })
                .gesture(dragGesture)
        }
        .frame(width: diameter, height: diameter)
        .onChange(of: detent, initial: true) { _, _ in seat() }
        .onChange(of: layout) { _, _ in seat() }
        .onChange(of: activeIndex) { _, newValue in
            if layout.substances.indices.contains(newValue) {
                onSelect(layout.substances[newValue])
            }
        }
        .sensoryFeedback(.selection, trigger: activeIndex)
        .accessibilityElement()
        .accessibilityLabel(Text(String(localized: "dial.ariaLabel")))
        .accessibilityValue(Text(activeSubstance?.label ?? ""))
        .accessibilityAdjustableAction { direction in
            let count = layout.substances.count
            guard count > 0 else { return }
            let step = direction == .increment ? 1 : -1
            let next = ((activeIndex + step) % count + count) % count
            snap(toMidAngle: layout.substances[next].midAngle)
        }
    }

    // MARK: Rotation

    /// Instantly puts the current selection (or the first substance) under
    /// the detent — boot, detent flips, and data reloads.
    private func seat() {
        guard !layout.substances.isEmpty else { return }
        let index = selectedKey.flatMap { key in
            layout.substances.firstIndex { $0.key == key }
        } ?? 0
        let target = DialGeometry.rotation(
            for: layout.substances[index].midAngle,
            detent: detent,
            current: rotation
        )
        rotation = target
        labelFlipRotation = target
        onSelect(layout.substances[index])
    }

    private func snap(toMidAngle midAngle: Double, reference: Double? = nil) {
        let target = DialGeometry.rotation(
            for: midAngle,
            detent: detent,
            current: reference ?? rotation
        )
        if reduceMotion {
            rotation = target
            labelFlipRotation = target
            return
        }
        // Ease-out cubic, stretched a little for longer flights (web: 280ms).
        let travel = abs(target - rotation)
        let duration = 0.28 + min(0.35, travel / 720 * 0.35)
        withAnimation(.timingCurve(0.33, 1, 0.68, 1, duration: duration)) {
            rotation = target
        } completion: {
            labelFlipRotation = target
        }
    }

    // MARK: Drag

    /// Pointer angle in dial convention (0° = north, CW).
    private func screenAngle(of location: CGPoint) -> Double {
        let dx = location.x - diameter / 2
        let dy = location.y - diameter / 2
        return atan2(Double(dx), Double(-dy)) * 180 / .pi
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                let angle = screenAngle(of: value.location)
                if let previous = dragPreviousAngle {
                    // Unwrap the frame-to-frame delta across the ±180° seam.
                    var delta = angle - previous
                    delta -= 360 * (delta / 360).rounded()
                    rotation += delta
                    if abs(rotation - labelFlipRotation) >= labelSyncTravel {
                        labelFlipRotation = rotation
                    }
                }
                dragPreviousAngle = angle
            }
            .onEnded { value in
                dragPreviousAngle = nil
                settleAfterDrag(value)
            }
    }

    /// Fling: project the release angular velocity forward with a short
    /// horizon, then snap to the substance nearest the projected rotation.
    private func settleAfterDrag(_ value: DragGesture.Value) {
        guard !layout.substances.isEmpty else { return }
        let dx = Double(value.location.x - diameter / 2)
        let dy = Double(value.location.y - diameter / 2)
        let radiusSquared = max(dx * dx + dy * dy, 1)
        let omega = (dx * Double(value.velocity.height) - dy * Double(value.velocity.width))
            / radiusSquared * 180 / .pi
        let extra = min(maxFlingTravel, max(-maxFlingTravel, omega * flingProjection))
        let projected = rotation + extra
        let index = DialGeometry.activeIndex(midAngles: layout.midAngles, rotation: projected, detent: detent)
        snap(toMidAngle: layout.substances[index].midAngle, reference: projected)
    }

    // MARK: Tap

    private func handleTap(_ location: CGPoint) {
        guard !layout.substances.isEmpty else { return }
        let dx = location.x - diameter / 2
        let dy = location.y - diameter / 2
        let radiusUnits = Double(hypot(dx, dy) / scale)
        let localAngle = DialGeometry.normalize(screenAngle(of: location) - rotation)

        if radiusUnits < DialGeometry.hubRadius {
            if let active = activeSubstance { onActivate(active) }
        } else if radiusUnits < DialGeometry.categoryOuter {
            if let category = layout.categories.first(where: {
                DialGeometry.wedgeContains(localAngle, start: $0.startAngle, end: $0.endAngle)
            }) {
                snap(toMidAngle: category.midAngle)
            }
        } else if radiusUnits <= DialGeometry.rimRadius + 2 {
            if let substance = layout.substances.first(where: {
                DialGeometry.wedgeContains(localAngle, start: $0.startAngle, end: $0.endAngle)
            }) {
                snap(toMidAngle: substance.midAngle)
            }
        }
    }
}

// MARK: - Wheel page

struct WheelView: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @AppStorage("dial.dockEdge") private var dockEdgeRaw = ""
    @AppStorage("dial.dockAlong") private var dockAlong = -1.0

    @State private var selected: DialSubstanceLayout?
    @State private var displayedKey: String?
    @State private var pushedSubstance: Substance?
    @State private var dragTranslation: CGSize = .zero
    @State private var isMoving = false

    private let cardSwapDebounce = Duration.milliseconds(160)
    private let defaultSideAlong = 0.82

    var body: some View {
        let layout = DialLayout.build(from: store)

        GeometryReader { geo in
            let compact = horizontalSizeClass != .regular
            let diameter: CGFloat = compact
                ? min(max(geo.size.width * 0.675, 160), 310)
                : min(520, geo.size.height * 0.85)
            let dock = resolvedDock(compact: compact)
            let along = resolvedAlong()
            let parked = parkedCenter(dock: dock, along: along, in: geo.size)
            let center = CGPoint(
                x: parked.x + dragTranslation.width,
                y: parked.y + dragTranslation.height
            )
            let detent = dock.detent

            ZStack {
                card(layout: layout, dock: dock, along: along, diameter: diameter, height: geo.size.height)

                if showsScrim(dock: dock, along: along) {
                    scrim
                }

                SubstanceDialView(
                    layout: layout,
                    diameter: diameter,
                    detent: detent,
                    rimWidth: compact ? 4.5 : 2,
                    selectedKey: selected?.key,
                    onSelect: { selected = $0 },
                    onActivate: { substance in
                        pushedSubstance = store.substance(key: substance.key)
                    }
                )
                .background(
                    Circle()
                        .fill(PsyCardsColors.ink)
                        .shadow(color: .black.opacity(compact ? 0.85 : 0.55), radius: compact ? 40 : 26)
                )
                .scaleEffect(isMoving ? 1.04 : 1)
                .position(center)

                hubHandle(diameter: diameter, center: center, parked: parked, canvas: geo.size)

                detentMarker(dock: dock, diameter: diameter, center: center)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .background(PsyCardsColors.ink.ignoresSafeArea())
        .navigationTitle(String(localized: "dial.pageTitle"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $pushedSubstance) { substance in
            SubstanceDetailView(substance: substance)
        }
        .sensoryFeedback(.impact(flexibility: .soft), trigger: dockEdgeRaw)
        .task(id: selected?.key) {
            guard let key = selected?.key, key != displayedKey else { return }
            if displayedKey == nil {
                displayedKey = key
                return
            }
            try? await Task.sleep(for: cardSwapDebounce)
            withAnimation(.easeInOut(duration: 0.18)) {
                displayedKey = key
            }
        }
    }

    @ViewBuilder
    private func card(
        layout: DialLayout,
        dock: DialGeometry.Dock,
        along: CGFloat,
        diameter: CGFloat,
        height: CGFloat
    ) -> some View {
        if let key = displayedKey, let substance = store.substance(key: key) {
            SubstanceDetailView(substance: substance, embedded: true)
                .id(key)
                .frame(maxWidth: .infinity)
                .safeAreaInset(edge: .bottom) {
                    Color.clear
                        .frame(height: cardClearance(dock: dock, along: along, diameter: diameter, height: height))
                        .allowsHitTesting(false)
                }
                .transition(.opacity)
        } else if layout.substances.isEmpty {
            ContentUnavailableView(
                String(localized: "dial.pageTitle"),
                systemImage: "circle.dotted",
                description: Text(store.loadError ?? "Run pnpm datapack")
            )
        } else {
            Color.clear
        }
    }

    private var scrim: some View {
        LinearGradient(
            colors: [PsyCardsColors.ink.opacity(0), PsyCardsColors.ink.opacity(0.92)],
            startPoint: .top,
            endPoint: .bottom
        )
        .frame(height: 130)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .allowsHitTesting(false)
    }

    private func detentMarker(dock: DialGeometry.Dock, diameter: CGFloat, center: CGPoint) -> some View {
        let inset = diameter / 2 + 7.5
        let position: CGPoint = switch dock {
        case .trailing: CGPoint(x: center.x - inset, y: center.y)
        case .leading: CGPoint(x: center.x + inset, y: center.y)
        case .bottom: CGPoint(x: center.x, y: center.y - inset)
        }
        let size: CGSize = dock == .bottom ? CGSize(width: 12, height: 9) : CGSize(width: 9, height: 12)
        return DetentTriangle(dock: dock)
            .fill(PsyCardsColors.fg)
            .frame(width: size.width, height: size.height)
            .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
            .position(position)
            .allowsHitTesting(false)
    }

    private func hubHandle(
        diameter: CGFloat,
        center: CGPoint,
        parked: CGPoint,
        canvas: CGSize
    ) -> some View {
        let hubDiameter = diameter * CGFloat(DialGeometry.hubRadius / 100)
        return Circle()
            .fill(.clear)
            .frame(width: max(hubDiameter, 44), height: max(hubDiameter, 44))
            .contentShape(Circle())
            .highPriorityGesture(hubDrag(parked: parked, canvas: canvas))
            .contextMenu {
                Button(String(localized: "dial.dockLeading", defaultValue: "Snap to left")) {
                    snap(to: .leading, along: resolvedAlong())
                }
                Button(String(localized: "dial.dockTrailing", defaultValue: "Snap to right")) {
                    snap(to: .trailing, along: resolvedAlong())
                }
                Button(String(localized: "dial.dockBottom", defaultValue: "Snap to bottom")) {
                    snap(to: .bottom, along: 0.5)
                }
            }
            .position(center)
            .accessibilityLabel(Text(String(localized: "dial.hubMove", defaultValue: "Move substance dial")))
            .accessibilityHint(Text(String(localized: "dial.hubMoveHint", defaultValue: "Drag to snap the wheel to a side or the bottom. Activate to open the selected substance.")))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: Text(String(localized: "dial.dockLeading", defaultValue: "Snap to left"))) {
                snap(to: .leading, along: resolvedAlong())
            }
            .accessibilityAction(named: Text(String(localized: "dial.dockTrailing", defaultValue: "Snap to right"))) {
                snap(to: .trailing, along: resolvedAlong())
            }
            .accessibilityAction(named: Text(String(localized: "dial.dockBottom", defaultValue: "Snap to bottom"))) {
                snap(to: .bottom, along: 0.5)
            }
            .accessibilityAction {
                if let selected {
                    pushedSubstance = store.substance(key: selected.key)
                }
            }
    }

    private func hubDrag(parked: CGPoint, canvas: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let distance = hypot(value.translation.width, value.translation.height)
                guard distance > 8 else { return }
                if !isMoving { isMoving = true }
                dragTranslation = value.translation
            }
            .onEnded { value in
                let distance = hypot(value.translation.width, value.translation.height)
                if distance <= 8 {
                    dragTranslation = .zero
                    isMoving = false
                    if let selected {
                        pushedSubstance = store.substance(key: selected.key)
                    }
                    return
                }
                let dropped = CGPoint(
                    x: parked.x + value.translation.width,
                    y: parked.y + value.translation.height
                )
                let snapped = WheelSnap.target(from: dropped, in: canvas)
                commitDock(snapped.dock, along: snapped.along)
            }
    }

    private func resolvedDock(compact: Bool) -> DialGeometry.Dock {
        DialGeometry.Dock(rawValue: dockEdgeRaw) ?? (compact ? .trailing : .leading)
    }

    private func resolvedAlong() -> CGFloat {
        dockAlong >= 0 ? CGFloat(dockAlong) : defaultSideAlong
    }

    private func parkedCenter(dock: DialGeometry.Dock, along: CGFloat, in size: CGSize) -> CGPoint {
        let clamped = min(max(along, 0.14), 0.88)
        switch dock {
        case .leading:
            return CGPoint(x: 0, y: size.height * clamped)
        case .trailing:
            return CGPoint(x: size.width, y: size.height * clamped)
        case .bottom:
            return CGPoint(x: size.width * clamped, y: size.height)
        }
    }

    private func snap(to dock: DialGeometry.Dock, along: CGFloat) {
        commitDock(dock, along: along)
    }

    private func commitDock(_ dock: DialGeometry.Dock, along: CGFloat) {
        let apply = {
            dockEdgeRaw = dock.rawValue
            dockAlong = Double(along)
            dragTranslation = .zero
            isMoving = false
        }
        if reduceMotion {
            apply()
        } else {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) {
                apply()
            }
        }
    }

    private func showsScrim(dock: DialGeometry.Dock, along: CGFloat) -> Bool {
        dock == .bottom || along > 0.68
    }

    private func cardClearance(dock: DialGeometry.Dock, along: CGFloat, diameter: CGFloat, height: CGFloat) -> CGFloat {
        if dock == .bottom { return max(150, diameter * 0.42) }
        if along > 0.7 { return 130 }
        return 32
    }
}

enum WheelSnap {
    static func target(from point: CGPoint, in size: CGSize) -> (dock: DialGeometry.Dock, along: CGFloat) {
        let leading = max(point.x, 0)
        let trailing = max(size.width - point.x, 0)
        let bottom = max(size.height - point.y, 0)
        if bottom <= leading && bottom <= trailing {
            return (.bottom, min(max(point.x / max(size.width, 1), 0.14), 0.88))
        }
        let along = min(max(point.y / max(size.height, 1), 0.14), 0.88)
        return leading <= trailing ? (.leading, along) : (.trailing, along)
    }

    static func dock(from point: CGPoint, in size: CGSize) -> DialGeometry.Dock {
        target(from: point, in: size).dock
    }
}

private struct DetentTriangle: Shape {
    var dock: DialGeometry.Dock

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch dock {
        case .trailing:
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        case .leading:
            path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        case .bottom:
            path.move(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        }
        path.closeSubpath()
        return path
    }
}
