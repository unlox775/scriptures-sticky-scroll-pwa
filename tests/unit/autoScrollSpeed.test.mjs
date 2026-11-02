import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSpeed, formatSpeedLabel } from "../../src/autoScrollController.js";

test("saved speed is clamped but not snapped", () => {
  assert.equal(normalizeSpeed("16.113112450912393"), 16.113112450912393);
  assert.equal(normalizeSpeed(20), 20);
  assert.equal(normalizeSpeed(0.4), 8);
  assert.equal(normalizeSpeed(500), 160);
  assert.equal(normalizeSpeed("junk", 20), 20);
});

test("label: integers no decimals, else two", () => {
  assert.equal(formatSpeedLabel(16.113112450912393), "16.11 px/s");
  assert.equal(formatSpeedLabel(16), "16 px/s");
  assert.equal(formatSpeedLabel(16.1), "16.10 px/s");
});
