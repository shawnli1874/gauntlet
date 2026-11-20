import { AirlineSeatmapEnv } from "./index.ts";

const env = new AirlineSeatmapEnv();
const { baseUrl, journalMode } = await env.boot();
const seeded = await env.seed(42);
console.log(`Gauntlet ${env.id} booted (SQLite journal_mode=${journalMode})`);
console.log(`URL:    ${seeded.startUrl}`);
console.log(`Prompt: ${seeded.taskPrompt}`);
console.log("Press Ctrl+C to stop.");
