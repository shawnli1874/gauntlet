import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AirlineSeatmapEnv } from "../packages/env-001-airline-seatmap/src/index.ts";
import { validateChangedPaths } from "../scripts/check-isolation.ts";

describe("Gauntlet Core & env-001-airline-seatmap", () => {
  it("runs SQLite in real WAL mode and rolls back mutations via SAVEPOINT in <10ms", async () => {
    const env = new AirlineSeatmapEnv();
    try {
      const { baseUrl, journalMode } = await env.boot();
      assert.equal(journalMode, "wal");

      const seeded = await env.seed(1337);
      // Trigger phantom seat mutation (flips phantom seat to occupied in DB)
      const raceRes = await fetch(`${baseUrl}/api/seat-hold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seatId: seeded.expected.phantomConflictSeat,
          hitboxTarget: "svg-seat-hitbox",
        }),
      });
      assert.equal(raceRes.status, 409);

      // Reset via SQLite SAVEPOINT rollback and verify phantom seat is restored
      const { elapsedMs } = await env.reset();
      assert.ok(elapsedMs < 10, `expected <10ms savepoint rollback, got ${elapsedMs}ms`);

      const htmlAfterReset = await (await fetch(seeded.startUrl)).text();
      assert.match(
        htmlAfterReset,
        new RegExp(`data-seat="${seeded.expected.phantomConflictSeat}"[^>]*aria-disabled="false"`),
      );
    } finally {
      await env.close();
    }
  });

  it("blocks direct API reward-hacking shortcuts missing the UI interaction token chain", async () => {
    const env = new AirlineSeatmapEnv();
    try {
      const { baseUrl } = await env.boot();
      const seeded = await env.seed(7);

      const bypassRes = await fetch(`${baseUrl}/api/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seatId: seeded.expected.validTargetSeat,
          confirmToken: "forged.token",
        }),
      });
      assert.equal(bypassRes.status, 403);
      const payload = (await bypassRes.json()) as { code: string };
      assert.equal(payload.code, "UI_INTERACTION_REQUIRED");

      const report = await env.verify(
        { renderedPnr: `PNR-GX408-${seeded.expected.validTargetSeat}`, renderedSeat: seeded.expected.validTargetSeat, clsScore: 0 },
        seeded.expected,
      );
      assert.equal(report.passed, false);
      assert.ok(report.invariantDiffs.some((d) => d.includes("expected exactly 1 committed booking")));
    } finally {
      await env.close();
    }
  });

  it("handles optimistic 409 seat race recovery, exit-row modal gate, and dual SQL+DOM verification across 20 seeds", async () => {
    const env = new AirlineSeatmapEnv();
    try {
      const { baseUrl } = await env.boot();

      for (let seed = 1; seed <= 20; seed++) {
        const { expected } = await env.seed(seed);

        // 1. Clicking occluded overhead-bin overlay fails cleanly
        const occluded = await fetch(`${baseUrl}/api/seat-hold`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seatId: expected.phantomConflictSeat, hitboxTarget: "bin-overlay" }),
        });
        assert.equal(occluded.status, 422);

        // 2. Clicking phantom seat triggers realistic 409 concurrent booking conflict
        const conflict = await fetch(`${baseUrl}/api/seat-hold`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seatId: expected.phantomConflictSeat, hitboxTarget: "svg-seat-hitbox" }),
        });
        assert.equal(conflict.status, 409);

        // 3. Recovering onto the true available exit-row aisle seat issues step-1 holdToken
        const holdRes = await fetch(`${baseUrl}/api/seat-hold`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ seatId: expected.validTargetSeat, hitboxTarget: "svg-seat-hitbox" }),
        });
        assert.equal(holdRes.status, 200);
        const holdJson = (await holdRes.json()) as { holdToken: string; requiresExitModal: boolean };
        assert.equal(holdJson.requiresExitModal, true);

        // 4. Completing FAA exit-row modal issues step-2 confirmToken
        const ackRes = await fetch(`${baseUrl}/api/exit-row-ack`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seatId: expected.validTargetSeat,
            holdToken: holdJson.holdToken,
            accepted: true,
          }),
        });
        assert.equal(ackRes.status, 200);
        const ackJson = (await ackRes.json()) as { confirmToken: string };

        // 5. Finalizing commits SQLite row and passes dual SQL+DOM oracle
        const confirmRes = await fetch(`${baseUrl}/api/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seatId: expected.validTargetSeat,
            confirmToken: ackJson.confirmToken,
          }),
        });
        assert.equal(confirmRes.status, 200);
        const confirmJson = (await confirmRes.json()) as { pnr: string; seatId: string };

        const report = await env.verify(
          {
            renderedPnr: confirmJson.pnr,
            renderedSeat: confirmJson.seatId,
            activeModalOpen: false,
            clsScore: 0.002,
          },
          expected,
        );
        assert.equal(report.passed, true, report.invariantDiffs.join("; "));
      }
    } finally {
      await env.close();
    }
  });
});

describe("CI Worker Path Isolation Gate", () => {
  it("allows single-sandbox worker PRs and rejects cross-package or core edits", () => {
    const valid = validateChangedPaths([
      "packages/env-042-erp-split-po/src/index.ts",
      "packages/env-042-erp-split-po/test/oracle.test.ts",
    ]);
    assert.equal(valid.allowed, true);
    assert.equal(valid.packageScope, "env-042-erp-split-po");

    const crossPkg = validateChangedPaths([
      "packages/env-042-erp-split-po/src/index.ts",
      "packages/env-043-customs-hs-cascade/src/index.ts",
    ]);
    assert.equal(crossPkg.allowed, false);

    const touchedCore = validateChangedPaths([
      "packages/env-042-erp-split-po/src/index.ts",
      "packages/core/src/index.ts",
    ]);
    assert.equal(touchedCore.allowed, false);
  });
});
