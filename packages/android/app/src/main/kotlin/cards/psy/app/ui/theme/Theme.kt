package cards.psy.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.log10

/** Design tokens shared with the web (`styles/global.css`) and iOS. */
object PsyColors {
    val ink = Color(0xFF0B0B0C)
    val ink2 = Color(0xFF141416)
    val ink3 = Color(0xFF1D1D20)
    val fg = Color(0xFFF5F5F5)
    val fgMute = Color(0xFFA6A6AA)

    val safe = Color(0xFF35AFFF)
    private val groups = mapOf(
        "stimulant" to Color(0xFFF47A42),
        "empathogen" to Color(0xFFF9BA3F),
        "psychedelic" to Color(0xFF99C659),
        "dissociative" to Color(0xFF63ADDD),
        "depressant" to Color(0xFF898CC8),
        "opioid" to Color(0xFFB881B9),
        "cannabinoid" to Color(0xFFDD568C),
        "antidepressant" to Color(0xFF7D8BBD),
    )
    private val statuses = mapOf(
        "safe" to safe,
        "synergy" to Color(0xFF0A89DD),
        "decrease" to Color(0xFF006CB3),
        "caution" to Color(0xFFD5C625),
        "unsafe" to Color(0xFFD98427),
        "dangerous" to Color(0xFFD12128),
        "serotoninsyndrome" to Color(0xFFB11F57),
    )
    val unknown = Color(0xFF6F6F6F)

    fun group(name: String) = groups[name] ?: fgMute
    fun status(key: String) = statuses[key] ?: unknown

    /** Readable text on top of a status colour (web `--hue-ink`). */
    fun inkOnStatus(key: String) =
        if (key in setOf("decrease", "dangerous", "serotoninsyndrome", "unknown")) Color.White else ink

    // Card surfaces (web styles/substance-card.css)
    fun face(group: String) = lerp(ink2, group(group), 0.06f)
    val tile = fg.copy(alpha = 0.045f)
    val tileEdge = fg.copy(alpha = 0.08f)
    val faceEdge = fg.copy(alpha = 0.13f)
    val inkSoft = fg.copy(alpha = 0.84f)

    fun dependence(level: Int) = when (level) {
        1 -> Color(0xFF4ADE80)
        2 -> Color(0xFFA3E635)
        3 -> Color(0xFFFACC15)
        4 -> Color(0xFFFB923C)
        else -> Color(0xFFEF4444)
    }

    /** Toxicity margin track: red ≤ 5×, green at 1000× on a log scale. */
    val marginStops = arrayOf(
        0f to hsl(0f, 0.72f, 0.50f),
        0.23f to hsl(0f, 0.72f, 0.50f),
        0.333f to hsl(17f, 0.80f, 0.52f),
        0.5f to hsl(45f, 0.85f, 0.52f),
        0.667f to hsl(73f, 0.70f, 0.48f),
        1f to hsl(130f, 0.60f, 0.45f),
    )

    fun marginHue(ratio: Double) = (((log10(ratio) - 0.7) / 2.3).coerceIn(0.0, 1.0) * 130).toFloat()

    val emergency = Color(0xFFEF4444)
    val emergencyStrong = Color(0xFFDC2626)
    val emergencyInk = Color(0xFFFECACA)
    val emergencyIcon = Color(0xFFF87171)
    val emergencyMarker = Color(0xFFFCA5A5)
    val riskIcon = Color(0xFFFDBA74)
    val riskIconWell = Color(0xFFF97316).copy(alpha = 0.18f)
    val saveOn = Color(0xFF84CC16)
}

/** CSS `hsl()` — hue in degrees, saturation and lightness 0–1. */
fun hsl(hue: Float, saturation: Float, lightness: Float, alpha: Float = 1f): Color {
    val c = (1 - abs(2 * lightness - 1)) * saturation
    val h = ((hue % 360) + 360) % 360 / 60
    val x = c * (1 - abs(h % 2 - 1))
    val (r, g, b) = when {
        h < 1 -> Triple(c, x, 0f)
        h < 2 -> Triple(x, c, 0f)
        h < 3 -> Triple(0f, c, x)
        h < 4 -> Triple(0f, x, c)
        h < 5 -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    val m = lightness - c / 2
    return Color(r + m, g + m, b + m, alpha)
}

/** `#rrggbb` strings from the data pack (dose level colours). */
fun hexColor(value: String): Color = runCatching { Color(android.graphics.Color.parseColor(value)) }.getOrDefault(PsyColors.fgMute)

private val PsyColorScheme = darkColorScheme(
    primary = PsyColors.fg,
    onPrimary = PsyColors.ink,
    primaryContainer = PsyColors.ink3,
    onPrimaryContainer = PsyColors.fg,
    secondary = PsyColors.safe,
    onSecondary = PsyColors.ink,
    secondaryContainer = Color(0xFF2A2A2E),
    onSecondaryContainer = PsyColors.fg,
    tertiary = Color(0xFFF9BA3F),
    background = PsyColors.ink,
    onBackground = PsyColors.fg,
    surface = PsyColors.ink,
    onSurface = PsyColors.fg,
    surfaceVariant = PsyColors.ink3,
    onSurfaceVariant = PsyColors.fgMute,
    surfaceContainerLowest = PsyColors.ink,
    surfaceContainerLow = PsyColors.ink2,
    surfaceContainer = Color(0xFF18181B),
    surfaceContainerHigh = PsyColors.ink3,
    surfaceContainerHighest = Color(0xFF26262A),
    outline = Color(0xFF3A3A3F),
    outlineVariant = Color(0xFF2A2A2E),
    error = PsyColors.emergency,
)

private val base = Typography()

private val PsyTypography = Typography(
    displaySmall = base.displaySmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-1).sp),
    headlineLarge = base.headlineLarge.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.8).sp),
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.6).sp),
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.4).sp),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.Bold),
    labelSmall = base.labelSmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = 1.1.sp),
)

/** Tile headings (web `.psy-tile h3`): small, heavy, tracked uppercase. */
val TileHeadingStyle = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.1.sp)

@Composable
fun PsyCardsTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = PsyColorScheme, typography = PsyTypography, content = content)
}
