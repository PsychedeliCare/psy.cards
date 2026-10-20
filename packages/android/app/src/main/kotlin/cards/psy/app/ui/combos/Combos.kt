package cards.psy.app.ui.combos

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.dropShadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import cards.psy.app.data.ComboColumn
import cards.psy.app.data.ComboPair
import cards.psy.app.data.StatusDefinition
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.card.PsySheet
import cards.psy.app.ui.components.StatusIcon
import cards.psy.app.ui.theme.PsyColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private const val BaseCellSize = 50f
private val RowHeaderWidth = 100.dp
private val ColumnHeaderHeight = 50.dp

/**
 * The combination matrix (web `/combos`). The substance row and column
 * headers stay pinned while the cells scroll beneath them; a cell opens the
 * pair, a header the card. Each axis is one stack of overlapping cards
 * (every card runs under the next): a tapped card lifts up as its card opens
 * and drops back into place when you come back. Pinch to zoom.
 */
@Composable
fun CombosScreen(onOpenSubstance: (String) -> Unit, modifier: Modifier = Modifier) {
    val pack = LocalPack.current
    val columns = pack.combosPack.columns
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    var pair by remember { mutableStateOf<ComboPair?>(null) }
    /** Header card currently lifted off its deck ("row-<key>" / "col-<key>"). */
    var pulled by rememberSaveable { mutableStateOf<String?>(null) }
    var scale by rememberSaveable { mutableFloatStateOf(1f) }
    val horizontal = rememberScrollState()
    val vertical = rememberScrollState()
    val cell = (BaseCellSize * scale).roundToInt().dp

    // Back from the card: let the screen settle, then drop the card onto its deck.
    LaunchedEffect(Unit) {
        if (pulled != null) {
            delay(380)
            pulled = null
            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
        }
    }

    /** Lifts the header card off its deck, then opens its card. */
    fun pull(column: ComboColumn, id: String) {
        if (pulled != null) return
        pulled = id
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        scope.launch {
            delay(140)
            onOpenSubstance(column.key)
        }
    }

    Box(
        modifier
            .fillMaxSize()
            .background(PsyColors.ink)
            .pointerInput(Unit) {
                // Two fingers zoom the grid; one finger still scrolls and taps.
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.count { it.pressed } >= 2) {
                            val zoom = event.calculateZoom()
                            if (zoom != 1f) scale = (scale * zoom).coerceIn(0.6f, 1.8f)
                            event.changes.forEach { it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            },
    ) {
        Column(Modifier.fillMaxSize().verticalScroll(vertical).padding(top = ColumnHeaderHeight)) {
            Row {
                // Row headers: pinned horizontally, scroll with the cells.
                Column(Modifier.width(RowHeaderWidth).background(PsyColors.ink)) {
                    columns.forEachIndexed { index, row ->
                        val id = "row-${row.key}"
                        StackCard(
                            column = row,
                            axis = StackAxis.Row,
                            slotWidth = RowHeaderWidth,
                            slotHeight = cell,
                            extends = index < columns.lastIndex,
                            pulled = pulled == id,
                            onClick = { pull(row, id) },
                            modifier = Modifier.testTag("combo-row-${row.slug}"),
                        ) {
                            BasicText(
                                row.label,
                                style = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Black, color = PsyColors.ink, lineHeight = 12.sp),
                                maxLines = 2,
                                autoSize = TextAutoSize.StepBased(minFontSize = 9.sp, maxFontSize = 11.sp, stepSize = 0.5.sp),
                                modifier = Modifier.fillMaxWidth().padding(start = 9.dp, end = 4.dp),
                            )
                        }
                    }
                }
                Box(Modifier.horizontalScroll(horizontal)) {
                    ComboGrid(columns, cell) { row, col -> pair = pack.pair(row.key, col.key) }
                }
            }
            // Pinned horizontally so it stays readable under a wide grid.
            Legend(pack.combosPack.legend, Modifier.padding(horizontal = 16.dp).padding(top = 20.dp, bottom = 32.dp))
        }

        // Column headers: pinned vertically, scroll with the cells.
        Row(Modifier.fillMaxWidth().height(ColumnHeaderHeight).background(PsyColors.ink)) {
            Spacer(Modifier.width(RowHeaderWidth))
            Row(Modifier.horizontalScroll(horizontal)) {
                columns.forEachIndexed { index, column ->
                    val id = "col-${column.key}"
                    // Single words shrink onto one line rather than breaking
                    // mid-word; names with spaces or hyphens use two.
                    val oneWord = column.label.none { it == ' ' || it == '-' || it == '/' }
                    StackCard(
                        column = column,
                        axis = StackAxis.Column,
                        slotWidth = cell,
                        slotHeight = ColumnHeaderHeight,
                        extends = index < columns.lastIndex,
                        pulled = pulled == id,
                        onClick = { pull(column, id) },
                        modifier = Modifier.testTag("combo-col-${column.slug}"),
                    ) {
                        BasicText(
                            column.label,
                            style = TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Black, color = PsyColors.ink, lineHeight = 11.sp, textAlign = TextAlign.Center),
                            maxLines = if (oneWord) 1 else 2,
                            autoSize = TextAutoSize.StepBased(minFontSize = if (oneWord) 6.sp else 8.sp, maxFontSize = 10.sp, stepSize = 0.5.sp),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 3.dp),
                        )
                    }
                }
            }
        }
    }
    pair?.let { ComboPairSheet(it, onOpenSubstance = { key -> pair = null; onOpenSubstance(key) }) { pair = null } }
}

private enum class StackAxis { Row, Column }

/** Room left above column cards so they can slide up. */
private val ColumnHeadroom = 5.dp
private val StackShape = RoundedCornerShape(8.dp)

/**
 * A substance header as one card of its axis' stack (web `ComboTable.astro`
 * `.stack`): solid category colour with ink text. The card runs under the
 * next one (rows: down, columns: right), whose shadow falls back on it;
 * `pulled` lifts it up out of the stack.
 */
@Composable
private fun StackCard(
    column: ComboColumn,
    axis: StackAxis,
    slotWidth: Dp,
    slotHeight: Dp,
    extends: Boolean,
    pulled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    label: @Composable () -> Unit,
) {
    val pack = LocalPack.current
    val hue = PsyColors.group(column.group)
    val isRow = axis == StackAxis.Row
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val lift by animateDpAsState(
        when {
            pulled -> (-7).dp
            pressed -> (-4).dp
            else -> 0.dp
        },
        if (pulled || pressed) spring(dampingRatio = 0.72f, stiffness = 815f) else spring(dampingRatio = 0.58f, stiffness = 340f),
        label = "lift",
    )
    val lifted = (lift / (-7).dp).coerceIn(0f, 1f)
    val overlap = when {
        !extends -> 0.dp
        isRow -> slotHeight * 0.5f
        else -> slotWidth * 0.4f
    }
    // The visible part of the card; the rest runs under the next card.
    val visibleWidth = if (isRow) slotWidth - 4.dp else slotWidth
    val visibleHeight = if (isRow) slotHeight else slotHeight - ColumnHeadroom

    Box(
        modifier
            .size(slotWidth, slotHeight)
            // A pulled card comes out over the one that covered it.
            .zIndex(if (pulled) 1f else 0f)
            .semantics(mergeDescendants = true) { contentDescription = column.label },
    ) {
        Box(
            Modifier
                .offset(y = (if (isRow) 0.dp else ColumnHeadroom) + lift)
                .wrapContentSize(Alignment.TopStart, unbounded = true)
                .requiredSize(visibleWidth + if (isRow) 0.dp else overlap, visibleHeight + if (isRow) overlap else 0.dp)
                .dropShadow(StackShape) {
                    radius = (3 + 5 * lifted).dp.toPx()
                    color = Color.Black
                    alpha = 0.5f + 0.1f * lifted
                    offset = if (isRow) Offset(0f, (-2).dp.toPx()) else Offset((-2).dp.toPx(), (5 * lifted).dp.toPx())
                }
                .clip(StackShape)
                .background(Brush.verticalGradient(listOf(lerp(hue, Color.White, 0.06f), hue, lerp(hue, Color.Black, 0.08f))))
                .border(BorderStroke(1.dp, Brush.linearGradient(0f to Color.White.copy(alpha = 0.38f), 0.5f to Color.Transparent)), StackShape)
                .clickable(interactionSource = interaction, indication = null, role = Role.Button, onClickLabel = pack.t("search.substanceCard"), onClick = onClick)
                .padding(bottom = if (isRow) overlap else 0.dp, end = if (isRow) 0.dp else overlap),
            contentAlignment = if (isRow) Alignment.CenterStart else Alignment.Center,
        ) {
            label()
        }
    }
}

/** The interaction cells. */
@Composable
private fun ComboGrid(columns: List<ComboColumn>, cell: Dp, onSelect: (ComboColumn, ComboColumn) -> Unit) {
    Column {
        columns.forEach { row ->
            Row {
                columns.forEach { column -> MatrixCell(row, column, cell) { onSelect(row, column) } }
            }
        }
    }
}

@Composable
private fun MatrixCell(row: ComboColumn, column: ComboColumn, size: Dp, onClick: () -> Unit) {
    val pack = LocalPack.current
    val shape = RoundedCornerShape(6.dp)
    val modifier = Modifier.padding(2.dp).size(size - 4.dp)
    if (row.key == column.key) {
        Box(modifier.background(PsyColors.ink3, shape))
        return
    }
    val cell = pack.interaction(row.key, column.key)
    if (cell == null) {
        Box(modifier.border(1.dp, PsyColors.ink3, shape))
        return
    }
    Box(
        modifier
            .clip(shape)
            .background(PsyColors.status(cell.statusKey).copy(alpha = 0.9f))
            .clickable(onClick = onClick)
            .semantics { contentDescription = "${row.label} + ${column.label}: ${cell.label}" },
        contentAlignment = Alignment.Center,
    ) {
        StatusIcon(cell.icon, size = minOf(18.dp, (size - 4.dp) * 0.4f), tint = PsyColors.inkOnStatus(cell.statusKey))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Legend(legend: List<StatusDefinition>, modifier: Modifier = Modifier) {
    val pack = LocalPack.current
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            pack.t("legend.ariaLabel").uppercase(),
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.2.sp,
            color = PsyColors.fgMute,
            modifier = Modifier.semantics { heading() },
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            legend.forEach { item ->
                Row(
                    Modifier.background(PsyColors.status(item.statusKey).copy(alpha = 0.35f), CircleShape).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    StatusIcon(item.icon, size = 14.dp, tint = PsyColors.fg)
                    Text(item.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fg)
                }
            }
        }
    }
}

/** A combination's risk, explanation and sources (web combo modal). */
@Composable
fun ComboPairSheet(pair: ComboPair, onOpenSubstance: (String) -> Unit, onDismiss: () -> Unit) {
    val pack = LocalPack.current
    val uri = LocalUriHandler.current
    val color = PsyColors.status(pair.statusKey)
    PsySheet(pack.t("landing.navCombos"), onDismiss) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SubstanceChip(pair.a, onOpenSubstance)
            Text("+", color = PsyColors.fgMute, fontSize = 18.sp)
            SubstanceChip(pair.b, onOpenSubstance)
        }
        Row(
            Modifier
                .background(Brush.linearGradient(listOf(color.copy(alpha = 0.24f), color.copy(alpha = 0.08f))), RoundedCornerShape(16.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            StatusIcon(pair.icon, size = 24.dp, tint = color)
            Text(pair.label, fontSize = 22.sp, fontWeight = FontWeight.Black, color = color)
        }
        Text(pair.definition, fontSize = 16.sp, lineHeight = 22.sp, color = PsyColors.fg)
        pair.note?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 15.sp, lineHeight = 21.sp, color = PsyColors.fgMute) }
        if (pair.sources.isNotEmpty()) {
            Text(pack.t("comboCard.sources"), fontSize = 16.sp, fontWeight = FontWeight.Bold)
            pair.sources.forEach { source ->
                TextButton(onClick = { if (source.url.isNotBlank()) uri.openUri(source.url) }) {
                    Column(Modifier.padding(vertical = 2.dp)) {
                        Text(source.title, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.safe, textAlign = TextAlign.Start)
                        Text(source.author, fontSize = 12.sp, color = PsyColors.fgMute)
                    }
                }
            }
        }
    }
}

@Composable
private fun SubstanceChip(key: String, onOpen: (String) -> Unit) {
    val pack = LocalPack.current
    val substance = pack.substance(key)
    val color = PsyColors.group(substance?.group ?: "")
    Surface(
        onClick = { if (substance != null) onOpen(key) },
        shape = CircleShape,
        color = color.copy(alpha = 0.2f),
        contentColor = PsyColors.fg,
    ) {
        Text(substance?.prettyName ?: key, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.height(40.dp).padding(horizontal = 14.dp, vertical = 9.dp))
    }
}
