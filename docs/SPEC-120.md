# Gauntlet-120 Specification & Multi-Bot Execution Matrix

Every sandbox (`packages/env-001` .. `packages/env-120`) implements `GauntletEnv<TExpected>` from `packages/core` and runs strictly loopback-bound (`127.0.0.1`, `--network=none` compatible) backed by a WAL-mode SQLite database with `<1ms` `SAVEPOINT` state resets and cryptographic `InteractionChainGuard` anti-shortcut tokens.

## 7-Stage Atomic PR Pipeline per Environment (`120 × 7 = 840 PRs`)

CI (`scripts/check-isolation.ts`) restricts each worker branch to a single `packages/env-XXX-<slug>/` directory so 32+ parallel Devin VMs merge concurrently with zero rebase conflicts:

1. **PR 1 · Relational Schema & Seeded Generator**: Deterministic Mulberry32 generator populating realistic conflict rows and marking the `gauntlet_seed` WAL savepoint.
2. **PR 2 · Loopback API & Concurrency Traps**: Stateful HTTP routes modeling realistic race conditions (`409` optimistic conflicts, stale ETags, idempotency keys) and `InteractionChainGuard` validation.
3. **PR 3 · Trap UI Surface**: Zero-external-asset HTML/SVG/Canvas/WebComponent frontend implementing the target DOM failure mode.
4. **PR 4 · Dual SQL+DOM Oracle & Solvability Trace**: `verify(dom, expected)` checking both SQLite invariants and rendered DOM state, paired with one deterministic reference solvability test.
5. **PR 5 · Blind Browser-QA Playthrough**: Independent Browser-QA agent runs against the preview URL reading *only* `taskPrompt` (no source access), filing traces and landing fixes if UI affordances deadlock.
6. **PR 6 · Anti-Reward-Hack Hardening**: Fuzzes raw `fetch` replay, hidden query params, and skipped modal steps to guarantee `403 UI_INTERACTION_REQUIRED`.
7. **PR 7 · 20-Seed Cross-Engine Zero-Flake Gate**: Verifies 20 seeds in Chromium + WebKit with `0%` flake and `CLS < 0.01`.

---

## Taxonomy Matrix (120 Isolated Environments)

### Category 1 · Spatial SVG & Canvas Hit-Testing (`env-001` – `env-020`)
- `env-001-airline-svg-seatmap` — Narrowbody cabin SVG, overhead-bin hitbox occlusion, phantom `409` seat race, FAA exit-row modal (**implemented & passing**)
- `env-002-stadium-tier-seating` — Zoomable SVG concert bowl, obstructed-view polygon filter, 90-second cart hold timer
- `env-003-warehouse-rack-slotter` — 2D SVG aisle/bay/level hazmat slotting with weight-limit adjacency rules
- `env-004-pcb-jumper-router` — Interactive SVG pin header configurator with short-circuit DRC check
- `env-005-datacenter-rack-elevation` — 42U rack elevation drag-placement with PDU phase-balance constraints
- `env-006-marina-berth-assigner` —Rotated SVG slip polygons filtered by vessel beam and draft
- `env-007-dental-odontogram-chart` — Tooth-surface 5-zone SVG selector with insurance procedure code validation
- `env-008-floorplan-desk-hoteling` — Office neighborhood SVG map with team-zone policy locks
- `env-009-rail-sleeper-coach` — Lower/upper berth SVG car switching across multi-leg transfer
- `env-010-trade-show-booth-grid` — Exhibitor hall SVG parcel merger with corner-booth surcharge modal
- `env-011-solar-roof-obstruction` — Canvas roof facet panel placement avoiding vent keep-out zones
- `env-012-parking-lot-ev-bay` — SVG garage level switcher with kW charger-type filter
- `env-013-container-vessel-bayplan` — Reefer plug & stack-weight SVG bay planner
- `env-014-hospital-bed-ward-map` — Isolation-room negative-pressure SVG bed transfer board
- `env-015-cinema-couple-loveseat` — Single-seat-gap prevention rule on SVG auditorium map
- `env-016-network-topology-cutover` — SVG BGP link drain toggle requiring pre-check health modal
- `env-017-greenhouse-zone-valve` — SVG irrigation manifold toggle with pressure-drop interlock
- `env-018-ColdStorage-pallet-map` — Temperature-band SVG slot picker with FIFO lot lock
- `env-019-airport-gate-stand-chart` — Gantt + apron SVG widebody wingtip-clearance assigner
- `env-020-anatomical-pain-intake` — Dermatomal SVG region selector mapped to triage ICD intake

### Category 2 · Nested Shadow DOM & Cross-Frame Widgets (`env-021` – `env-040`)
- `env-021-shadow-range-datepicker` — Nested custom-element blackout calendar with timezone rollover trap
- `env-022-tokenized-card-iframe` — 3-iframe PCI split fields (PAN / expiry / CVC) + 3DS challenge frame
- `env-023-webcomponent-combobox` — Closed-style Shadow DOM async combobox with IME/composition commit guard
- `env-024-embedded-esign-pad` — Iframe document viewer requiring scroll-to-clause before signature unlock
- `env-025-oauth-consent-popup-bridge` — `postMessage` sandboxed consent frame with strict origin nonce
- `env-026-shadow-cron-builder` — Custom-element cron schedule editor with DST skip preview
- `env-027-microfrontend-healthticket` — Shell + 2 Shadow DOM remotes sharing event-bus filter state
- `env-028-iframe-pdf-redactor` — Framed canvas region redactor with apply-and-burn confirmation
- `env-029-shadow-tag-chip-input` — Delimiter-sensitive chip input inside nested slots
- `env-030-sandboxed-sql-notebook` — Worker/iframe query cell with read-only vs write-role toggle
- `env-031-shadow-color-contrast-picker` — Custom-element OKLCH picker enforcing WCAG AA ratio
- `env-032-iframe-map-geofence` — Embedded tile frame + host sidebar radius synchronization
- `env-033-shadow-tree-permission-acl` — Tri-state indeterminate checkbox tree inside web components
- `env-034-framed-sso-stepup-mfa` — Inline WebAuthn/TOTP step-up iframe before wire release
- `env-035-shadow-rich-mention-box` — `@user` slash-menu popover rendered in top-layer shadow portal
- `env-036-iframe-csv-column-mapper` — Sandboxed preview table mapping messy headers to strict schema
- `env-037-shadow-timewindow-slider` — Dual-thumb maintenance window slider in custom element
- `env-038-framed-kyb-beneficial-owner` — Nested UBO percentage split form requiring 100.00% sum
- `env-039-shadow-json-patch-diff` — Side-by-side collapsible hunk acceptor in Shadow DOM
- `env-040-iframe-customs-tariff-lookup` — Cross-frame HS chapter tree + host duty calculator

### Category 3 · Optimistic UI, Debounce & Concurrency Races (`env-041` – `env-060`)
- `env-041-optimistic-inventory-cart` — Flash-sale SKU decrement rolling back on checkout ETag mismatch
- `env-042-debounced-fx-quote-lock` — 8-second FX rate quote expiring mid-confirmation requiring re-lock
- `env-043-stale-search-autocomplete` — Out-of-order network responses overwriting newer filter queries
- `env-044-collaborative-doc-conflict` — Concurrent edit banner requiring three-way field merge
- `env-045-optimistic-kanban-wip-cap` — Drag-move reverting 120ms later when column WIP limit is breached
- `env-046-double-submit-wire-guard` — Disabled-then-re-enabled payout button testing idempotency recovery
- `env-047-autosave-blur-race` — Form submit racing against 400ms debounced field autosave PATCH
- `env-048-seat-upgrade-auction-outbid` — Live counter-bid invalidating optimistic slider bid
- `env-049-coupon-stacking-recalc` — Async tax/discount recomputation invalidating prior payment total
- `env-050-ci-merge-queue-rebase` — Stale branch status flipping from green to conflict during approval
- `env-051-appointment-slot-sniped` — Clinic slot taken between calendar click and patient intake submit
- `env-052-dns-ttl-propagation-gate` — Async verification polling before SSL issuance button unlocks
- `env-053-feature-flag-canary-abort` — Live error-rate spike auto-locking rollout slider mid-edit
- `env-054-ledger-reconcile-lock` — Period-close row lock requiring reversal journal instead of edit
- `env-055-webhook-replay-backoff` — Rate-limited retry drawer with Retry-After countdown enforcement
- `env-056-quota-reservation-lease` — GPU cluster lease expiring if node topology isn't finalized in 15s
- `env-057-async-iban-checksum-lookup` — BIC lookup mutating required intermediary bank fields asynchronously
- `env-058-split-shipment-backorder` — Warehouse stock change forcing split-delivery confirmation mid-flow
- `env-059-oncall-override-collision` — Overlapping PagerDuty-style schedule override conflict resolver
- `env-060-optimistic-acl-revoke` — Self-lockout guard rejecting admin role removal asynchronously

### Category 4 · Virtualized Canvas & High-Density Data Grids (`env-061` – `env-080`)
- `env-061-virtual-10k-log-triage` — Windowed 10,000-row incident grid where offscreen rows aren't in DOM
- `env-062-canvas-spreadsheet-formula` — Frozen-column virtual sheet requiring cell commit + formula fix
- `env-063-virtual-ledger-bulk-match` — Pinned-header reconciliation grid with multi-page selection trap
- `env-064-gantt-critical-path-shift` — Virtualized timeline horizontal + vertical dual-scroll dependency link
- `env-065-orderbook-ladder-ticket` — High-frequency scrolling price ladder with limit-price lock
- `env-066-virtual-iam-policy-matrix` — 500-row × 40-permission sticky matrix cell toggle
- `env-067-trace-flamegraph-span-pin` — Canvas span zoom + drawer attribute filter extraction
- `env-068-virtual-sku-price-override` — Inline cell editor losing state on scroll unless committed
- `env-069-timeseries-brush-anomaly` — Canvas range brush feeding paginated anomaly table
- `env-070-virtual-translation-cat-grid` — 4,000-segment localization grid filtering unconfirmed placeholders
- `env-071-cap-table-waterfall-sheet` — Editable convertible-note terms grid with live dilution check
- `env-072-virtual-container-manifest` — Bill-of-lading hazmat filter + inline seal-number correction
- `env-073-payroll-timesheet-exception` — Virtualized biweekly punch grid resolving overtime flags
- `env-074-cloud-cost-tag-backfill` — Grouped pivot table expanding lazy-loaded untagged resources
- `env-075-clinical-lab-flowsheet` — Sticky-date lab panel scrolling horizontally to abnormal critical value
- `env-076-db-migration-lock-table` — Live session table filtering blocking PID and executing safe cancel
- `env-077-ad-campaign-bid-grid` — Bulk inline CPA cap edit with validation popover on invalid rows
- `env-078-bom-component-substituter` — Multi-level indented virtual BOM tree replacing EOL capacitor
- `env-079-dns-zone-record-grid` — 2,000-record zone editor resolving CNAME-at-apex validation fault
- `env-080-audit-log-cursor-export` — Keyset-paginated virtual viewer scoping exact ISO window export

### Category 5 · Multi-Step ERP, Healthcare & Compliance Drawers (`env-081` – `env-100`)
- `env-081-prior-auth-medical-drawer` — CPT + ICD-10 pairing rules across stacked clinical attachment drawers
- `env-082-erp-three-way-po-match` — PO vs Goods-Receipt vs Invoice variance tolerance approval flow
- `env-083-customs-hs-origin-filing` — Cascading tariff schedule + COO certificate conditional sections
- `env-084-soc2-access-review-wizard` — Terminated-employee entitlement revocation + exception sign-off
- `env-085-insurance-fnol-subrogation` — Multi-party vehicle claim wizard with VIN decode & deductible gate
- `env-086-procurement-vendor-onboarding` — W-9 / W-8BEN branching tax classification + bank micro-deposit check
- `env-087-pharma-batch-deviation-capa` — GMP deviation root-cause + QA counter-signature workflow
- `env-088-corporate-card-split-expense` — Itemized hotel folio tax/tip split across cost centers
- `env-089-export-control-eccn-screen` — Dual-use ECCN license exception questionnaire + end-userundertaking
- `env-090-commercial-lease-cam-trueup` — Pro-rata CAM expense cap reconciliation wizard
- `env-091-hipaa-roi-redaction-intake` — Release-of-information scope checkboxes gating sensitive categories
- `env-092-construction-aia-pay-app` — Schedule-of-values % complete + retainage release lien waiver
- `env-093-grant-budget-reallocation` — Indirect-cost rate recalculation when shifting equipment to personnel
- `env-094-telecom-number-port-loa` — BTN/PIN carrier CSR match + firm-order-commitment date rules
- `env-095-gdpr-dsar-erasure-triage` — Legal-hold exemption check before executing partial account purge
- `env-096-aviation-mel-deferral-log` — Minimum Equipment List category B/C Placard + 3-day expiry calc
- `env-097-freight-demurrage-dispute` — Port free-time weather-delay evidence linker + credit memo calc
- `env-098-equity-iso-exercise-83b` — Early-exercise AMT preview + spousal consent conditional step
- `env-099-chargeback-compelling-evidence` — Visa CE3.0 historical clean-order matcher + submission lock
- `env-100-payroll-multistate-nexus` — Reciprocal state withholding wizard on mid-quarter address move

### Category 6 · Multi-Tab State, Popups & Session Lifecycle (`env-101` – `env-120`)
- `env-101-magiclink-loopback-inbox` — Local webmail tab + app tab token handoff with single-use link consumption
- `env-102-idle-jwt-draft-recovery` — Mid-wizard 401 session expiry preserving unsaved draft across re-auth
- `env-103-multi-tab-cart-storage-sync` — `BroadcastChannel` tab state conflict requiring canonical cart merge
- `env-104-sso-idp-role-switch` — Local IdP portal tab + SP dashboard tab SAML assertion refresh
- `env-105-webhook-inspector-roundtrip` — Admin settings tab configuring endpoint + local receiver tab verifying HMAC
- `env-106-popup-print-manifest-sign` — Child window packing-slip generator returning signed hash to opener
- `env-107-optimistic-tab-leader-lock` — Web Locks API single-editor tab handoff without losing form dirty state
- `env-108-oauth-pkce-redirect-chain` — State-mismatch CSRF trap if agent replays stale callback URL
- `env-109-two-person-approval-switch` — Requester session + approver session separation-of-duties verification
- `env-110-stripe-style-test-clock-tab` — Simulation clock tab advancing billing cycle + customer portal verification
- `env-111-staging-to-prod-promote` — Preview tab smoke check token required before prod deploy tab unlocks
- `env-112-support-impersonation-audit` — Read-only shadow session requiring explicit elevation reason to mutate
- `env-113-offline-queue-reconnect` — Simulated service-worker offline toggle + conflict resolution on reconnect
- `env-114-csrf-rotation-after-privilege` — Session cookie + CSRF token rotation immediately after password change
- `env-115-deep-link-filter-hydration` — URL query state clobbering localStorage filter unless reconciled
- `env-116-device-code-pairing-flow` — CLI/TV code screen + verification portal tab user-code authorization
- `env-117-download-checksum-reupload` — Generated statement download, tampering check, and signed re-import
- `env-118-tenant-switcher-context-bleed` — Multi-org header switcher guarding against submitting into wrong org ID
- `env-119-incident-warroom-statuspage` — Internal severity tracker tab syncing public status-page component state
- `env-120-key-rotation-zero-downtime` — Dual-key rollover across API consumer tab and KMS rotation console
