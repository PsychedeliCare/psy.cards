import test from "node:test";
import assert from "node:assert/strict";
import { labelReverseOpacity } from "../src/lib/dial-geometry.ts";

for (const kind of ["category", "substance"]) {
  test(`${kind} labels fade continuously through multiple turns in either direction`, () => {
    for (const midAngle of [0, 360 / 7, 180, 6 * 360 / 7]) {
      let previous = labelReverseOpacity(midAngle, -720, kind);
      for (let step = 1; step <= 14400; step++) {
        const rotation = -720 + step / 10;
        const opacity = labelReverseOpacity(midAngle, rotation, kind);
        assert.ok(opacity >= 0 && opacity <= 1);
        assert.ok(Math.abs(opacity - previous) < 0.01, "no abrupt flip between adjacent angles");
        assert.ok(Math.abs(opacity - labelReverseOpacity(midAngle, rotation + 360, kind)) < 1e-12);
        assert.ok(Math.abs(opacity + labelReverseOpacity(midAngle, rotation + 180, kind) - 1) < 1e-12);
        previous = opacity;
      }
    }
  });
}

test("category labels are fully readable above, below, and at the selection marker", () => {
  assert.equal(labelReverseOpacity(0, 0, "category"), 0);
  assert.equal(labelReverseOpacity(0, 180, "category"), 1);
  assert.equal(labelReverseOpacity(0, 90, "category"), 0);
  assert.equal(labelReverseOpacity(0, 270, "category"), 1);
});

test("substance labels use the outward reading direction on each side", () => {
  assert.equal(labelReverseOpacity(0, 90, "substance"), 0);
  assert.equal(labelReverseOpacity(0, 270, "substance"), 1);
  assert.equal(labelReverseOpacity(0, 0, "substance"), 0.5);
  assert.equal(labelReverseOpacity(0, 180, "substance"), 0.5);
});
