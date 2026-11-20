import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type FailureTaxonomy =
  | "spatial-svg-canvas"
  | "shadow-dom-iframe"
  | "optimistic-race"
  | "virtualized-grid"
  | "multi-step-drawer"
  | "multi-tab-session";

export type UiTrapTag =
  | "svg-hit-target"
  | "occluded-hitbox"
  | "shadow-dom"
  | "optimistic-rollback"
  | "virtual-grid"
  | "modal-step-gate"
  | "stale-closure-debounce";

export interface DomObservation {
  renderedPnr?: string | null;
  renderedSeat?: string | null;
  activeModalOpen?: boolean;
  clsScore: number;
}

export interface VerificationReport {
  passed: boolean;
  invariantDiffs: string[];
  clsScore: number;
}

export interface SeededTask<TExpected> {
  startUrl: string;
  taskPrompt: string;
  expected: TExpected;
}

export interface GauntletEnv<TExpected> {
  readonly id: string;
  readonly taxonomy: FailureTaxonomy;
  readonly uiTraps: readonly UiTrapTag[];
  boot(): Promise<{ baseUrl: string; journalMode: string }>;
  seed(rngSeed: number): Promise<SeededTask<TExpected>>;
  reset(): Promise<{ elapsedMs: number }>;
  verify(dom: DomObservation, expected: TExpected): Promise<VerificationReport>;
  close(): Promise<void>;
}

/**
 * Deterministic 32-bit PRNG (Mulberry32) so every seed produces identical
 * database inventory, conflict traps, and expected target outcomes across runs.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * File-backed SQLite store running in real WAL mode with named SAVEPOINT
 * rollback. Allows resetting complex relational sandbox state in <1ms between
 * episode rollouts without re-running DDL or restarting processes.
 */
export class SqliteWalHarness {
  readonly db: DatabaseSync;
  readonly journalMode: string;
  private readonly workDir: string;
  private activeSavepoint = false;

  constructor(prefix = "gauntlet-") {
    this.workDir = mkdtempSync(join(tmpdir(), prefix));
    const dbPath = join(this.workDir, "sandbox.db");
    this.db = new DatabaseSync(dbPath);
    const row = this.db.prepare("PRAGMA journal_mode = WAL").get() as { journal_mode: string };
    this.db.exec("PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
    this.journalMode = String(row.journal_mode).toLowerCase();
  }

  markSeedSavepoint(): void {
    if (this.activeSavepoint) {
      this.db.exec("RELEASE SAVEPOINT gauntlet_seed;");
    }
    this.db.exec("SAVEPOINT gauntlet_seed;");
    this.activeSavepoint = true;
  }

  rollbackToSeed(): { elapsedMs: number } {
    if (!this.activeSavepoint) {
      throw new Error("Cannot rollback before markSeedSavepoint() is called");
    }
    const t0 = performance.now();
    this.db.exec("ROLLBACK TO SAVEPOINT gauntlet_seed;");
    return { elapsedMs: Number((performance.now() - t0).toFixed(3)) };
  }

  destroy(): void {
    try {
      this.db.close();
    } finally {
      rmSync(this.workDir, { recursive: true, force: true });
    }
  }
}

/**
 * Cryptographic step-chain guard preventing agents from reward-hacking sandboxes
 * by calling backend mutation endpoints directly via fetch/curl instead of
 * completing required DOM interaction stages.
 */
export class InteractionChainGuard {
  private secret: Buffer = randomBytes(32);

  rotateSecret(): void {
    this.secret = randomBytes(32);
  }

  issueToken(stage: string, subject: string, priorToken = "genesis"): string {
    const payload = `${stage}:${subject}:${priorToken}`;
    const sig = createHmac("sha256", this.secret).update(payload).digest("hex").slice(0, 24);
    return `${Buffer.from(payload).toString("base64url")}.${sig}`;
  }

  verifyToken(token: string | undefined, expectedStage: string, expectedSubject: string): boolean {
    if (!token || !token.includes(".")) return false;
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return false;
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const [stage, subject] = payload.split(":");
    if (stage !== expectedStage || subject !== expectedSubject) return false;
    const expectedSig = createHmac("sha256", this.secret).update(payload).digest("hex").slice(0, 24);
    return sig === expectedSig;
  }
}
