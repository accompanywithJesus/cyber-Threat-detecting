import assert from "node:assert/strict";
import test from "node:test";
import { callWorker, deadOutbound, makeEnv, rssOutbound } from "./helpers/worker.mjs";

const json = async (response) => {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/i);
  return response.json();
};

test("/api/news returns the shape the globe client consumes", async () => {
  const env = await makeEnv();
  const body = await json(await callWorker("/api/news", { env, outbound: rssOutbound() }));

  assert.ok(Array.isArray(body.items), "items must be an array");
  assert.ok(body.items.length > 0, "stubbed feeds should yield articles");
  assert.equal(body.degraded, false, "live collection succeeded, so not degraded");
  assert.ok(Number.isFinite(Date.parse(body.updatedAt)), "updatedAt must parse");
  assert.equal(body.refreshSeconds, 180);

  // Every field ThreatGlobe and the detail panel read must be present and typed.
  for (const item of body.items) {
    for (const key of ["id", "title", "description", "link", "source", "publishedAt", "country", "countryLabel", "region", "originCountry", "severity", "category"]) {
      assert.equal(typeof item[key], "string", `${key} must be a string`);
    }
    for (const key of ["lat", "lng", "originLat", "originLng", "geoConfidence"]) {
      assert.ok(Number.isFinite(item[key]), `${key} must be a finite number`);
    }
    assert.ok(["critical", "high", "medium", "low"].includes(item.severity), `unexpected severity ${item.severity}`);
    assert.ok(Array.isArray(item.mitreGroups), "mitreGroups must be an array");
    assert.ok(Number.isFinite(Date.parse(item.publishedAt)), "publishedAt must parse");
  }

  // Links are deduplicated across sources.
  const links = body.items.map((i) => i.link);
  assert.equal(new Set(links).size, links.length, "links must be unique");
});

test("/api/news reports per-source collection status", async () => {
  const env = await makeEnv();
  const body = await json(await callWorker("/api/news", { env, outbound: rssOutbound() }));

  assert.equal(body.sources.length, 3, "three configured feeds");
  for (const status of body.sources) {
    assert.equal(typeof status.source, "string");
    assert.equal(status.ok, true);
    assert.ok(Number.isInteger(status.count) && status.count > 0);
  }
  assert.deepEqual(
    body.sources.map((s) => s.source).sort(),
    ["SecurityWeek", "The Hacker News", "보안뉴스"].sort()
  );
});

test("/api/news enriches articles with severity, geography and ATT&CK matches", async () => {
  const env = await makeEnv();
  const body = await json(await callWorker("/api/news", { env, outbound: rssOutbound() }));

  const ransomware = body.items.find((i) => i.title.includes("Ransomware campaign"));
  assert.ok(ransomware, "ransomware article should be present");
  assert.equal(ransomware.severity, "critical");
  assert.equal(ransomware.category, "Ransomware");
  assert.equal(ransomware.country, "South Korea", "first location hit becomes the target");
  assert.equal(ransomware.originCountry, "북한", "second location hit becomes the origin");

  const apt = body.items.find((i) => i.title.includes("APT41"));
  assert.ok(apt, "APT41 article should be present");
  assert.ok(apt.mitreGroups.length > 0, "APT41 alias must match a MITRE group");
  assert.ok(apt.mitreGroups.some((g) => g.id === "G0096"), "APT41 is G0096");
  for (const group of apt.mitreGroups) {
    assert.match(group.mitreUrl, /^https:\/\/attack\.mitre\.org\/groups\//);
  }
});

test("/api/news persists collected articles to D1", async () => {
  const env = await makeEnv();
  const body = await json(await callWorker("/api/news", { env, outbound: rssOutbound() }));

  const rows = env.DB._query("select link from articles");
  assert.equal(rows.length, body.items.length, "every returned article is stored");
});

test("/api/news upserts on link instead of duplicating", async () => {
  const env = await makeEnv();
  await callWorker("/api/news", { env, outbound: rssOutbound() });
  const afterFirst = env.DB._query("select count(*) as n from articles")[0].n;

  await callWorker("/api/news", { env, outbound: rssOutbound() });
  const afterSecond = env.DB._query("select count(*) as n from articles")[0].n;

  assert.equal(afterSecond, afterFirst, "re-collection must not create duplicate rows");
});

test("/api/news falls back to stored articles when every feed fails", async () => {
  const env = await makeEnv();

  // Seed the archive with one successful collection.
  const seeded = await json(await callWorker("/api/news", { env, outbound: rssOutbound() }));
  assert.ok(seeded.items.length > 0);

  // Now every outbound request fails, as it does under blocked egress.
  const dead = deadOutbound();
  const body = await json(await callWorker("/api/news", { env, outbound: dead }));

  assert.ok(dead.callCount() > 0, "the route should still attempt live collection");
  assert.equal(body.degraded, true, "degraded flag tells the client it is showing the archive");
  assert.ok(body.items.length > 0, "the map must not go empty when feeds die");
  assert.deepEqual(
    body.items.map((i) => i.link).sort(),
    seeded.items.map((i) => i.link).sort(),
    "fallback serves exactly what was archived"
  );
  for (const status of body.sources) {
    assert.equal(status.ok, false);
    assert.equal(typeof status.error, "string");
  }

  // Globe-critical fields must survive the round trip through D1.
  for (const item of body.items) {
    assert.ok(Number.isFinite(item.lat) && Number.isFinite(item.lng));
    assert.ok(Number.isFinite(item.originLat) && Number.isFinite(item.originLng));
    assert.equal(typeof item.countryLabel, "string");
    assert.ok(Array.isArray(item.mitreGroups), "JSON column must deserialize back to an array");
  }
});

test("/api/news degrades to an empty archive rather than failing", async () => {
  // No prior collection, so D1 is empty and the feeds are dead too.
  const env = await makeEnv();
  const body = await json(await callWorker("/api/news", { env, outbound: deadOutbound() }));

  assert.equal(body.degraded, true);
  assert.deepEqual(body.items, [], "nothing archived yet, but the route still answers 200");
});

test("/api/history returns stored articles newest first", async () => {
  const env = await makeEnv();
  await callWorker("/api/news", { env, outbound: rssOutbound() });

  const body = await json(await callWorker("/api/history?days=3650", { env }));

  assert.equal(body.ok, true);
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length > 0, "previously collected articles are queryable");
  assert.equal(body.count, body.items.length);
  assert.equal(body.days, 3650);
  assert.equal(body.country, null);
  assert.ok(Number.isFinite(Date.parse(body.since)));

  const times = body.items.map((i) => Date.parse(i.publishedAt ?? i.ingestedAt));
  const sorted = [...times].sort((a, b) => b - a);
  assert.deepEqual(times, sorted, "results must be ordered newest first");
});

test("/api/history clamps the day window", async () => {
  const env = await makeEnv();

  assert.equal((await json(await callWorker("/api/history", { env }))).days, 30, "defaults to 30 days");
  assert.equal((await json(await callWorker("/api/history?days=99999", { env }))).days, 3650, "clamped to 10 years");
  assert.equal((await json(await callWorker("/api/history?days=-5", { env }))).days, 30, "negative falls back to default");
  assert.equal((await json(await callWorker("/api/history?days=abc", { env }))).days, 30, "non-numeric falls back to default");
});

test("/api/history filters by country", async () => {
  const env = await makeEnv();
  await callWorker("/api/news", { env, outbound: rssOutbound() });

  const body = await json(await callWorker("/api/history?days=3650&country=South%20Korea", { env }));

  assert.equal(body.ok, true);
  assert.equal(body.country, "South Korea");
  assert.ok(body.items.length > 0, "the seeded ransomware article maps to South Korea");
  for (const item of body.items) assert.equal(item.country, "South Korea");
});

test("/api/history rejects a malformed country without querying", async () => {
  const env = await makeEnv();
  const body = await json(await callWorker("/api/history?country=%3Cscript%3E", { env }));

  assert.equal(body.ok, false);
  assert.equal(body.error, "invalid country");
  assert.deepEqual(body.items, []);
  assert.equal(body.country, null);
});

test("/api/history soft-fails with 200 when the database is unavailable", async () => {
  // No DB binding at all — getDb() throws inside the route.
  const env = await makeEnv({ withDb: false });
  const response = await callWorker("/api/history", { env });

  assert.equal(response.status, 200, "a missing database must not surface as a 5xx");
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.deepEqual(body.items, []);
  assert.equal(body.count, 0);
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0, "the failure reason is reported to the caller");
});

test("/api/news survives a missing database binding", async () => {
  const env = await makeEnv({ withDb: false });
  const body = await json(await callWorker("/api/news", { env, outbound: rssOutbound() }));

  assert.ok(body.items.length > 0, "live results are returned even when persistence fails");
  assert.equal(body.degraded, false);
});
