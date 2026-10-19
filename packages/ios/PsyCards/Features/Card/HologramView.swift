import CoreMotion
import Observation
import SwiftUI

/// Device tilt for the holographic artwork, shared by every visible card.
/// Gravity needs no permission prompt; updates stop when no card is shown.
@Observable
@MainActor
final class TiltMotion {
    static let shared = TiltMotion()

    private(set) var tilt: CGPoint = .zero
    @ObservationIgnored private let manager = CMMotionManager()
    @ObservationIgnored private var users = 0

    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    func start() {
        users += 1
        guard users == 1, manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 30
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let gravity = motion?.gravity else { return }
            let x = gravity.x
            let y = gravity.y
            MainActor.assumeIsolated {
                self?.update(x: x, y: y)
            }
        }
    }

    func stop() {
        users = max(0, users - 1)
        if users == 0 { manager.stopDeviceMotionUpdates() }
    }

    private func update(x: Double, y: Double) {
        // Held upright the phone reads y ≈ −0.6; centre the light there.
        let target = CGPoint(x: min(1, max(-1, x * 1.6)), y: min(1, max(-1, (y + 0.6) * 1.6)))
        tilt = CGPoint(x: tilt.x + (target.x - tilt.x) * 0.18, y: tilt.y + (target.y - tilt.y) * 0.18)
    }
}

/// Holographic molecule in the card's top-right corner (web
/// `.substance-hologram`, adapted from vgpu's Holographic Card, MIT):
/// pearl foil strokes and faint engraving that catch a light band as the
/// device tilts. Pure SwiftUI, so building needs no Metal toolchain.
struct MoleculeHologram: View {
    let assetName: String
    /// Extra tilt while the card is being swiped (−1…1).
    var swipe: Double = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var motion = TiltMotion.shared

    var body: some View {
        Group {
            if reduceMotion {
                artwork(tilt: CGPoint(x: 0.35, y: -0.25), strength: 0.6)
            } else if motion.isAvailable {
                artwork(tilt: CGPoint(x: motion.tilt.x + swipe, y: motion.tilt.y), strength: 1)
            } else {
                // Simulator / no gyroscope: a slow drift keeps the foil alive.
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: scenePhase != .active)) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    artwork(tilt: CGPoint(x: sin(t * 0.45) * 0.75 + swipe, y: cos(t * 0.31) * 0.45), strength: 1)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { if !reduceMotion { motion.start() } }
        .onDisappear { if !reduceMotion { motion.stop() } }
    }

    private func artwork(tilt: CGPoint, strength: Double) -> some View {
        let molecule = Image(assetName).resizable().scaledToFit().padding(18)
        return ZStack {
            // Engraving: always faintly there, brighter under the light band.
            EngravedRings()
                .opacity(0.03)
            EngravedRings()
                .opacity(0.11 * strength)
                .mask(LightBand(tilt: tilt, width: 0.32))

            // Foil strokes: cool ink, pearl iridescence and a sharp glint.
            ZStack {
                Color(red: 0.72, green: 0.76, blue: 0.80).opacity(0.22)
                PearlFoil(tilt: tilt)
                    .opacity(0.36 * strength)
                LightBand(tilt: tilt, width: 0.22)
                    .opacity(0.55 * strength)
                    .blendMode(.plusLighter)
                LightBand(tilt: tilt, width: 0.05)
                    .opacity(0.5 * strength)
                    .blendMode(.plusLighter)
            }
            .mask(molecule)
        }
        // Fade towards the card's centre and lower edge (web `region`/`fade`).
        .mask {
            EllipticalGradient(
                colors: [.white, .white.opacity(0.7), .clear],
                center: UnitPoint(x: 0.62, y: 0.38),
                startRadiusFraction: 0.1,
                endRadiusFraction: 0.72
            )
        }
        .compositingGroup()
    }
}

/// Pearlescent palette (web `pearlColor`): a cosine palette swept by tilt.
private struct PearlFoil: View {
    let tilt: CGPoint

    private static let stops: [Color] = (0...6).map { step in
        let phase = Double(step) / 6
        func channel(_ base: Double, _ amplitude: Double, _ offset: Double) -> Double {
            base + amplitude * cos(2 * .pi * (phase + offset))
        }
        return Color(
            red: channel(0.55, 0.43, 0.05),
            green: channel(0.52, 0.40, 0.38),
            blue: channel(0.64, 0.34, 0.63)
        )
    }

    var body: some View {
        AngularGradient(
            colors: Self.stops,
            center: UnitPoint(x: 0.5 + tilt.x * 0.35, y: 0.5 + tilt.y * 0.35),
            angle: .degrees(tilt.x * 120 - tilt.y * 80)
        )
    }
}

/// A diagonal band of light whose position follows the tilt.
private struct LightBand: View {
    let tilt: CGPoint
    var width: Double

    var body: some View {
        let center = 0.5 + (tilt.x * 0.72 + tilt.y * 0.52) * 0.45
        LinearGradient(
            stops: [
                .init(color: .clear, location: max(0, center - width)),
                .init(color: .white, location: min(1, max(0, center))),
                .init(color: .clear, location: min(1, center + width)),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

/// Warped concentric engraving and a fine dot grid (web `etchedPhase`).
private struct EngravedRings: View {
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width * 0.565, y: size.height * 0.54)
            var rings = Path()
            let spacing: CGFloat = 4.2
            var radius: CGFloat = spacing
            while radius < size.width * 0.9 {
                rings.addEllipse(in: CGRect(
                    x: center.x - radius,
                    y: center.y - radius * 0.76,
                    width: radius * 2,
                    height: radius * 1.52
                ))
                radius += spacing
            }
            context.stroke(rings, with: .color(.white), lineWidth: 0.6)

            var dots = Path()
            let step = size.width / 20
            var y = step / 2
            while y < size.height {
                var x = step / 2
                while x < size.width {
                    dots.addEllipse(in: CGRect(x: x - 0.5, y: y - 0.5, width: 1, height: 1))
                    x += step
                }
                y += step
            }
            context.fill(dots, with: .color(.white.opacity(0.7)))
        }
    }
}
