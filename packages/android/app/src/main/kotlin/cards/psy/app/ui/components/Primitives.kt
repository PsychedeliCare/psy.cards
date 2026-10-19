package cards.psy.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.generated.GeneratedIcons
import cards.psy.app.ui.theme.PsyColors
import cards.psy.app.ui.theme.TileHeadingStyle

/**
 * A Phosphor icon generated from the web's icon set, so card iconography
 * matches the web and print cards exactly.
 */
@Composable
fun PhIcon(name: String, modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = Color.Unspecified) {
    val id = GeneratedIcons.byName["ph:$name"] ?: GeneratedIcons.byName.getValue("ph:sparkle-fill")
    Icon(painterResource(id), contentDescription = null, modifier = modifier.size(size), tint = tint)
}

/** Phosphor duotone combo-status icon (web `Icon.astro`). */
@Composable
fun StatusIcon(name: String, modifier: Modifier = Modifier, size: Dp = 16.dp, tint: Color = Color.Unspecified) {
    val id = GeneratedIcons.byName["status:$name"] ?: GeneratedIcons.byName.getValue("status:question")
    Icon(painterResource(id), contentDescription = null, modifier = modifier.size(size), tint = tint)
}

/** A card tile (web `.psy-tile`): soft translucent well with a hairline edge. */
@Composable
fun CardTile(
    modifier: Modifier = Modifier,
    tint: Color = PsyColors.tile,
    edge: Color = PsyColors.tileEdge,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(tint, shape)
            .border(1.dp, edge, shape)
            .padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 11.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
        content = content,
    )
}

/** Uppercase tile heading with a hue-tinted icon (web `.psy-tile h3`). */
@Composable
fun TileHeading(
    icon: String,
    title: String,
    modifier: Modifier = Modifier,
    iconColor: Color = PsyColors.fgMute,
    textColor: Color = PsyColors.fgMute,
) {
    Row(
        modifier = modifier.semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        PhIcon(icon, size = 15.dp, tint = iconColor)
        BasicText(
            title.uppercase(),
            style = TileHeadingStyle.copy(color = textColor),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            autoSize = TextAutoSize.StepBased(minFontSize = 8.sp, maxFontSize = TileHeadingStyle.fontSize, stepSize = 0.5.sp),
        )
    }
}

/** Small pill button inside tiles (web `.psy-chip-btn`). */
@Composable
fun TileChip(onClick: () -> Unit, modifier: Modifier = Modifier, content: @Composable RowScope.() -> Unit) {
    Surface(
        onClick = onClick,
        modifier = modifier.defaultMinSize(minHeight = 32.dp),
        shape = CircleShape,
        color = PsyColors.fg.copy(alpha = 0.08f),
        contentColor = PsyColors.fg,
        border = BorderStroke(1.dp, PsyColors.tileEdge),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            androidx.compose.runtime.CompositionLocalProvider(
                androidx.compose.material3.LocalTextStyle provides androidx.compose.ui.text.TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Bold),
            ) { content() }
        }
    }
}

/** Diagonal hatching (web `repeating-linear-gradient(135deg, …)`). */
@Composable
fun HatchPattern(color: Color, modifier: Modifier = Modifier, spacing: Dp = 8.dp, lineWidth: Dp = 1.dp, background: Color? = null) {
    Canvas(modifier) {
        background?.let { drawRect(it) }
        val step = spacing.toPx()
        var x = -size.height
        while (x < size.width + size.height) {
            drawLine(color, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = lineWidth.toPx())
            x += step
        }
    }
}

// ---------------------------------------------------- Label placement

/** Overlap-free label placement along a 0–100% axis (web `lib/label-layout.ts`). */
object LabelLayout {
    data class Box(val pos: Double, val width: Double, val priority: Int = 0)
    data class Placed(val index: Int, val x: Double)

    fun spread(items: List<Box>, gap: Double = 1.5, iterations: Int = 60): List<Placed> {
        val kept = items.mapIndexed { index, box -> index to box }.sortedBy { it.second.pos }.toMutableList()
        fun total() = kept.sumOf { it.second.width } + gap * maxOf(0, kept.size - 1)
        while (kept.size > 1 && total() > 100) {
            kept.remove(kept.minBy { it.second.priority })
        }
        fun clamp(x: Double, width: Double) = x.coerceIn(width / 2, maxOf(width / 2, 100 - width / 2))
        val xs = kept.map { clamp(it.second.pos, it.second.width) }.toMutableList()
        repeat(iterations) {
            var moved = false
            for (i in 1 until kept.size) {
                val min = xs[i - 1] + (kept[i - 1].second.width + kept[i].second.width) / 2 + gap
                val overlap = min - xs[i]
                if (overlap > 0.01) {
                    xs[i - 1] -= overlap / 2
                    xs[i] += overlap / 2
                    moved = true
                }
            }
            for (i in kept.indices) xs[i] = clamp(xs[i], kept[i].second.width)
            if (!moved) return kept.mapIndexed { i, (index, _) -> Placed(index, xs[i]) }
        }
        return kept.mapIndexed { i, (index, _) -> Placed(index, xs[i]) }
    }
}
