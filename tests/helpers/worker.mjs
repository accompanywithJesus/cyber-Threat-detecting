// Loads the built Worker and drives it the way the Cloudflare runtime does,
// with outbound fetch stubbed so feed behaviour is deterministic.
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { createD1 } from "./d1.mjs";

const workerUrl = new URL("../../dist/server/index.js", import.meta.url);
const migrationUrl = new URL("../../drizzle/0000_ordinary_the_spike.sql", import.meta.url);

// `db/index.ts` reads the ambient binding via `import { env } from "cloudflare:workers"`,
// a specifier only workerd provides. Resolve it to a stub exporting the same object
// we hand to `worker.fetch`, which is how the real runtime behaves.
const ambientEnv = {};
const STUB_URL = "cloudflare-workers-stub:env";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") return { url: STUB_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === STUB_URL) {
      return {
        format: "module",
        shortCircuit: true,
        source: "export const env = globalThis.__CYBER_ATLAS_TEST_ENV__;",
      };
    }
    return nextLoad(url, context);
  },
});

globalThis.__CYBER_ATLAS_TEST_ENV__ = ambientEnv;

let workerPromise;
function loadWorker() {
  workerPromise ??= import(workerUrl.href).then((m) => m.default);
  return workerPromise;
}

export async function readMigration() {
  const sql = await readFile(migrationUrl, "utf8");
  return sql.split("--> statement-breakpoint").join("\n");
}

export async function makeEnv({ withDb = true } = {}) {
  return {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    DB: withDb ? createD1(await readMigration()) : undefined,
  };
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

/**
 * Calls the worker with `globalThis.fetch` replaced for the duration of the
 * request. The supplied env is projected onto the shared ambient object so the
 * `cloudflare:workers` import and the fetch parameter agree, as they do in workerd.
 */
export async function callWorker(path, { env, outbound }) {
  const worker = await loadWorker();
  const original = globalThis.fetch;

  for (const key of Object.keys(ambientEnv)) delete ambientEnv[key];
  Object.assign(ambientEnv, env);

  if (outbound) globalThis.fetch = outbound;
  try {
    const request = new Request(`https://cyber-atlas.test${path}`, { headers: { accept: "application/json" } });
    return await worker.fetch(request, ambientEnv, ctx);
  } finally {
    globalThis.fetch = original;
  }
}

/** Outbound stub that serves a distinct RSS document per requested feed. */
export function rssOutbound() {
  let calls = 0;
  const stub = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    calls += 1;
    const key = url.includes("boannews") ? "kr" : url.includes("securityweek") ? "sw" : "thn";
    return new Response(feedXml(key), { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  stub.callCount = () => calls;
  return stub;
}

/** Outbound stub where every feed request fails, as under blocked egress. */
export function deadOutbound() {
  let calls = 0;
  const stub = async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  };
  stub.callCount = () => calls;
  return stub;
}

function feedXml(key) {
  const items = [
    {
      title: `Ransomware campaign disrupts South Korea hospitals (${key})`,
      description: "Attackers linked to North Korea deployed ransomware against hospital networks.",
      link: `https://example.test/${key}/ransomware-korea`,
      pubDate: "Wed, 12 Aug 2026 10:00:00 GMT",
    },
    {
      title: `APT41 exploits new zero-day in enterprise software (${key})`,
      description: "The China-based group APT41 was observed actively exploiting the flaw.",
      link: `https://example.test/${key}/apt41-zero-day`,
      pubDate: "Wed, 12 Aug 2026 09:00:00 GMT",
    },
    {
      title: `Security vendors publish patch guidance (${key})`,
      description: "Routine patch advisory with no attribution.",
      link: `https://example.test/${key}/patch-guidance`,
      pubDate: "Wed, 12 Aug 2026 08:00:00 GMT",
    },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test feed ${key}</title>
${items
  .map(
    (i) =>
      `<item><title>${i.title}</title><description>${i.description}</description><link>${i.link}</link><pubDate>${i.pubDate}</pubDate></item>`
  )
  .join("\n")}
</channel></rss>`;
}
