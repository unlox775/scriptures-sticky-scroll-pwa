import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSpeed,
  formatSpeedLabel,
  sliderToSpeed,
  speedToSlider,
} from "../../src/autoScrollController.js";

test("saved speed is clamped but not snapped", () => {
  assert.equal(normalizeSpeed("16.113112450912393"), 16.113112450912393);
  assert.equal(normalizeSpeed(20), 20);
  assert.equal(normalizeSpeed(0.4), 0.4);
  assert.equal(normalizeSpeed(0), 0);
  assert.equal(normalizeSpeed(500), 160);
  assert.equal(normalizeSpeed("junk", 20), 20);
  assert.equal(normalizeSpeed(-1, 20), 20);
});

test("label: integers no decimals, else two", () => {
  assert.equal(formatSpeedLabel(16.113112450912393), "16.11 px/s");
  assert.equal(formatSpeedLabel(16), "16 px/s");
  assert.equal(formatSpeedLabel(16.1), "16.10 px/s");
  assert.equal(formatSpeedLabel(20), "20 px/s");
  assert.equal(formatSpeedLabel(21.224160000000005), "21.22 px/s");
  assert.equal(formatSpeedLabel(0), "0 px/s");
});

test("cubic map: center is 20, max is 160, min is 0", () => {
  assert.equal(sliderToSpeed(0), 0);
  assert.equal(sliderToSpeed(0.5), 20);
  assert.equal(sliderToSpeed(1), 160);
  assert.equal(speedToSlider(20), 0.5);
  assert.equal(speedToSlider(160), 1);
  assert.equal(speedToSlider(0), 0);
  assert.equal(sliderToSpeed(speedToSlider(20)), 20);
});

test("fine steps near center are much smaller than the old 4 px/s grid", () => {
  const mid = sliderToSpeed(0.5);
  const justRight = sliderToSpeed(0.51);
  const justLeft = sliderToSpeed(0.49);
  assert.equal(mid, 20);
  assert.ok(justRight > mid);
  assert.ok(justLeft < mid);
  assert.ok(justRight - mid < 2);
  assert.ok(mid - justLeft < 2);
  assert.ok(Math.abs(justRight - mid) < 4);
  assert.ok(Math.abs(mid - justLeft) < 4);
});

test("a saved 20 px/s maps the thumb to slider center", () => {
  assert.equal(speedToSlider(normalizeSpeed(20)), 0.5);
});
