package cards.psy.app.ui.list

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.R
import cards.psy.app.data.Substance
import cards.psy.app.generated.GeneratedMolecules
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.theme.PsyColors

@Composable
fun SubstanceListScreen(
    selectedKey: String?,
    onOpen: (String) -> Unit,
    header: @Composable () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
) {
    val pack = LocalPack.current
    var query by rememberSaveable { mutableStateOf("") }
    var group by rememberSaveable { mutableStateOf<String?>(null) }
    val filtered = pack.search(query).filter { group == null || it.group == group }
    val sections = pack.groups.mapNotNull { g -> filtered.filter { it.group == g }.takeIf { it.isNotEmpty() }?.let { g to it } }
    val focus = LocalFocusManager.current

    LazyColumn(
        modifier.fillMaxSize().background(
            Brush.radialGradient(
                listOf(PsyColors.group(group ?: "dissociative").copy(alpha = 0.16f), PsyColors.ink),
                center = androidx.compose.ui.geometry.Offset(0f, 0f),
                radius = 1400f,
            ),
        ),
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { header() }
        item {
            SearchField(query, { query = it }, pack.t("search.placeholder"), onDone = { focus.clearFocus() })
        }
        item {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { GroupChip(pack.t("landing.tabAll"), null, group == null) { group = null } }
                items(pack.groups) { g -> GroupChip(pack.groupLabel(g), g, group == g) { group = g } }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(pack.t("landing.title"), fontSize = 32.sp, lineHeight = 36.sp, fontWeight = FontWeight.Black, color = PsyColors.fg)
                Text(pack.t("landing.lede"), fontSize = 16.sp, lineHeight = 22.sp, color = PsyColors.fgMute)
            }
        }
        sections.forEach { (g, items) ->
            item(key = "header-$g") {
                Row(
                    Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 2.dp).semantics { heading() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(Modifier.size(14.dp, 4.dp).background(PsyColors.group(g), CircleShape))
                    Text(pack.groupLabel(g).uppercase(), fontSize = 13.sp, fontWeight = FontWeight.Black, letterSpacing = 1.1.sp, color = PsyColors.group(g))
                }
            }
            items(items, key = { it.key }) { substance ->
                SubstanceRow(substance, substance.key == selectedKey, Modifier.padding(horizontal = 16.dp).testTag("row-${substance.slug}")) {
                    focus.clearFocus()
                    onOpen(substance.key)
                }
            }
        }
        if (sections.isEmpty()) {
            item { Text(pack.t("search.empty"), color = PsyColors.fgMute, modifier = Modifier.padding(32.dp)) }
        }
    }
}

@Composable
private fun SearchField(value: String, onChange: (String) -> Unit, placeholder: String, onDone: () -> Unit) {
    Row(
        Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .height(50.dp)
            .background(PsyColors.ink3, CircleShape)
            .border(1.dp, PsyColors.fg.copy(alpha = 0.08f), CircleShape)
            .padding(start = 16.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(painterResource(R.drawable.ph_magnifying_glass_bold), null, tint = PsyColors.fgMute, modifier = Modifier.size(18.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, color = PsyColors.fgMute, fontSize = 16.sp, maxLines = 1)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(color = PsyColors.fg, fontSize = 16.sp),
                cursorBrush = SolidColor(PsyColors.safe),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onDone() }),
                modifier = Modifier.fillMaxWidth().testTag("search").semantics { contentDescription = placeholder },
            )
        }
        if (value.isNotEmpty()) {
            IconButton(onClick = { onChange("") }) {
                Icon(painterResource(R.drawable.ph_x_bold), null, tint = PsyColors.fgMute, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun GroupChip(title: String, group: String?, selected: Boolean, onClick: () -> Unit) {
    val hue = group?.let { PsyColors.group(it) } ?: PsyColors.fg
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (selected) hue else PsyColors.ink3,
        contentColor = if (selected) PsyColors.ink else PsyColors.fg,
        border = if (selected) null else androidx.compose.foundation.BorderStroke(1.dp, PsyColors.fg.copy(alpha = 0.08f)),
        modifier = Modifier.semantics { this.selected = selected },
    ) {
        Column(Modifier.width(IntrinsicSize.Max).padding(horizontal = 14.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            if (group != null) {
                Spacer(Modifier.height(4.dp))
                Box(Modifier.fillMaxWidth().height(3.dp).background(if (selected) PsyColors.ink.copy(alpha = 0.5f) else hue, CircleShape))
            }
        }
    }
}

/**
 * List card (web `SubstanceListCard.astro`): name, a few aliases, timing and
 * the common oral dose, with the molecule as a faded watermark.
 */
@Composable
private fun SubstanceRow(substance: Substance, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val pack = LocalPack.current
    val hue = PsyColors.group(substance.group)
    val shape = RoundedCornerShape(18.dp)
    Surface(
        onClick = onClick,
        shape = shape,
        color = PsyColors.ink2.copy(alpha = 0.8f),
        contentColor = PsyColors.fg,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) hue.copy(alpha = 0.6f) else PsyColors.fg.copy(alpha = 0.1f)),
        modifier = modifier.fillMaxWidth(),
    ) {
        Box(
            Modifier.background(
                Brush.linearGradient(listOf(hue.copy(alpha = if (selected) 0.3f else 0.1f), hue.copy(alpha = if (selected) 0.12f else 0.02f))),
            ),
        ) {
            substance.molecule?.let { info ->
                GeneratedMolecules.byAsset[info.assetName]?.let { res ->
                    // Watermark only: it must not make the row taller.
                    Box(Modifier.matchParentSize(), contentAlignment = Alignment.CenterEnd) {
                        Image(
                            painterResource(res),
                            null,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.offset(x = 18.dp).requiredSize(130.dp).alpha(0.16f),
                        )
                    }
                }
            }
            Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(substance.prettyName, fontSize = 21.sp, fontWeight = FontWeight.Black)
                if (substance.listAliases.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        substance.listAliases.forEach { alias ->
                            Text(
                                alias,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = PsyColors.inkSoft,
                                maxLines = 1,
                                modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(PsyColors.fg.copy(alpha = 0.08f)).padding(horizontal = 7.dp, vertical = 3.dp),
                            )
                        }
                    }
                }
                val meta = substance.listMeta
                if (!meta.isEmpty) {
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        meta.onset?.let { Meta("timer", it, pack.t("substanceCard.onset")) }
                        meta.duration?.let { Meta("hourglass-medium", it, pack.t("substanceCard.duration")) }
                        meta.commonDose?.let { Meta("pill", it, pack.t("doseChart.common")) }
                    }
                }
            }
        }
    }
}

@Composable
private fun Meta(icon: String, text: String, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = "$label: $text" },
    ) {
        PhIcon(icon, size = 14.dp, tint = PsyColors.fgMute)
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}
