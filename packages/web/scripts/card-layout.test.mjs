import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { spreadLabels } from "../src/lib/label-layout.ts";
import { buildEffectCurve } from "../src/lib/effect-curve.ts";
import {
  bacPerUnit,
  caffeineSingleDoseMg,
  lighterThanPct,
  perKgToMg,
  unitsToLimit,
  upperLimitMg,
} from "../src/lib/personal-dose.ts";

const shared = new URL("../../shared/", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, shared), "utf8"));

test("dose-scale labels never overlap and stay on the axis", () => {
  // Ketamine-like scale: a narrow threshold range next to wider ones.
  const placed = spreadLabels(
    [
      { pos: 3, width: 22, priority: 0 },
      { pos: 14, width: 12 },
      { pos: 35, width: 16, priority: 3 },
      { pos: 60, width: 15 },
      { pos: 85, width: 14 },
    ],
    2
  );
  const widths = [22, 12, 16, 15, 14];
  const boxes = placed
    .map(({ index, x }) => ({ left: x - widths[index] / 2, right: x + widths[index] / 2 }))
    .sort((a, b) => a.left - b.left);
  for (const box of boxes) {
    assert.ok(box.left >= -0.01 && box.right <= 100.01, "label stays within the axis");
  }
  for (let i = 1; i < boxes.length; i++) {
    assert.ok(boxes[i].left >= boxes[i - 1].right + 1.99, "labels keep their gap");
  }
});

test("lowest-priority labels are dropped when they cannot all fit", () => {
  const placed = spreadLabels(
    [
      { pos: 10, width: 40, priority: 0 },
      { pos: 50, width: 40, priority: 3 },
      { pos: 90, width: 40, priority: 1 },
    ],
    2
  );
  assert.deepEqual(placed.map((label) => label.index).sort(), [1, 2]);
});

test("personal dose maths matches the published guidelines", () => {
  // Saferparty: 80 kg man × 1.5 = 120 mg; 60 kg woman × 1.3 = 78 mg.
  assert.equal(upperLimitMg(80, 1.5), 120);
  assert.equal(upperLimitMg(60, 1.3), 78);
  // Widmark: 8 g per UK unit, 70 kg man (r = 0.68) ≈ 0.17 ‰ per unit.
  const perUnit = bacPerUnit(8, 70, 0.68);
  assert.ok(Math.abs(perUnit - 0.168) < 0.001);
  assert.equal(unitsToLimit(0.5, perUnit), 2.5);
  // EFSA: ~3 mg/kg single dose, capped at 200 mg.
  assert.equal(caffeineSingleDoseMg(55, 3, 200), 165);
  assert.equal(caffeineSingleDoseMg(90, 3, 200), 200);
  // DXM mg/kg conversions round to readable amounts.
  assert.equal(perKgToMg(2.5, 70), 175);
  assert.equal(perKgToMg(7.5, 70), 525);
  assert.equal(lighterThanPct(68, 55), 19);
  assert.equal(lighterThanPct(68, 80), 0);
});

test("every card substance has data, sourced numbers and complete English content", () => {
  const data = readJson("data/harm-reduction.json");
  const content = readJson("i18n/content/en/harm-reduction.json");
  const config = JSON.parse(readFileSync(new URL("../../combogen/config.json", shared), "utf8"));
  const labels = JSON.parse(readFileSync(new URL("../../drugs/translations/en.json", shared), "utf8")).drugs;
  const labelToKey = Object.fromEntries(Object.entries(labels).map(([key, label]) => [label, key]));
  const keys = config.tableOrder.flat().map((label) => labelToKey[label] ?? label.toLowerCase());

  for (const key of keys) {
    const entry = data.substances[key];
    assert.ok(entry, `${key}: missing data`);
    assert.ok(entry.dependence.level >= 1 && entry.dependence.level <= 5, `${key}: dependence level`);
    if (entry.margin) assert.ok(data.sources[entry.margin.source], `${key}: unknown margin source`);
    if (entry.personal?.source) assert.ok(data.sources[entry.personal.source], `${key}: unknown personal source`);
    const text = content[key];
    assert.ok(text?.spacing && text?.overdose && text?.risks?.length === 3, `${key}: incomplete content`);
  }
});

test("translations mirror the English structure", () => {
  const en = readJson("i18n/content/en/harm-reduction.json");
  for (const locale of ["fr", "de", "it"]) {
    const translated = readJson(`i18n/content/${locale}/harm-reduction.json`);
    for (const [key, entry] of Object.entries(en)) {
      const other = translated[key];
      assert.ok(other, `${locale}/${key}: missing`);
      assert.equal(other.risks.length, entry.risks.length, `${locale}/${key}: risks`);
      assert.equal(other.overdose.actions.length, entry.overdose.actions.length, `${locale}/${key}: actions`);
    }
  }
});

test("effects curve rises, peaks, falls and compresses long after-effects", () => {
  const curve = buildEffectCurve({
    onset: { value: "20–70", unit: "minutes" },
    duration: { value: "3–5", unit: "hours" },
    after: { value: "1–72", unit: "hours" },
  });
  assert.ok(curve);
  const phases = curve.phases.map((phase) => phase.phase);
  assert.deepEqual(phases, ["onset", "peak", "comedown", "after"]);
  const heights = curve.bars.map((bar) => bar.height);
  const peak = Math.max(...heights);
  assert.ok(heights[0] < peak && heights.at(-1) < peak, "starts and ends below the peak");
  // A 36 h tail must not squash the 4 h experience: it gets a fixed slice.
  const after = curve.phases.find((phase) => phase.phase === "after");
  assert.ok(after.end - after.start < 25);
  assert.equal(buildEffectCurve({ onset: { value: "1", unit: "hours" } }), undefined, "no duration, no curve");
});
