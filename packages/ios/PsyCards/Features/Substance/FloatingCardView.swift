import SwiftUI

/// Zoomed-in card: the two-sided card floats over the blurred, darkened
/// context it was opened from; the details sit in a panel peeking from the
/// bottom edge that is pulled up to read them.
struct FloatingCardView: View {
    @Environment(DataPackStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let substance: Substance

    @State private var selectedPair: ComboPair?
    @State private var detailsExpanded = false
    @State private var dragOffset: CGFloat = 0
    @State private var detailsOverscroll: CGFloat = 0
    @State private var combosRequest = 0

    private static let peekHeight: CGFloat = 64
    private static let expandedInset: CGFloat = 8
    /// Pulling the expanded details this far past their top folds them away.
    private static let collapseOverscroll: CGFloat = 70

    private var panelAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.86)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .top) {
                if let card = store.card(key: substance.key) {
                    cardStage(card: card, height: geo.size.height - Self.peekHeight)
                    detailsPanel(card: card, geo: geo)
                } else {
                    ContentUnavailableView(substance.prettyName, systemImage: "rectangle.on.rectangle.slash")
                }
            }
        }
        .overlay(alignment: .topTrailing) {
            closeButton
                .opacity(detailsExpanded ? 0 : 1)
        }
        .sheet(item: $selectedPair) { pair in
            ComboPairSheet(pair: pair)
                .psyCardsSheetPresentation(detents: [.medium, .large])
        }
    }

    // MARK: Card

    private func cardStage(card: SubstanceCardData, height: CGFloat) -> some View {
        ScrollView {
            SubstanceCardDeck(
                card: card,
                moleculeAsset: card.details.hasStructure ? substance.molecule?.assetName : nil,
                onSelectCombo: { selectedPair = store.pair(a: substance.key, b: $0) },
                onShowAllCombos: {
                    setExpanded(true)
                    combosRequest += 1
                }
            )
            .frame(maxWidth: 1040)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: height)
            .background {
                // Taps on the dimmed backdrop around the card close it.
                Color.clear
                    .contentShape(.rect)
                    .onTapGesture { dismiss() }
                    .accessibilityHidden(true)
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollIndicators(.hidden)
        .frame(height: height)
        .shadow(color: .black.opacity(0.45), radius: 30, y: 16)
        .scaleEffect(detailsExpanded ? 0.94 : 1, anchor: .top)
        .opacity(detailsExpanded ? 0.5 : 1)
    }

    private var closeButton: some View {
        Button {
            dismiss()
        } label: {
            Image(systemName: "xmark")
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .padding(.trailing, 16)
        .padding(.top, 4)
        .accessibilityLabel(store.t("layout.close"))
        .accessibilityIdentifier("card-close")
    }

    // MARK: Details panel

    private func detailsPanel(card: SubstanceCardData, geo: GeometryProxy) -> some View {
        let collapsedTop = geo.size.height - Self.peekHeight
        let restingTop = detailsExpanded ? Self.expandedInset : collapsedTop
        let top = min(max(restingTop + dragOffset, Self.expandedInset * 0.5), collapsedTop + 24)
        let shape = UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30, style: .continuous)

        return VStack(spacing: 0) {
            panelHandle(card: card)
            ScrollViewReader { proxy in
                ScrollView {
                    SubstanceDetailsSection(substance: substance, card: card, showsTitle: false) { partner in
                        selectedPair = store.pair(a: substance.key, b: partner)
                    }
                    .frame(maxWidth: 640)
                    .padding(.horizontal, 20)
                    .padding(.bottom, geo.safeAreaInsets.bottom + 32)
                    .frame(maxWidth: .infinity)
                }
                .scrollDisabled(!detailsExpanded)
                // Folded, only the handle shows; the content fades in as it rises.
                .opacity(detailsExpanded || dragOffset < -12 ? 1 : 0)
                .accessibilityHidden(!detailsExpanded)
                .onScrollGeometryChange(for: CGFloat.self) { scroll in
                    -(scroll.contentOffset.y + scroll.contentInsets.top)
                } action: { _, overscroll in
                    detailsOverscroll = overscroll
                }
                .onScrollPhaseChange { old, _ in
                    // Pulling down past the top of the details folds them back.
                    if old == .interacting, detailsOverscroll > Self.collapseOverscroll {
                        setExpanded(false)
                    }
                }
                .onChange(of: combosRequest) {
                    withAnimation(.smooth) {
                        proxy.scrollTo(SubstanceCardContent.combosAnchor, anchor: .top)
                    }
                }
            }
        }
        .frame(height: geo.size.height - Self.expandedInset + geo.safeAreaInsets.bottom, alignment: .top)
        .background {
            shape
                .fill(PsyCardsColors.ink2)
                .overlay(shape.strokeBorder(PsyCardsColors.fg.opacity(0.1)))
                .shadow(color: .black.opacity(0.35), radius: 24, y: -4)
        }
        .clipShape(shape)
        .offset(y: top)
        .accessibilityElement(children: .contain)
    }

    private func panelHandle(card: SubstanceCardData) -> some View {
        VStack(spacing: 10) {
            Capsule()
                .fill(PsyCardsColors.fg.opacity(0.3))
                .frame(width: 38, height: 5)
            HStack(spacing: 8) {
                Text(store.t("card.details", ["name": card.displayName]))
                    .font(.headline.weight(.heavy))
                    .foregroundStyle(PsyCardsColors.fg)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.up")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(PsyCardsColors.fgMute)
                    .rotationEffect(.degrees(detailsExpanded ? 180 : 0))
            }
            .padding(.horizontal, 20)
        }
        .padding(.top, 8)
        .frame(height: Self.peekHeight - 8, alignment: .top)
        .frame(maxWidth: .infinity)
        .contentShape(.rect)
        .onTapGesture { setExpanded(!detailsExpanded) }
        .gesture(panelDrag)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(store.t("card.details", ["name": card.displayName]))
        .accessibilityAddTraits(.isButton)
        .accessibilityValue(detailsExpanded ? store.t("layout.close") : "")
        .accessibilityAction { setExpanded(!detailsExpanded) }
        .accessibilityIdentifier("card-details-handle")
    }

    private var panelDrag: some Gesture {
        DragGesture(minimumDistance: 6)
            .onChanged { value in
                dragOffset = value.translation.height
            }
            .onEnded { value in
                let projected = value.predictedEndTranslation.height
                let expand = detailsExpanded ? projected < 140 : projected < -80
                withAnimation(panelAnimation) {
                    dragOffset = 0
                    detailsExpanded = expand
                }
            }
    }

    private func setExpanded(_ expanded: Bool) {
        withAnimation(panelAnimation) {
            detailsExpanded = expanded
            dragOffset = 0
        }
    }
}

/// Blurred, darkened copy of whatever the card was opened from.
private struct FloatingCardBackdrop: View {
    var body: some View {
        Rectangle()
            .fill(.ultraThinMaterial)
            .overlay(Color.black.opacity(0.45))
            .ignoresSafeArea()
    }
}

extension View {
    /// Presents `item` as a floating card over this view, zooming out of the
    /// `matchedTransitionSource` with the substance key as id when given.
    func floatingCard(item: Binding<Substance?>, zoomNamespace: Namespace.ID? = nil) -> some View {
        fullScreenCover(item: item) { substance in
            FloatingCardView(substance: substance)
                .presentationBackground { FloatingCardBackdrop() }
                .modifier(ZoomTransition(sourceID: substance.key, namespace: zoomNamespace))
        }
    }
}

private struct ZoomTransition: ViewModifier {
    let sourceID: String
    let namespace: Namespace.ID?

    func body(content: Content) -> some View {
        if let namespace {
            content.navigationTransition(.zoom(sourceID: sourceID, in: namespace))
        } else {
            content
        }
    }
}
