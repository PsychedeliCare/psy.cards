package cards.psy.app.ui.combos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.data.ComboColumn
import cards.psy.app.data.ComboPair
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.card.PsySheet
import cards.psy.app.ui.components.StatusIcon
import cards.psy.app.ui.theme.PsyColors

/** The combination matrix (web `/combos`): tap a cell for the pair, a row for the card. */
@Composable
fun CombosScreen(onOpenSubstance: (String) -> Unit, modifier: Modifier = Modifier) {
    val pack = LocalPack.current
    val columns = pack.combosPack.columns
    var pair by remember { mutableStateOf<ComboPair?>(null) }
    val cell = 44.dp
    val labelWidth = 96.dp

    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            pack.combosPack.legend.forEach { item ->
                Row(
                    Modifier.background(PsyColors.status(item.statusKey).copy(alpha = 0.3f), CircleShape).padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    StatusIcon(item.icon, size = 14.dp, tint = PsyColors.fg)
                    Text(item.label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fg)
                }
            }
        }
        Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState()).padding(16.dp)) {
            Column {
                // Column headers slant up and to the right from each column's centre.
                val measurer = rememberTextMeasurer()
                Canvas(Modifier.size(labelWidth + cell * columns.size, labelWidth)) {
                    columns.forEachIndexed { index, column ->
                        val text = measurer.measure(
                            column.label,
                            TextStyle(fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.group(column.group)),
                        )
                        val anchor = Offset((labelWidth + cell * index + cell / 2).toPx(), size.height - 6.dp.toPx())
                        rotate(-60f, pivot = anchor) {
                            drawText(text, topLeft = Offset(anchor.x, anchor.y - text.size.height / 2f))
                        }
                    }
                }
                columns.forEach { row ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            row.label,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = PsyColors.group(row.group),
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.width(labelWidth).clickable { onOpenSubstance(row.key) },
                        )
                        columns.forEach { column -> MatrixCell(row, column, cell) { pair = pack.pair(row.key, column.key) } }
                    }
                }
            }
        }
    }
    pair?.let { ComboPairSheet(it, onOpenSubstance = { key -> pair = null; onOpenSubstance(key) }) { pair = null } }
}

@Composable
private fun MatrixCell(row: ComboColumn, column: ComboColumn, size: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
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
            .background(PsyColors.status(cell.statusKey).copy(alpha = 0.92f), shape)
            .clickable(onClick = onClick)
            .semantics { contentDescription = "${row.label} + ${column.label}: ${cell.label}" },
        contentAlignment = Alignment.Center,
    ) {
        StatusIcon(cell.icon, size = 18.dp, tint = PsyColors.inkOnStatus(cell.statusKey))
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
