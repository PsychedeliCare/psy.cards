import SwiftUI

enum CardSide: Hashable {
    case front
    case back
}

/// Two-sided substance card (web `.psy-deck`). Narrow: one card that flips
/// in 3D — from the side picker, the flip buttons, or a horizontal swipe
/// that the card follows. Wide: both sides side by side.
struct SubstanceCardDeck: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let card: SubstanceCardData
    let moleculeAsset: String?
    let onSelectCombo: (String) -> Void
    let onShowAllCombos: () -> Void

    /// Cumulative flip angle, so each turn follows the gesture direction.
    @State private var angle: Double = 0
    @State private var dragAngle: Double = 0
    @Namespace private var pickerNamespace

    private static let flipAnimation = Animation.timingCurve(0.45, 0.05, 0.2, 1, duration: 0.72)
    private static let spreadMinWidth: CGFloat = 760
    /// A single card stays card-sized on wide screens (web: 30rem).
    private static let maxCardWidth: CGFloat = 540

    private var side: CardSide {
        let normalized = (angle.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        return abs(normalized - 180) < 90 ? .back : .front
    }

    /// Available width; both sides are shown once there is room for two cards.
    @State private var availableWidth: CGFloat = 0

    var body: some View {
        Group {
            if availableWidth >= Self.spreadMinWidth {
                spread
                    .frame(maxWidth: Self.maxCardWidth * 2 + 20)
            } else {
                single
                    .frame(maxWidth: Self.maxCardWidth)
            }
        }
        .frame(maxWidth: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { availableWidth = $0 }
        .onChange(of: card.key) { _, _ in
            angle = 0
            dragAngle = 0
        }
    }

    // MARK: Wide

    private var spread: some View {
        HStack(alignment: .top, spacing: 20) {
            CardSurface(card: card, side: .front) { front(swipe: 0) }
            CardSurface(card: card, side: .back) { back }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Narrow

    private var single: some View {
        VStack(spacing: 14) {
            sidePicker
            GeometryReader { geo in
                Color.clear.preference(key: CardWidthKey.self, value: geo.size.width)
            }
            .frame(height: 0)
            StackedFaces(visible: side == .front ? 0 : 1) {
                CardSurface(card: card, side: .front) { front(swipe: dragAngle / 180) }
                    .modifier(FlipFace(angle: angle + dragAngle, isBack: false, reduceMotion: reduceMotion))
                CardSurface(card: card, side: .back) { back }
                    .modifier(FlipFace(angle: angle + dragAngle, isBack: true, reduceMotion: reduceMotion))
            }
            .accessibilityIdentifier("card-deck")
            .gesture(swipeGesture)
            .sensoryFeedback(.impact(weight: .light), trigger: side)
            .accessibilityAction(named: Text(side == .front ? store.t("card.flipToSafety") : store.t("card.flipToDose"))) {
                flip(direction: side == .front ? -1 : 1)
            }
        }
        .onPreferenceChange(CardWidthKey.self) { cardWidth = $0 }
    }

    @State private var cardWidth: CGFloat = 360

    private func front(swipe: Double) -> some View {
        CardFrontView(card: card, moleculeAsset: moleculeAsset, swipe: swipe) {
            flip(direction: -1)
        }
    }

    private var back: some View {
        CardBackView(
            card: card,
            onFlip: { flip(direction: 1) },
            onSelectCombo: onSelectCombo,
            onShowAllCombos: onShowAllCombos
        )
    }

    private var sidePicker: some View {
        HStack(spacing: 2) {
            sideButton(.front, title: store.t("card.faceDose"), icon: "scales-fill")
            sideButton(.back, title: store.t("card.faceSafety"), icon: "shield-warning-fill")
        }
        .padding(3)
        .glassEffect(.regular.interactive(), in: .capsule)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(store.t("card.sides"))
    }

    private func sideButton(_ target: CardSide, title: String, icon: String) -> some View {
        let selected = side == target
        return Button {
            guard side != target else { return }
            // Tabs turn the card like a page: left to see the back, right to return.
            flip(direction: target == .back ? -1 : 1)
        } label: {
            HStack(spacing: 6) {
                PhIcon(icon, size: 15)
                Text(title)
                    .font(.subheadline.weight(.bold))
            }
            .foregroundStyle(selected ? PsyCardsColors.ink : PsyCardsColors.fgMute)
            .padding(.horizontal, 16)
            .frame(height: 38)
            .background {
                if selected {
                    Capsule()
                        .fill(PsyCardsColors.fg)
                        .matchedGeometryEffect(id: "side", in: pickerNamespace)
                }
            }
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier(target == .front ? "side-dose" : "side-safety")
    }

    // MARK: Flip

    private func flip(direction: Double) {
        let animation = reduceMotion ? Animation.easeInOut(duration: 0.25) : Self.flipAnimation
        withAnimation(animation) {
            angle += direction * 180
            dragAngle = 0
        }
    }

    /// The card follows a horizontal swipe, then completes or springs back.
    private var swipeGesture: HorizontalSwipeGesture {
        HorizontalSwipeGesture { dx in
            guard !reduceMotion else { return }
            dragAngle = max(-170, min(170, dx / max(cardWidth, 1) * 200))
        } onEnded: { dx, velocity in
            let projected = dx + velocity * 0.2
            if abs(dx) >= 48 || abs(projected) >= cardWidth * 0.45 {
                flip(direction: (abs(dx) >= 48 ? dx : projected) < 0 ? -1 : 1)
            } else {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { dragAngle = 0 }
            }
        }
    }
}

private struct CardWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 360
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Shows one face of the card depending on the (animated) flip angle.
private struct FlipFace: ViewModifier, Animatable {
    var angle: Double
    let isBack: Bool
    let reduceMotion: Bool

    nonisolated var animatableData: Double {
        get { angle }
        set { angle = newValue }
    }

    private var faceAngle: Double { angle + (isBack ? 180 : 0) }
    private var isVisible: Bool { cos(faceAngle * .pi / 180) > 0 }

    func body(content: Content) -> some View {
        content
            .rotation3DEffect(
                .degrees(reduceMotion ? 0 : faceAngle),
                axis: (x: 0, y: 1, z: 0),
                perspective: 0.28
            )
            .opacity(isVisible ? 1 : 0)
            .allowsHitTesting(isVisible)
            .accessibilityHidden(!isVisible)
    }
}

/// Lays both faces on top of each other at the height of the taller one,
/// so a flip never changes the card's size.
/// Both faces on top of each other. The card takes the height of the side
/// that shows (each side is laid out at its own height), so the shorter side
/// has no empty space at the bottom.
private struct StackedFaces: Layout {
    var visible: Int

    private func height(of subview: LayoutSubview, width: CGFloat) -> CGFloat {
        max(subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height, width * 1.35)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 380
        guard !subviews.isEmpty else { return CGSize(width: width, height: 0) }
        let shown = subviews[min(visible, subviews.count - 1)]
        return CGSize(width: width, height: height(of: shown, width: width))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for subview in subviews {
            subview.place(
                at: bounds.origin,
                proposal: ProposedViewSize(width: bounds.width, height: height(of: subview, width: bounds.width))
            )
        }
    }
}

/// The physical card: hue-washed face, accent along the top edge, soft
/// radial light and (on the back) fine diagonal hatching.
struct CardSurface<Content: View>: View {
    let card: SubstanceCardData
    let side: CardSide
    @ViewBuilder var content: Content

    private static var radius: CGFloat { 26 }

    var body: some View {
        let hue = PsyCardsColors.group(card.group)
        let shape = RoundedRectangle(cornerRadius: Self.radius, style: .continuous)
        content
            .background {
                ZStack {
                    PsyCardsColors.face(card.group)
                    if side == .front {
                        EllipticalGradient(
                            colors: [hue.opacity(0.2), .clear],
                            center: .topTrailing,
                            startRadiusFraction: 0,
                            endRadiusFraction: 0.75
                        )
                        EllipticalGradient(
                            colors: [hue.opacity(0.08), .clear],
                            center: .bottomLeading,
                            startRadiusFraction: 0,
                            endRadiusFraction: 0.6
                        )
                    } else {
                        HatchPattern(color: PsyCardsColors.fg.opacity(0.022), spacing: 11, lineWidth: 1)
                        EllipticalGradient(
                            colors: [hue.opacity(0.13), .clear],
                            center: .topLeading,
                            startRadiusFraction: 0,
                            endRadiusFraction: 0.65
                        )
                    }
                }
            }
            .overlay(alignment: .top) {
                LinearGradient(
                    colors: [hue.mix(with: .black, by: 0.1), hue, hue.mix(with: .white, by: 0.18)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(height: 5)
                .accessibilityHidden(true)
            }
            .clipShape(shape)
            .overlay(shape.strokeBorder(PsyCardsColors.faceEdge, lineWidth: 1))
            .overlay(alignment: .top) {
                shape
                    .strokeBorder(
                        LinearGradient(colors: [.white.opacity(0.12), .clear], startPoint: .top, endPoint: .center),
                        lineWidth: 1
                    )
                    .allowsHitTesting(false)
            }
            .shadow(color: .black.opacity(0.5), radius: 22, y: 16)
            .shadow(color: .black.opacity(0.3), radius: 5, y: 3)
            .accessibilityElement(children: .contain)
    }
}
