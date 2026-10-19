import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDoseCharts, parseDoseAmount } from "../src/lib/dose-chart.ts";

test("parses the TripSit amount formats used by the curated cards", () => {
  assert.deepEqual(
    { ...parseDoseAmount("75mg-250mg"), raw: undefined },
    { min: 75, max: 250, openEnd: false, unit: "mg", raw: undefined },
  );
  assert.equal(parseDoseAmount("15-30mg.")?.max, 30);
  assert.equal(parseDoseAmount("1mg-3mg.")?.unit, "mg");
  assert.equal(parseDoseAmount("100-150ug")?.unit, "µg");
  assert.equal(parseDoseAmount("2.5-7.5mg/kg")?.unit, "mg/kg");
  const open = parseDoseAmount("50-125mg+");
  assert.equal(open?.openEnd, true);
  assert.equal(open?.max, 125);
  assert.equal(parseDoseAmount("250ug+")?.max, null);
  assert.equal(parseDoseAmount("1mg-3µg"), null, "mixed units are not charted");
  assert.equal(parseDoseAmount("unknown"), null);
});

test("caffeine, DXM and diazepam produce charts rather than fallback tables", () => {
  const caffeine = buildDoseCharts({ Oral: { Common: "75mg-250mg", Heavy: "400mg+", Light: "20-75mg", Strong: "250-400mg", Threshold: "10-20mg" } });
  const dxm = buildDoseCharts({ Oral: { Common: "2.5-7.5mg/kg", Heavy: "15-20mg/kg", Light: "1.5-2.5mg/kg", Strong: "7.5-15mg/kg" } });
  const diazepam = buildDoseCharts({ Oral: { Common: "5-15mg", Heavy: "15-30mg.", Light: "2.5-5mg" } });
  for (const charts of [caffeine, dxm, diazepam]) assert.equal(charts[0]?.chartable, true);
});
