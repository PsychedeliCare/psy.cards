import SwiftUI

// MARK: - Geometry
//
// Swift port of `packages/web/src/lib/dial-geometry.ts` — keep the two in
// sync. Angle convention: degrees, 0° = north (12 o'clock), increasing
// clockwise. Radii live in the web dial's unit space (SVG viewBox −100…100);
// multiply by `scale` (= diameter / 200) to get points.

enum DialGeometry {
    static let hubRadius = 24.0
    static let categoryInner = 24.0
    static let categoryOuter = 50.0
    static let substanceInner = 50.0
    static let substanceOuter = 98.0
    static let rimRadius = 98.0
    /// Radial substance labels start here and must not bleed past r = 98.
    static let substanceLabelRadius = 54.0
    static let categoryLabelRadius = 44.0
    static let categoryLabelInset = 2.0
    static let labelBaseSize = 5.8
    static let labelMinSize = 3.8
    /// Available radial run for a substance label (54 → ~94).
    static let labelMaxWidth = 40.0
    static let categoryLabelBaseSize = 5.2
    static let categoryLabelMinSize = 2.6
    static let categoryLabelTracking = 0.3
    static let hubLabelSize = 3.4

    /// The selection marker sits at 90° (east) at every size (web DESKTOP_DETENT).
    static let detent = 90.0

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

    /// Annular sector between two radii and two angles.
    static func ringWedge(inner: Double, outer: Double, start: Double, end: Double, scale: CGFloat) -> Path {
        var path = Path()
        path.addArc(center: .zero, radius: outer * scale, startAngle: .degrees(start - 90), endAngle: .degrees(end - 90), clockwise: false)
        path.addArc(center: .zero, radius: inner * scale, startAngle: .degrees(end - 90), endAngle: .degrees(start - 90), clockwise: true)
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
    /// equivalent target within ±180° of `current` so the dial never unwinds.
    static func rotation(for midAngle: Double, detent: Double, current: Double) -> Double {
        let base = detent - midAngle
        let k = ((current - base) / 360).rounded()
        return base + k * 360
    }

    static func wedgeContains(_ angle: Double, start: Double, end: Double) -> Bool {
        normalize(angle - start) < (end - start)
    }

    /// Category labels read reversed when centred within 90° of 192°; the
    /// boundary sits just past vertical, away from the east marker (web).
    static func categoryReversed(absolute: Double) -> Bool {
        circularDistance(absolute, 192) < 90
    }

    /// Substance labels flip on the western half (web reverse centre 270°).
    static func substanceReversed(absolute: Double) -> Bool {
        circularDistance(absolute, 270) < 90
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
                label: store.groupLabel(input.group).uppercased(with: store.swiftLocale),
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
// The dial face (both wedge rings and their labels) is a single Canvas.
// Live rotation is a GPU-only `rotationEffect`, so dragging and snapping
// never redraw it; the canvas re-renders only when the label-orientation
// snapshot advances (every ~30° of travel) or the active substance changes.

private struct DialCanvas: View, Equatable {
    let layout: DialLayout
    /// Rotation snapshot used only for keeping labels upright.
    let labelFlipRotation: Double
    let activeKey: String?

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
                let hue = PsyCardsColors.group(category.group)
                ctx.fill(wedge, with: .color(hue.mix(with: .white, by: 0.12)))
                ctx.stroke(wedge, with: .color(PsyCardsColors.ink), lineWidth: 0.45 * scale)
            }

            for substance in layout.substances {
                let wedge = DialGeometry.ringWedge(
                    inner: DialGeometry.substanceInner,
                    outer: DialGeometry.substanceOuter,
                    start: substance.startAngle,
                    end: substance.endAngle,
                    scale: scale
                )
                let hue = PsyCardsColors.group(substance.group)
                let active = substance.key == activeKey
                ctx.fill(wedge, with: .color(active ? hue.mix(with: .white, by: 0.28) : hue))
                ctx.stroke(wedge, with: .color(PsyCardsColors.ink), lineWidth: (active ? 1 : 0.45) * scale)
            }

            for category in layout.categories {
                drawCategoryLabel(ctx, category, scale: scale)
            }
            for substance in layout.substances {
                drawSubstanceLabel(ctx, substance, scale: scale)
            }
        }
    }

    private func labelText(_ string: String, size: CGFloat, weight: Font.Weight) -> Text {
        Text(string)
            .font(.system(size: size, weight: weight))
            .foregroundStyle(PsyCardsColors.ink)
    }

    private func measure(_ text: GraphicsContext.ResolvedText) -> CGSize {
        text.measure(in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude))
    }

    /// Radial label starting at r = 54, auto-fitted so it never bleeds past
    /// the rim, flipped in place on the western half so it never reads
    /// upside down (web `substanceLabelOrientation`).
    private func drawSubstanceLabel(_ ctx: GraphicsContext, _ substance: DialSubstanceLayout, scale: CGFloat) {
        let weight: Font.Weight = substance.key == activeKey ? .heavy : .semibold
        let baseSize = DialGeometry.labelBaseSize * scale
        var resolved = ctx.resolve(labelText(substance.label, size: baseSize, weight: weight))
        let maxWidth = DialGeometry.labelMaxWidth * scale
        let width = measure(resolved).width
        if width > maxWidth {
            let fitted = max(DialGeometry.labelMinSize * scale, baseSize * maxWidth / width)
            resolved = ctx.resolve(labelText(substance.label, size: fitted, weight: weight))
        }

        let flipped = DialGeometry.substanceReversed(absolute: substance.midAngle + labelFlipRotation)
        var c = ctx
        let anchor = DialGeometry.point(radius: DialGeometry.substanceLabelRadius * scale, angle: substance.midAngle)
        c.translateBy(x: anchor.x, y: anchor.y)
        c.rotate(by: .degrees(substance.midAngle - 90 + (flipped ? 180 : 0)))
        c.draw(resolved, at: .zero, anchor: flipped ? .trailing : .leading)
    }

    /// Uppercase label laid glyph-by-glyph along an arc at r = 44, centred
    /// on the wedge, auto-fitted to the arc length, and drawn in reverse on
    /// the lower half so it stays upright (web textPath forward/reverse).
    private func drawCategoryLabel(_ ctx: GraphicsContext, _ category: DialCategoryLayout, scale: CGFloat) {
        let label = category.label
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

        let reversed = DialGeometry.categoryReversed(absolute: category.midAngle + labelFlipRotation)
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
    @Environment(DataPackStore.self) private var store
    let layout: DialLayout
    let diameter: CGFloat
    /// Angle of the selection marker.
    var detent = DialGeometry.detent
    @Binding var selectedKey: String?
    let onActivate: (DialSubstanceLayout) -> Void
    let onSelectCategory: (DialCategoryLayout) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var rotation = 0.0
    @State private var labelFlipRotation = 0.0
    @State private var dragPreviousAngle: Double?

    /// Degrees of travel between label-orientation resyncs (matches the web dial).
    private let labelSyncTravel = 30.0
    /// Fling projection horizon: extra travel ≈ angular velocity × τ.
    private let flingProjection = 0.15
    private let maxFlingTravel = 720.0

    private var scale: CGFloat { diameter / 200 }

    private var activeIndex: Int {
        layout.substances.isEmpty ? -1 : DialGeometry.activeIndex(midAngles: layout.midAngles, rotation: rotation, detent: detent)
    }

    private var activeSubstance: DialSubstanceLayout? {
        layout.substances.indices.contains(activeIndex) ? layout.substances[activeIndex] : nil
    }

    var body: some View {
        ZStack {
            DialCanvas(layout: layout, labelFlipRotation: labelFlipRotation, activeKey: activeSubstance?.key)
                .equatable()
                .rotationEffect(.degrees(rotation))

            // Hub and rim are rotation invariant and stay outside the rotor.
            Circle()
                .fill(PsyCardsColors.ink)
                .frame(width: DialGeometry.hubRadius * 2 * scale, height: DialGeometry.hubRadius * 2 * scale)
                .overlay {
                    Text("PSY.CARDS")
                        .font(.system(size: DialGeometry.hubLabelSize * scale, weight: .heavy))
                        .tracking(0.7 * scale)
                        .foregroundStyle(PsyCardsColors.fgMute)
                }
                .allowsHitTesting(false)
            Circle()
                .strokeBorder(PsyCardsColors.ink, lineWidth: 1 * scale)
                .frame(width: (DialGeometry.rimRadius * 2 + 1) * scale, height: (DialGeometry.rimRadius * 2 + 1) * scale)
                .allowsHitTesting(false)

            // Unrotated hit surface: gesture locations stay in dial-local
            // coordinates regardless of the current rotation.
            Color.clear
                .contentShape(Circle())
                .gesture(SpatialTapGesture().onEnded { handleTap($0.location) })
                .highPriorityGesture(dragGesture)
        }
        .frame(width: diameter, height: diameter)
        .onAppear(perform: seat)
        .onChange(of: layout) { _, _ in seat() }
        .onChange(of: selectedKey) { _, key in
            // External selection (picker, prev/next): bring it to the marker.
            guard let key, key != activeSubstance?.key,
                  let target = layout.substances.first(where: { $0.key == key }) else { return }
            snap(toMidAngle: target.midAngle)
        }
        .onChange(of: activeIndex) { _, newValue in
            if layout.substances.indices.contains(newValue), selectedKey != layout.substances[newValue].key {
                selectedKey = layout.substances[newValue].key
            }
        }
        .sensoryFeedback(.selection, trigger: activeIndex)
        .accessibilityElement()
        .accessibilityLabel(Text(store.t("dial.ariaLabel")))
        .accessibilityValue(Text(activeSubstance?.label ?? ""))
        .accessibilityHint(Text(store.t("dial.hint")))
        .accessibilityAdjustableAction { direction in
            step(direction == .increment ? 1 : -1)
        }
        .accessibilityAction {
            if let activeSubstance { onActivate(activeSubstance) }
        }
    }

    private func step(_ delta: Int) {
        let count = layout.substances.count
        guard count > 0 else { return }
        let next = ((activeIndex + delta) % count + count) % count
        snap(toMidAngle: layout.substances[next].midAngle)
    }

    // MARK: Rotation

    /// Instantly puts the current selection (or the first substance) under the marker.
    private func seat() {
        guard !layout.substances.isEmpty else { return }
        let index = selectedKey.flatMap { key in layout.substances.firstIndex { $0.key == key } } ?? 0
        let target = DialGeometry.rotation(for: layout.substances[index].midAngle, detent: detent, current: rotation)
        rotation = target
        labelFlipRotation = target
        if selectedKey != layout.substances[index].key {
            selectedKey = layout.substances[index].key
        }
    }

    private func snap(toMidAngle midAngle: Double, reference: Double? = nil) {
        let target = DialGeometry.rotation(for: midAngle, detent: detent, current: reference ?? rotation)
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
        DragGesture(minimumDistance: 4)
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
        let omega = (dx * Double(value.velocity.height) - dy * Double(value.velocity.width)) / radiusSquared * 180 / .pi
        let extra = min(maxFlingTravel, max(-maxFlingTravel, omega * flingProjection))
        let projected = rotation + extra
        let index = DialGeometry.activeIndex(midAngles: layout.midAngles, rotation: projected, detent: detent)
        snap(toMidAngle: layout.substances[index].midAngle, reference: projected)
    }

    // MARK: Tap

    /// Substance wedge → rotate it to the marker (or open it when it is
    /// already there); category → its summary; hub → open the active one.
    private func handleTap(_ location: CGPoint) {
        guard !layout.substances.isEmpty else { return }
        let dx = location.x - diameter / 2
        let dy = location.y - diameter / 2
        let radiusUnits = Double(hypot(dx, dy) / scale)
        let localAngle = DialGeometry.normalize(screenAngle(of: location) - rotation)

        if radiusUnits < DialGeometry.hubRadius {
            if let activeSubstance { onActivate(activeSubstance) }
        } else if radiusUnits < DialGeometry.categoryOuter {
            if let category = layout.categories.first(where: {
                DialGeometry.wedgeContains(localAngle, start: $0.startAngle, end: $0.endAngle)
            }) {
                onSelectCategory(category)
            }
        } else if radiusUnits <= DialGeometry.rimRadius + 2 {
            if let substance = layout.substances.first(where: {
                DialGeometry.wedgeContains(localAngle, start: $0.startAngle, end: $0.endAngle)
            }) {
                if substance.key == activeSubstance?.key {
                    onActivate(substance)
                } else {
                    snap(toMidAngle: substance.midAngle)
                }
            }
        }
    }
}

// MARK: - Corner wheel

/// Long-press wheel: the jog dial anchored in the bottom-right corner,
/// within thumb reach, over the dimmed list. Turning it picks a substance;
/// the hub (or the selected wedge) opens its card, a category its summary.
struct WheelOverlay: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var selectedKey: String?
    @Binding var isPresented: Bool

    @State private var appeared = false
    @State private var floatingSubstance: Substance?
    @State private var category: DialCategoryLayout?

    /// The marker faces up-left, towards the middle of the screen.
    private let detent = 315.0

    var body: some View {
        let layout = DialLayout.build(from: store)
        GeometryReader { geo in
            let radius = min(geo.size.width * 0.66, 300)
            // The hub sits this far in from the corner.
            let inset = radius * 0.42
            let dialTopFromSafeBottom = radius + inset - geo.safeAreaInsets.bottom
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(Color.black.opacity(0.45))
                    .ignoresSafeArea()
                    .opacity(appeared ? 1 : 0)
                    .onTapGesture(perform: close)
                    .accessibilityHidden(true)

                dial(layout: layout, radius: radius)
                    .position(x: geo.size.width - inset, y: geo.size.height + geo.safeAreaInsets.bottom - inset)
                    .scaleEffect(appeared ? 1 : 0.3, anchor: .bottomTrailing)
                    .rotationEffect(.degrees(appeared || reduceMotion ? 0 : -50), anchor: .bottomTrailing)
                    .opacity(appeared ? 1 : 0)

                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Spacer()
                        closeButton
                    }
                    Spacer(minLength: 0)
                    selection(layout: layout)
                        .padding(.bottom, max(dialTopFromSafeBottom + 28, 0))
                }
                .padding(.horizontal, 20)
                .opacity(appeared ? 1 : 0)
            }
        }
        .onAppear {
            withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(response: 0.45, dampingFraction: 0.82)) {
                appeared = true
            }
        }
        .sheet(item: $category) { category in
            CategorySheet(group: category.group)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
        .floatingCard(item: $floatingSubstance)
    }

    private func dial(layout: DialLayout, radius: CGFloat) -> some View {
        SubstanceDialView(
            layout: layout,
            diameter: radius * 2,
            detent: detent,
            selectedKey: $selectedKey,
            onActivate: { floatingSubstance = store.substance(key: $0.key) },
            onSelectCategory: { category = $0 }
        )
        .background(
            Circle()
                .fill(PsyCardsColors.ink)
                .shadow(color: .black.opacity(0.55), radius: 26, y: 10)
        )
        .overlay {
            // Selection marker just outside the rim, pointing at the hub.
            let tip = DialGeometry.point(radius: radius + 9, angle: detent)
            MarkerTriangle()
                .fill(PsyCardsColors.fg)
                .frame(width: 9, height: 12)
                .rotationEffect(.degrees(detent - 90))
                .offset(x: tip.x, y: tip.y)
                .shadow(color: .black.opacity(0.6), radius: 2, y: 1)
                .accessibilityHidden(true)
        }
    }

    /// The substance under the marker; tapping it opens the card.
    private func selection(layout: DialLayout) -> some View {
        let current = layout.substances.first { $0.key == selectedKey }
        return Button {
            if let key = current?.key { floatingSubstance = store.substance(key: key) }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(current.map { store.groupLabel($0.group) } ?? "")
                    .font(.caption.weight(.heavy))
                    .tracking(1.1)
                    .textCase(.uppercase)
                    .foregroundStyle(PsyCardsColors.group(current?.group ?? ""))
                HStack(spacing: 8) {
                    Text(current?.label ?? "")
                        .font(.largeTitle.weight(.heavy))
                        .foregroundStyle(PsyCardsColors.fg)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .contentTransition(.opacity)
                    Image(systemName: "arrow.up.right")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(PsyCardsColors.fgMute)
                }
                Text(store.t("dial.hint"))
                    .font(.footnote)
                    .foregroundStyle(PsyCardsColors.fgMute)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .animation(.smooth(duration: 0.2), value: selectedKey)
        .accessibilityHint(store.t("search.substanceCard"))
        .accessibilityIdentifier("wheel-selection")
    }

    private var closeButton: some View {
        Button(action: close) {
            Image(systemName: "xmark")
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .padding(.top, 4)
        .accessibilityLabel(store.t("layout.close"))
        .accessibilityIdentifier("wheel-close")
    }

    private func close() {
        withAnimation(.easeIn(duration: 0.2)) {
            appeared = false
        } completion: {
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) { isPresented = false }
        }
    }
}

/// What a category tapped on the wheel is like: its typical effects and
/// every substance in it.
private struct CategorySheet: View {
    @Environment(DataPackStore.self) private var store
    let group: String
    @State private var floatingSubstance: Substance?

    private var summary: [String] {
        let key = "groupSummaries.\(group)"
        let text = store.t(key)
        guard text != key else { return [] }
        return text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    var body: some View {
        let hue = PsyCardsColors.group(group)
        ScrollView {
            VStack(alignment: .leading, spacing: PsyCardsSpacing.l) {
                VStack(alignment: .leading, spacing: 10) {
                    Capsule()
                        .fill(hue)
                        .frame(width: 36, height: 5)
                    Text(store.groupLabel(group))
                        .font(.largeTitle.weight(.heavy))
                        .foregroundStyle(PsyCardsColors.fg)
                        .accessibilityAddTraits(.isHeader)
                }

                if !summary.isEmpty {
                    FlowLayout(spacing: 6, lineSpacing: 6) {
                        ForEach(summary, id: \.self) { term in
                            Text(term)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(PsyCardsColors.fg)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(hue.opacity(0.16), in: .capsule)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text(store.t("landing.navList"))
                        .font(.footnote.weight(.heavy))
                        .tracking(1.1)
                        .textCase(.uppercase)
                        .foregroundStyle(PsyCardsColors.fgMute)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(store.substances.filter { $0.group == group }) { substance in
                        Button {
                            floatingSubstance = substance
                        } label: {
                            SubstanceRow(substance: substance)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(PsyCardsSpacing.l)
            .padding(.top, PsyCardsSpacing.s)
        }
        .floatingCard(item: $floatingSubstance)
    }
}

private struct MarkerTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
