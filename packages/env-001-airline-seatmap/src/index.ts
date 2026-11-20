import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  type DomObservation,
  type GauntletEnv,
  InteractionChainGuard,
  mulberry32,
  type SeededTask,
  SqliteWalHarness,
  type VerificationReport,
} from "../../core/src/index.ts";

export interface SeatmapExpected {
  flightNumber: string;
  passengerEmail: string;
  validTargetSeat: string;
  phantomConflictSeat: string;
}

interface SeatRow {
  seat_id: string;
  row_num: number;
  col_letter: string;
  is_aisle: number;
  is_exit_row: number;
  status: "available" | "occupied" | "phantom_race" | "booked_by_agent";
}

/**
 * env-001-airline-seatmap
 *
 * Models the classic real-world airline seat selection failure cascade:
 * 1. Cabin layout is rendered as an inline SVG diagram with occluded overhead-bin
 *    chrome around naive bounding-box centers (`svg-hit-target` + `occluded-hitbox`).
 * 2. One exit-row aisle seat appears available on initial render (`phantom_race`),
 *    optimistically highlights on click, and then rejects with HTTP 409 (`SEAT_TAKEN_CONCURRENTLY`)
 *    forcing the agent to recover and pick the true unobstructed exit-row aisle seat.
 * 3. Exit-row seats require an explicit FAA eligibility modal acknowledgment token
 *    before `/api/confirm` commits the PNR (`modal-step-gate` + `InteractionChainGuard`).
 */
export class AirlineSeatmapEnv implements GauntletEnv<SeatmapExpected> {
  readonly id = "001-airline-svg-seatmap";
  readonly taxonomy = "spatial-svg-canvas" as const;
  readonly uiTraps = [
    "svg-hit-target",
    "occluded-hitbox",
    "optimistic-rollback",
    "modal-step-gate",
  ] as const;

  private store: SqliteWalHarness | null = null;
  private server: Server | null = null;
  private baseUrl = "";
  private readonly guard = new InteractionChainGuard();
  private currentFlight = "GX-408";
  private currentPassenger = "alex.chen@example.test";

  async boot(): Promise<{ baseUrl: string; journalMode: string }> {
    this.store = new SqliteWalHarness("gauntlet-001-");
    this.store.db.exec(`
      CREATE TABLE seats (
        seat_id TEXT PRIMARY KEY,
        row_num INTEGER NOT NULL,
        col_letter TEXT NOT NULL,
        is_aisle INTEGER NOT NULL,
        is_exit_row INTEGER NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE bookings (
        pnr TEXT PRIMARY KEY,
        flight_number TEXT NOT NULL,
        passenger_email TEXT NOT NULL,
        seat_id TEXT NOT NULL UNIQUE,
        exit_criteria_ack INTEGER NOT NULL,
        created_seq INTEGER NOT NULL
      );
    `);

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err: unknown) => {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      });
    });

    await new Promise<void>((resolve) => {
      // Strictly loopback-bound: zero external ingress or egress dependency.
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${addr.port}`;
    return { baseUrl: this.baseUrl, journalMode: this.store.journalMode };
  }

  async seed(rngSeed: number): Promise<SeededTask<SeatmapExpected>> {
    if (!this.store) throw new Error("Call boot() before seed()");
    const rand = mulberry32(rngSeed);
    this.guard.rotateSecret();

    this.store.db.exec("DELETE FROM bookings; DELETE FROM seats;");
    const exitRow = 14;
    const cols = ["A", "B", "C", "D", "E", "F"];
    const exitAisles = ["14C", "14D", "15C", "15D"];
    const exitCandidates = ["14C", "14D"];
    const phantomIdx = rand() < 0.5 ? 0 : 1;
    const phantomConflictSeat = exitCandidates[phantomIdx];
    const validTargetSeat = exitCandidates[1 - phantomIdx];

    const insert = this.store.db.prepare(
      "INSERT INTO seats (seat_id, row_num, col_letter, is_aisle, is_exit_row, status) VALUES (?, ?, ?, ?, ?, ?)",
    );

    for (let row = 12; row <= 16; row++) {
      for (const col of cols) {
        const seatId = `${row}${col}`;
        const isAisle = col === "C" || col === "D" ? 1 : 0;
        const isExit = row === exitRow ? 1 : 0;
        let status: SeatRow["status"];
        if (seatId === phantomConflictSeat) {
          status = "phantom_race";
        } else if (seatId === validTargetSeat) {
          status = "available";
        } else {
          status = rand() < 0.65 ? "occupied" : "available";
        }
        insert.run(seatId, row, col, isAisle, isExit, status);
      }
    }

    // Lock clean baseline inside WAL savepoint so reset() rolls back in <1ms.
    this.store.markSeedSavepoint();
    void exitAisles;

    return {
      startUrl: `${this.baseUrl}/checkin?flight=${this.currentFlight}`,
      taskPrompt:
        `Complete seat selection for ${this.currentPassenger} on flight ${this.currentFlight} (SFO -> JFK). ` +
        `Select an available Exit Row (Row 14) AISLE seat, accept the FAA exit-row eligibility modal, and finalize the PNR.`,
      expected: {
        flightNumber: this.currentFlight,
        passengerEmail: this.currentPassenger,
        validTargetSeat,
        phantomConflictSeat,
      },
    };
  }

  async reset(): Promise<{ elapsedMs: number }> {
    if (!this.store) throw new Error("Environment not booted");
    this.guard.rotateSecret();
    return this.store.rollbackToSeed();
  }

  async verify(dom: DomObservation, expected: SeatmapExpected): Promise<VerificationReport> {
    if (!this.store) throw new Error("Environment not booted");
    const diffs: string[] = [];

    const rows = this.store.db
      .prepare("SELECT pnr, flight_number, passenger_email, seat_id, exit_criteria_ack FROM bookings")
      .all() as Array<{
      pnr: string;
      flight_number: string;
      passenger_email: string;
      seat_id: string;
      exit_criteria_ack: number;
    }>;

    if (rows.length !== 1) {
      diffs.push(`expected exactly 1 committed booking in SQLite, found ${rows.length}`);
    } else {
      const booking = rows[0];
      if (booking.seat_id !== expected.validTargetSeat) {
        diffs.push(`expected booked seat ${expected.validTargetSeat}, got ${booking.seat_id}`);
      }
      if (booking.exit_criteria_ack !== 1) {
        diffs.push("FAA exit-row acknowledgment flag missing in bookings table");
      }
      if (booking.passenger_email !== expected.passengerEmail) {
        diffs.push(`passenger mismatch: ${booking.passenger_email}`);
      }
      if (dom.renderedPnr !== booking.pnr) {
        diffs.push(`DOM PNR (${dom.renderedPnr ?? "null"}) != SQLite PNR (${booking.pnr})`);
      }
      if (dom.renderedSeat !== expected.validTargetSeat) {
        diffs.push(`DOM confirmed seat (${dom.renderedSeat ?? "null"}) != ${expected.validTargetSeat}`);
      }
    }

    if (dom.activeModalOpen) {
      diffs.push("confirmation modal left open after submission");
    }
    if (dom.clsScore > 0.01) {
      diffs.push(`CLS budget exceeded: ${dom.clsScore.toFixed(4)} > 0.0100`);
    }

    return {
      passed: diffs.length === 0,
      invariantDiffs: diffs,
      clsScore: dom.clsScore,
    };
  }

  async close(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    if (this.store) {
      this.store.destroy();
      this.store = null;
    }
  }

  private async readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", this.baseUrl);
    const db = this.store!.db;

    if (req.method === "GET" && url.pathname === "/checkin") {
      const seats = db
        .prepare("SELECT seat_id, row_num, col_letter, is_aisle, is_exit_row, status FROM seats ORDER BY row_num, col_letter")
        .all() as unknown as SeatRow[];
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(this.renderCabinHtml(seats));
      return;
    }

    // Step 1: SVG hitbox click -> holds seat or surfaces optimistic 409 race conflict
    if (req.method === "POST" && url.pathname === "/api/seat-hold") {
      const body = await this.readJson(req);
      const seatId = String(body.seatId || "");
      const hitboxTarget = String(body.hitboxTarget || "");

      if (hitboxTarget !== "svg-seat-hitbox") {
        res.writeHead(422, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "OCCLUDED_BIN_OVERLAY", message: "Click hit overhead-bin chrome instead of SVG seat hitbox." }));
        return;
      }

      const seat = db
        .prepare("SELECT seat_id, is_exit_row, status FROM seats WHERE seat_id = ?")
        .get(seatId) as { seat_id: string; is_exit_row: number; status: SeatRow["status"] } | undefined;

      if (!seat || seat.status === "occupied" || seat.status === "booked_by_agent") {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "SEAT_UNAVAILABLE", seatId }));
        return;
      }

      if (seat.status === "phantom_race") {
        // Persist that another concurrent check-in session claimed this seat mid-flight
        db.prepare("UPDATE seats SET status = 'occupied' WHERE seat_id = ?").run(seatId);
        res.writeHead(409, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            code: "SEAT_TAKEN_CONCURRENTLY",
            seatId,
            message: `Seat ${seatId} was just claimed by another passenger. Rolling back selection.`,
          }),
        );
        return;
      }

      const holdToken = this.guard.issueToken("seat-hold", seatId);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          seatId,
          requiresExitModal: seat.is_exit_row === 1,
          holdToken,
        }),
      );
      return;
    }

    // Step 2: FAA exit-row modal acknowledgment -> upgrades holdToken to exitAckToken
    if (req.method === "POST" && url.pathname === "/api/exit-row-ack") {
      const body = await this.readJson(req);
      const seatId = String(body.seatId || "");
      const holdToken = typeof body.holdToken === "string" ? body.holdToken : undefined;
      const accepted = body.accepted === true;

      if (!accepted || !this.guard.verifyToken(holdToken, "seat-hold", seatId)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "UI_INTERACTION_REQUIRED", stage: "seat-hold" }));
        return;
      }

      const confirmToken = this.guard.issueToken("exit-ack", seatId, holdToken);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ seatId, confirmToken }));
      return;
    }

    // Step 3: Commit PNR (rejects direct API shortcuts missing cryptographic UI token chain)
    if (req.method === "POST" && url.pathname === "/api/confirm") {
      const body = await this.readJson(req);
      const seatId = String(body.seatId || "");
      const confirmToken = typeof body.confirmToken === "string" ? body.confirmToken : undefined;

      const seat = db
        .prepare("SELECT seat_id, is_exit_row, status FROM seats WHERE seat_id = ?")
        .get(seatId) as { seat_id: string; is_exit_row: number; status: SeatRow["status"] } | undefined;

      if (!seat || seat.status !== "available") {
        res.writeHead(409, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "SEAT_NOT_AVAILABLE", seatId }));
        return;
      }

      const expectedStage = seat.is_exit_row === 1 ? "exit-ack" : "seat-hold";
      if (!this.guard.verifyToken(confirmToken, expectedStage, seatId)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            code: "UI_INTERACTION_REQUIRED",
            message: "Direct API shortcut blocked: missing verified UI interaction token chain.",
          }),
        );
        return;
      }

      const pnr = `PNR-${this.currentFlight.replace("-", "")}-${seatId}`;
      db.prepare("UPDATE seats SET status = 'booked_by_agent' WHERE seat_id = ?").run(seatId);
      db.prepare(
        "INSERT INTO bookings (pnr, flight_number, passenger_email, seat_id, exit_criteria_ack, created_seq) VALUES (?, ?, ?, ?, ?, 1)",
      ).run(pnr, this.currentFlight, this.currentPassenger, seatId, seat.is_exit_row);

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, pnr, seatId }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  }

  private renderCabinHtml(seats: SeatRow[]): string {
    const colX: Record<string, number> = { A: 40, B: 88, C: 136, D: 214, E: 262, F: 310 };
    const svgNodes = seats
      .map((s) => {
        const x = colX[s.col_letter] ?? 40;
        const y = 40 + (s.row_num - 12) * 56;
        // Phantom race seat intentionally renders visually identical to available seats on initial load
        const visualAvailable = s.status === "available" || s.status === "phantom_race";
        const fill = visualAvailable ? (s.is_exit_row ? "#0ea5e9" : "#22c55e") : "#475569";
        return `
          <g class="seat-group" data-seat="${s.seat_id}" data-exit="${s.is_exit_row}" data-aisle="${s.is_aisle}">
            <rect class="seat-hitbox" data-hitbox="svg-seat-hitbox" data-seat="${s.seat_id}"
              role="button" tabindex="${visualAvailable ? "0" : "-1"}"
              aria-disabled="${!visualAvailable}"
              aria-label="Seat ${s.seat_id} ${s.is_exit_row ? "Exit Row " : ""}${s.is_aisle ? "Aisle" : "Standard"}"
              x="${x}" y="${y}" width="38" height="38" rx="6" fill="${fill}" />
            <rect class="overhead-bin-chrome" data-hitbox="bin-overlay" x="${x}" y="${y - 8}" width="38" height="9" fill="#94a3b8" opacity="0.35" />
            <text x="${x + 19}" y="${y + 24}" text-anchor="middle" fill="#fff" font-size="11" pointer-events="none">${s.seat_id}</text>
          </g>`;
      })
      .join("\n");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Gauntlet 001 · ${this.currentFlight} Cabin Check-In</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .layout { display: grid; grid-template-columns: 400px 320px; gap: 24px; align-items: start; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; min-height: 140px; }
    #status-banner { min-height: 24px; color: #fbbf24; font-size: 14px; margin-bottom: 12px; }
    dialog { background: #1e293b; color: #f8fafc; border: 1px solid #38bdf8; border-radius: 10px; padding: 20px; max-width: 360px; }
    button { background: #0284c7; color: white; border: none; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-weight: 600; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="layout">
    <div class="card">
      <h2>Flight ${this.currentFlight} · SFO → JFK (Exit Row 14)</h2>
      <div id="status-banner" role="status">Select an available seat to continue.</div>
      <svg id="cabin-svg" width="368" height="330" viewBox="0 0 368 330" aria-label="Aircraft cabin seat map">
        <text x="184" y="22" text-anchor="middle" fill="#94a3b8" font-size="12">AISLE BETWEEN C &amp; D · EXIT ROW 14</text>
        ${svgNodes}
      </svg>
    </div>
    <div class="card" id="summary-panel" data-pnr="" data-confirmed-seat="">
      <h3>Boarding Pass Summary</h3>
      <p>Passenger: <strong>${this.currentPassenger}</strong></p>
      <p>Selected Seat: <span id="selected-seat">None</span></p>
      <p>Confirmation PNR: <span id="confirmed-pnr">Pending</span></p>
      <button id="finalize-btn" disabled>Finalize Check-In</button>
    </div>
  </div>
  <dialog id="exit-modal">
    <h4>FAA Exit Row Briefing (14 CFR § 121.585)</h4>
    <p>Confirm passenger is willing and able to assist crew in an emergency evacuation.</p>
    <button id="ack-exit-btn">I Confirm Eligibility</button>
  </dialog>
  <script>
    let state = { seatId: null, holdToken: null, confirmToken: null };
    const banner = document.getElementById("status-banner");
    const seatLabel = document.getElementById("selected-seat");
    const finalizeBtn = document.getElementById("finalize-btn");
    const modal = document.getElementById("exit-modal");

    document.getElementById("cabin-svg").addEventListener("click", async (e) => {
      const target = e.target;
      const hitbox = target.getAttribute("data-hitbox");
      const seatId = target.getAttribute("data-seat") || target.parentElement?.getAttribute("data-seat");
      if (!seatId) return;

      // Optimistic selection highlight before server validation returns
      seatLabel.textContent = seatId + " (holding...)";
      const res = await fetch("/api/seat-hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatId, hitboxTarget: hitbox })
      });
      const data = await res.json();
      if (!res.ok) {
        state = { seatId: null, holdToken: null, confirmToken: null };
        seatLabel.textContent = "None";
        finalizeBtn.disabled = true;
        if (data.code === "SEAT_TAKEN_CONCURRENTLY") {
          const rect = document.querySelector('.seat-hitbox[data-seat="' + seatId + '"]');
          if (rect) { rect.setAttribute("fill", "#475569"); rect.setAttribute("aria-disabled", "true"); }
        }
        banner.textContent = data.message || data.code;
        return;
      }
      state.seatId = seatId;
      state.holdToken = data.holdToken;
      seatLabel.textContent = seatId;
      if (data.requiresExitModal) {
        modal.showModal();
      } else {
        state.confirmToken = data.holdToken;
        finalizeBtn.disabled = false;
      }
    });

    document.getElementById("ack-exit-btn").addEventListener("click", async () => {
      const res = await fetch("/api/exit-row-ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatId: state.seatId, holdToken: state.holdToken, accepted: true })
      });
      const data = await res.json();
      if (res.ok) {
        state.confirmToken = data.confirmToken;
        modal.close();
        finalizeBtn.disabled = false;
        banner.textContent = "Exit row briefing acknowledged for " + state.seatId;
      }
    });

    finalizeBtn.addEventListener("click", async () => {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatId: state.seatId, confirmToken: state.confirmToken })
      });
      const data = await res.json();
      if (res.ok) {
        document.getElementById("confirmed-pnr").textContent = data.pnr;
        const panel = document.getElementById("summary-panel");
        panel.dataset.pnr = data.pnr;
        panel.dataset.confirmedSeat = data.seatId;
        finalizeBtn.disabled = true;
        banner.textContent = "Checked in: " + data.pnr;
      }
    });
  </script>
</body>
</html>`;
  }
}
