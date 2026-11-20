# Gauntlet

[![Gauntlet CI](https://github.com/shawnli1874/gauntlet/actions/workflows/ci.yml/badge.svg)](https://github.com/shawnli1874/gauntlet/actions/workflows/ci.yml)

**Gauntlet** is an air-gapped, deterministic suite of **120 stateful full-stack web sandboxes** with dual **SQLite + DOM oracles** built to evaluate and harden browser agents against the UI failure modes that break them in production.

Most browser-agent benchmarks test 4–5 clean CRUD clones. In production, agents fail on **occluded SVG seat maps, closed-style Shadow DOM widgets, optimistic-UI `409` rollbacks, virtualized grids where target rows aren't mounted in the DOM, and multi-tab session expiry**.

---

## Core Design Guarantees

1. **Air-Gapped Loopback Execution (`127.0.0.1` / `--network=none`)**  
   Zero external APIs, CDNs, or shared proxy dependencies. Every sandbox boots an ephemeral loopback server backed by local Node 24 `node:sqlite`.
2. **`<1ms` Deterministic Resets via SQLite WAL Savepoints**  
   `SqliteWalHarness` runs in real `WAL` mode, seeds relational state via Mulberry32 PRNG, and marks `SAVEPOINT gauntlet_seed`—allowing rollouts to reset mutations via `ROLLBACK TO SAVEPOINT` in sub-millisecond time.
3. **Anti-Reward-Hack Cryptographic UI Guard (`InteractionChainGuard`)**  
   Agents cannot bypass the UI by calling mutation endpoints directly via `fetch`/`curl`. Every terminal mutation requires an HMAC-verified interaction token chain issued step-by-step by real DOM/modal events.
4. **Zero-Conflict Parallel Fan-Out (`scripts/check-isolation.ts`)**  
   CI rejects any worker PR touching files outside a single `packages/env-XXX-<slug>/` directory, allowing 30+ parallel coding & browser-QA agents to build and verify `env-001`..`env-120` concurrently without rebase gridlock.

---

## Repository Layout

```text
gauntlet/
├── packages/
│   ├── core/                        # GauntletEnv contract, SqliteWalHarness, InteractionChainGuard
│   └── env-001-airline-seatmap/     # Reference sandbox: SVG hitbox + 409 phantom seat race + FAA modal
├── scripts/
│   └── check-isolation.ts           # CI path-isolation gate enforcing 1-package-per-PR
├── docs/
│   └── SPEC-120.md                  # Full 120-sandbox taxonomy & 7-PR-per-env execution pipeline
└── test/
    └── gauntlet.test.ts             # WAL savepoint, anti-shortcut, 20-seed race recovery & CI gate tests
```

---

## Quickstart (Zero Dependencies · Node 24+)

```bash
# Run core WAL savepoint, anti-shortcut, 20-seed oracle, and CI isolation suite
npm test

# Boot env-001 (Flight GX-408 SFO -> JFK interactive SVG seat map) locally
npm run demo:001
```

See [`docs/SPEC-120.md`](docs/SPEC-120.md) for the complete 120-environment specification and 4-Bot verification loop.
