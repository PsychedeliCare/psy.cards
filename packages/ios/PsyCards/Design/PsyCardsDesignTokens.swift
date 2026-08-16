import SwiftUI

enum PsyCardsColors {
    static let ink = Color(hex: 0x0B0B0C)
    static let ink2 = Color(hex: 0x141416)
    static let ink3 = Color(hex: 0x1D1D20)
    static let fg = Color(hex: 0xF5F5F5)
    static let fgMute = Color(hex: 0xA6A6AA)

    static let stimulant = Color(hex: 0xF47A42)
    static let empathogen = Color(hex: 0xF9BA3F)
    static let psychedelic = Color(hex: 0x99C659)
    static let dissociative = Color(hex: 0x63ADDD)
    static let depressant = Color(hex: 0x898CC8)
    static let opioid = Color(hex: 0xB881B9)
    static let cannabinoid = Color(hex: 0xDD568C)
    static let antidepressant = Color(hex: 0x7D8BBD)

    static let safe = Color(hex: 0x35AFFF)
    static let synergy = Color(hex: 0x0A89DD)
    static let decrease = Color(hex: 0x006CB3)
    static let caution = Color(hex: 0xD5C625)
    static let unsafe = Color(hex: 0xD98427)
    static let dangerous = Color(hex: 0xD12128)
    static let serotoninSyndrome = Color(hex: 0xB11F57)
    static let unknown = Color(hex: 0x6F6F6F)

    static func group(_ name: String) -> Color {
        switch name {
        case "stimulant": stimulant
        case "empathogen": empathogen
        case "psychedelic": psychedelic
        case "dissociative": dissociative
        case "depressant": depressant
        case "opioid": opioid
        case "cannabinoid": cannabinoid
        case "antidepressant": antidepressant
        default: fgMute
        }
    }

    static func status(_ key: String) -> Color {
        switch key {
        case "safe": safe
        case "synergy": synergy
        case "decrease": decrease
        case "caution": caution
        case "unsafe": unsafe
        case "dangerous": dangerous
        case "serotoninsyndrome": serotoninSyndrome
        default: unknown
        }
    }

    // Dose level palette — mirrors packages/web/src/lib/dose-chart.ts
    static let doseThreshold = Color(hex: 0x38BDF8)
    static let doseLight = Color(hex: 0x4ADE80)
    static let doseCommon = Color(hex: 0xFACC15)
    static let doseStrong = Color(hex: 0xFB923C)
    static let doseHeavy = Color(hex: 0xF87171)
    static let doseDangerous = Color(hex: 0xDC2626)
    static let doseFatal = Color(hex: 0x7F1D1D)

    static func doseLevel(_ name: String) -> Color {
        switch name.lowercased() {
        case "threshold": doseThreshold
        case "light": doseLight
        case "common": doseCommon
        case "strong": doseStrong
        case "heavy": doseHeavy
        case "dangerous": doseDangerous
        case "fatal": doseFatal
        default: fgMute
        }
    }

    static func groupSymbol(_ name: String) -> String {
        switch name {
        case "stimulant": "bolt.fill"
        case "empathogen": "heart.fill"
        case "psychedelic": "sparkles"
        case "dissociative": "cloud.fill"
        case "depressant": "moon.zzz.fill"
        case "opioid": "pills.fill"
        case "cannabinoid": "leaf.fill"
        case "antidepressant": "brain.head.profile"
        default: "circle.hexagongrid.fill"
        }
    }

    static func groupGradient(_ name: String) -> LinearGradient {
        let base = group(name)
        return LinearGradient(
            colors: [base, base.mix(with: .black, by: 0.35)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    static func statusSymbol(_ icon: String) -> String {
        switch icon {
        case "arrow-fat-line-up": "arrow.up"
        case "arrow-fat-line-right": "arrow.right"
        case "arrow-fat-line-down": "arrow.down"
        case "warning": "exclamationmark.triangle.fill"
        case "heartbeat": "heart.fill"
        case "warning-octagon": "xmark.octagon.fill"
        case "flash": "bolt.fill"
        default: "questionmark"
        }
    }
}

struct PsyCardsBrandLabel: View {
    var size: CGFloat = 26

    var body: some View {
        HStack(spacing: 8) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .clipShape(.rect(cornerRadius: size * 0.22, style: .continuous))
                .accessibilityHidden(true)
            Text("psy.cards")
                .font(.headline.weight(.bold))
                .foregroundStyle(PsyCardsColors.fg)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel("psy.cards")
    }
}

extension View {
    /// Full-width, high sheet — page-sized so iPad does not present a narrow centered card.
    func psyCardsSheetPresentation(detents: Set<PresentationDetent> = [.large]) -> some View {
        self
            .presentationDetents(detents)
            .presentationDragIndicator(.visible)
            .presentationCornerRadius(32)
            .presentationSizing(.page)
    }
}

/// Shared screen background: deep ink base with a soft accent glow.
struct PsyCardsBackground: View {
    var accent: Color = PsyCardsColors.safe

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [PsyCardsColors.ink2, PsyCardsColors.ink],
                startPoint: .top,
                endPoint: .bottom
            )
            RadialGradient(
                colors: [accent.opacity(0.18), .clear],
                center: .init(x: 0.15, y: -0.1),
                startRadius: 0,
                endRadius: 520
            )
            RadialGradient(
                colors: [accent.opacity(0.08), .clear],
                center: .init(x: 1.05, y: 0.45),
                startRadius: 0,
                endRadius: 420
            )
        }
        .ignoresSafeArea()
    }
}

enum PsyCardsRadius {
    static let s: CGFloat = 10
    static let m: CGFloat = 16
    static let l: CGFloat = 24
    static let xl: CGFloat = 32
}

enum PsyCardsSpacing {
    static let xs: CGFloat = 6
    static let s: CGFloat = 10
    static let m: CGFloat = 16
    static let l: CGFloat = 24
    static let xl: CGFloat = 32
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
