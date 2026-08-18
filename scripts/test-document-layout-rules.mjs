import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPgdSignatureSlotPlan,
  buildSignatureLayoutPlan,
} from "../document-layout-rules.mjs";

test("signature rows use first-row grid and align shorter rows right", () => {
  assert.deepEqual(buildSignatureLayoutPlan(3), {
    groupSizes: [3],
    slotCount: 3,
    groupSlotIndexes: [[0, 1, 2]],
    rowCapacity: 2,
  });
  assert.deepEqual(buildSignatureLayoutPlan(5).groupSlotIndexes, [[0, 1, 2], [1, 2]]);
  assert.deepEqual(buildSignatureLayoutPlan(6).groupSlotIndexes, [[0, 1, 2], [0, 1, 2]]);
  assert.deepEqual(buildSignatureLayoutPlan(7).groupSlotIndexes, [[0, 1, 2, 3], [1, 2, 3]]);
  assert.deepEqual(buildSignatureLayoutPlan(8).groupSlotIndexes, [[0, 1, 2, 3], [0, 1, 2, 3]]);
});

test("PGD reference signature slots match native PDF geometry", () => {
  assert.deepEqual(buildPgdSignatureSlotPlan(2).groupSlotRanges, [
    [[7, 9], [10, 10]],
  ]);
  assert.deepEqual(buildPgdSignatureSlotPlan(3).groupSlotRanges, [
    [[4, 6], [7, 9], [10, 10]],
  ]);
  assert.deepEqual(buildPgdSignatureSlotPlan(5).groupSlotRanges, [
    [[4, 6], [7, 9], [10, 10]],
    [[7, 9], [10, 10]],
  ]);
  assert.deepEqual(buildPgdSignatureSlotPlan(7).groupSlotRanges, [
    [[3, 3], [4, 6], [7, 9], [10, 10]],
    [[4, 6], [7, 9], [10, 10]],
  ]);
});

test("native signature layout rejects unsupported signer counts", () => {
  assert.throws(() => buildPgdSignatureSlotPlan(1), /2 sampai 8/);
  assert.throws(() => buildPgdSignatureSlotPlan(9), /2 sampai 8/);
});
