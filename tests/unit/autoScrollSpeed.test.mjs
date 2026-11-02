import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSpeed } from "../../src/autoScrollController.js";

test("unrounded saved speed snaps to slider grid", () => {
  assert.equal(normalizeSpeed("16.113112450912393"), 16);
  assert.equal(normalizeSpeed(20), 20);
  assert.equal(normalizeSpeed(0.4), 8);
  assert.equal(normalizeSpeed(500), 160);
  assert.equal(normalizeSpeed("junk", 20), 20);
});
