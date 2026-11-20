import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface IsolationResult {
  allowed: boolean;
  packageScope: string | null;
  violations: string[];
}

const ENV_PKG_RE = /^packages\/(env-\d{3}-[a-z0-9-]+)\//;

/**
 * Enforces zero-conflict parallel fan-out across worker branches:
 * - Without the `core-infra` label, a PR may only modify files inside a single
 *   `packages/env-XXX-<slug>/` directory.
 * - Any edit to `packages/core/`, root config, or a second `env-YYY` package is rejected.
 */
export function validateChangedPaths(
  changedPaths: string[],
  options: { allowCoreInfra?: boolean } = {},
): IsolationResult {
  if (options.allowCoreInfra) {
    return { allowed: true, packageScope: "core-infra", violations: [] };
  }

  const normalized = changedPaths.map((p) => p.replace(/\\/g, "/").trim()).filter(Boolean);
  if (normalized.length === 0) {
    return { allowed: false, packageScope: null, violations: ["empty diff"] };
  }

  const envScopes = new Set<string>();
  const violations: string[] = [];

  for (const file of normalized) {
    const match = ENV_PKG_RE.exec(file);
    if (!match) {
      violations.push(`out-of-scope path: ${file}`);
      continue;
    }
    envScopes.add(match[1]);
  }

  if (envScopes.size > 1) {
    violations.push(`cross-package edit touches multiple sandboxes: ${[...envScopes].join(", ")}`);
  }

  return {
    allowed: violations.length === 0,
    packageScope: envScopes.size === 1 ? [...envScopes][0] : null,
    violations,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseRef = process.env.BASE_REF || "main";
  const labels: string[] = JSON.parse(process.env.PR_LABELS || "[]");
  const allowCoreInfra = labels.includes("core-infra");

  const diffOut = execFileSync("git", ["diff", "--name-only", `origin/${baseRef}...HEAD`], {
    encoding: "utf8",
  });
  const files = diffOut.split("\n").filter(Boolean);
  const result = validateChangedPaths(files, { allowCoreInfra });

  if (!result.allowed) {
    console.error("[isolation-gate] FAILED:");
    for (const v of result.violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`[isolation-gate] OK (scope=${result.packageScope}, files=${files.length})`);
}
