package cards.psy.app.ui.card

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.data.SubstanceCard
import cards.psy.app.ui.LocalBody
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.theme.PsyColors

/** A Material bottom sheet with a heading and scrolling content. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PsySheet(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false),
        containerColor = PsyColors.ink2,
        contentColor = PsyColors.fg,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(title, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.semantics { heading() })
            content()
        }
    }
}

@Composable
fun OtherRoutesSheet(card: SubstanceCard, onDismiss: () -> Unit) {
    val pack = LocalPack.current
    val body = LocalBody.current
    PsySheet("${card.displayName} · ${pack.t("card.otherRoutes")}", onDismiss) {
        card.otherRoutes.forEach { chart ->
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(PsyColors.tile, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                RouteLabel(chart, if (chart.perKg) body.weightKg?.let { "mg · ${pack.number(it)} kg" } else null)
                if (chart.chartable) DoseScale(chart, weightKg = if (chart.perKg) body.weightKg else null) else DoseList(chart.rows)
            }
        }
        card.doseNote?.let { Text(it, fontSize = 13.sp, color = PsyColors.fgMute) }
    }
}

@Composable
fun MarginCompareSheet(card: SubstanceCard, onDismiss: () -> Unit) {
    val pack = LocalPack.current
    PsySheet(pack.t("card.marginChartTitle"), onDismiss) {
        GableChart(pack.gable, card.key)
        Text(pack.t("card.marginChartNote"), fontSize = 13.sp, color = PsyColors.fgMute)
        Text(pack.t("card.marginCaveat"), fontSize = 13.sp, color = PsyColors.fgMute)
    }
}

@Composable
fun DependenceSheet(card: SubstanceCard, onDismiss: () -> Unit) {
    val pack = LocalPack.current
    val level = card.dependence.clampedLevel
    PsySheet("${pack.t("card.dependence")}: ${pack.t("card.dependenceLevels.$level")}", onDismiss) {
        DependenceMeter(level, height = 10.dp)
        card.content.dependence?.let { Text(it, fontSize = 15.sp) }
        val nutt = card.dependence.nutt
        Text(
            if (nutt != null) {
                pack.t("card.nuttScore", "score" to pack.number(nutt, 2), "drug" to (card.dependence.nuttDrug ?: card.displayName))
            } else {
                pack.t("card.editorial")
            },
            fontSize = 13.sp,
            color = PsyColors.fgMute,
        )
    }
}
