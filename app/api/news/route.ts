import { XMLParser } from "fast-xml-parser";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, sourceStatus } from "@/db/schema";
import mitreData from "../../data/mitre-groups.json";

export const dynamic = "force-dynamic";

type SourceName = "The Hacker News" | "SecurityWeek" | "보안뉴스";
type FeedItem = Record<string, unknown>;
type Severity = "critical" | "high" | "medium" | "low";
type MitreMatch = { id: string; key: string; mitreName: string; aliases: string[]; mitreUrl: string; version: string };
type CollectedItem = {
  id: string; title: string; description: string; link: string; source: SourceName; publishedAt: string;
  country: string; countryLabel: string; region: string; lat: number; lng: number;
  originCountry: string; originLat: number; originLng: number; geoConfidence: number;
  severity: Severity; category: string; mitreGroups: MitreMatch[];
};
type SourceReport = { source: SourceName; ok: boolean; count: number; error?: string };

const SOURCES: { name: SourceName; urls: string[]; home: string; base: [number, number] }[] = [
  { name: "The Hacker News", urls: ["https://feeds.feedburner.com/TheHackersNews"], home: "https://thehackernews.com/", base: [20.59, 78.96] },
  { name: "SecurityWeek", urls: ["https://feeds.feedburner.com/securityweek", "https://www.securityweek.com/feed/"], home: "https://www.securityweek.com/", base: [38.9, -77.04] },
  { name: "보안뉴스", urls: ["https://www.boannews.com/media/news_rss.xml"], home: "https://www.boannews.com/", base: [37.57, 126.98] },
];

const LOCATIONS = [
  { country: "South Korea", label: "대한민국", region: "동아시아", lat: 36.5, lng: 127.8, aliases: ["south korea", "korea", "korean", "한국", "대한민국", "국내"] },
  { country: "North Korea", label: "북한", region: "동아시아", lat: 40.3, lng: 127.5, aliases: ["north korea", "north korean", "dprk", "북한"] },
  { country: "China", label: "중국", region: "동아시아", lat: 35.9, lng: 104.2, aliases: ["china", "chinese", "prc", "중국"] },
  { country: "Japan", label: "일본", region: "동아시아", lat: 36.2, lng: 138.3, aliases: ["japan", "japanese", "일본"] },
  { country: "United States of America", label: "미국", region: "북미", lat: 38.0, lng: -97.0, aliases: ["united states", "u.s.", " us ", "american", "미국"] },
  { country: "Russia", label: "러시아", region: "유럽", lat: 61.5, lng: 105.3, aliases: ["russia", "russian", "러시아"] },
  { country: "Ukraine", label: "우크라이나", region: "유럽", lat: 48.4, lng: 31.2, aliases: ["ukraine", "ukrainian", "우크라이나"] },
  { country: "United Kingdom", label: "영국", region: "유럽", lat: 55.4, lng: -3.4, aliases: ["united kingdom", "british", " uk ", "영국"] },
  { country: "Germany", label: "독일", region: "유럽", lat: 51.2, lng: 10.4, aliases: ["germany", "german", "독일"] },
  { country: "France", label: "프랑스", region: "유럽", lat: 46.2, lng: 2.2, aliases: ["france", "french", "프랑스"] },
  { country: "Israel", label: "이스라엘", region: "중동", lat: 31.0, lng: 34.9, aliases: ["israel", "israeli", "이스라엘"] },
  { country: "Iran", label: "이란", region: "중동", lat: 32.4, lng: 53.7, aliases: ["iran", "iranian", "이란"] },
  { country: "India", label: "인도", region: "남아시아", lat: 20.6, lng: 78.9, aliases: ["india", "indian", "인도"] },
  { country: "Australia", label: "호주", region: "오세아니아", lat: -25.3, lng: 133.8, aliases: ["australia", "australian", "호주"] },
  { country: "Canada", label: "캐나다", region: "북미", lat: 56.1, lng: -106.3, aliases: ["canada", "canadian", "캐나다"] },
  { country: "Brazil", label: "브라질", region: "남미", lat: -14.2, lng: -51.9, aliases: ["brazil", "brazilian", "브라질"] },
];

const parser = new XMLParser({ ignoreAttributes: false, processEntities: true, trimValues: true });

function asArray<T>(value: T | T[] | undefined): T[] { return value == null ? [] : Array.isArray(value) ? value : [value]; }
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return text(record["#text"] ?? record["__cdata"] ?? record["@_href"] ?? "");
  }
  return "";
}
function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function hash(input: string) { let h = 2166136261; for (let i=0;i<input.length;i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619); return (h >>> 0).toString(36); }
function inferSeverity(content: string): "critical" | "high" | "medium" | "low" {
  if (/critical|zero[- ]day|actively exploited|ransomware|breach|공격|해킹|침해|랜섬웨어|제로데이/i.test(content)) return "critical";
  if (/vulnerab|malware|apt|exploit|botnet|취약점|악성코드|탈취|유출/i.test(content)) return "high";
  if (/patch|phishing|fraud|security|보안|피싱|위협/i.test(content)) return "medium";
  return "low";
}
function inferCategory(content: string) {
  const rules = [[/ransom|랜섬/i,"Ransomware"],[/vulnerab|cve-|zero[- ]day|취약점/i,"Vulnerability"],[/apt|nation.state|espionage|북한|중국|러시아/i,"Nation-state"],[/cloud|azure|aws|google cloud/i,"Cloud"],[/supply chain|공급망/i,"Supply chain"],[/malware|trojan|backdoor|악성코드/i,"Malware"],[/data breach|leak|유출|침해/i,"Data breach"]] as const;
  return rules.find(([rule])=>rule.test(content))?.[1] ?? "Cybersecurity";
}
function matchMitreGroups(content: string) {
  const normalized = ` ${content.toLowerCase().replace(/[^a-z0-9가-힣]+/g," ")} `;
  return mitreData.groups.filter(group => group.aliases.some(alias => {
    const needle = alias.toLowerCase().replace(/[^a-z0-9가-힣]+/g," ").trim();
    return needle.length >= 4 && normalized.includes(` ${needle} `);
  })).map(group=>({id:group.id,key:group.key,mitreName:group.mitreName,aliases:group.aliases,mitreUrl:group.mitreUrl,version:group.version}));
}
function inferLocation(content: string, base: [number, number]) {
  const normalized = ` ${content.toLowerCase()} `;
  const hits = LOCATIONS.filter(location => location.aliases.some(alias => normalized.includes(alias)));
  const target = hits[0];
  const origin = hits[1];
  return {
    country: target?.country ?? "Global",
    countryLabel: target?.label ?? "글로벌",
    region: target?.region ?? "글로벌",
    lat: target?.lat ?? base[0],
    lng: target?.lng ?? base[1],
    originCountry: origin?.label ?? "OSINT 소스",
    originLat: origin?.lat ?? base[0],
    originLng: origin?.lng ?? base[1],
    geoConfidence: target ? (origin ? 82 : 68) : 38,
  };
}

async function fetchSource(source: typeof SOURCES[number]) {
  let lastError = "feed unavailable";
  for (const url of source.urls) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "CyberAtlas/1.0 (+OSINT RSS reader)", Accept: "application/rss+xml, application/atom+xml, text/xml" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      const parsed = parser.parse(xml) as Record<string, unknown>;
      const rss = parsed.rss as Record<string, unknown> | undefined;
      const channel = rss?.channel as Record<string, unknown> | undefined;
      const atom = parsed.feed as Record<string, unknown> | undefined;
      const rawItems = asArray((channel?.item ?? atom?.entry) as FeedItem | FeedItem[] | undefined);
      const items = rawItems.slice(0, 18).map((item) => {
        const title = stripHtml(text(item.title));
        const description = stripHtml(text(item.description ?? item.summary ?? item["content:encoded"])).slice(0, 420);
        const link = text(item.link) || text(item.guid);
        const publishedAt = text(item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]);
        const combined = `${title} ${description}`;
        return { id: hash(`${source.name}:${link || title}`), title, description, link: link || source.home, source: source.name, publishedAt: new Date(publishedAt || Date.now()).toISOString(), ...inferLocation(combined, source.base), severity: inferSeverity(combined), category: inferCategory(combined), mitreGroups:matchMitreGroups(combined) };
      }).filter(item => item.title && item.link);
      return { source: source.name, ok: true, count: items.length, items };
    } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
  }
  return { source: source.name, ok: false, count: 0, error: lastError, items: [] };
}

async function persist(items: CollectedItem[], statuses: SourceReport[]) {
  try {
    const db = getDb();
    if (items.length) {
      // One upsert statement per article (not one multi-row VALUES insert) — D1 caps
      // bound parameters per statement, and a 42-row x 17-column batch exceeds it.
      const upserts = items.map((item) =>
        db.insert(articles).values({
          link: item.link,
          title: item.title,
          description: item.description,
          source: item.source,
          publishedAt: item.publishedAt,
          severity: item.severity,
          category: item.category,
          country: item.country,
          countryLabel: item.countryLabel,
          region: item.region,
          lat: item.lat,
          lng: item.lng,
          originCountry: item.originCountry,
          originLat: item.originLat,
          originLng: item.originLng,
          geoConfidence: item.geoConfidence,
          mitreGroups: item.mitreGroups,
        }).onConflictDoUpdate({
          target: articles.link,
          set: {
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            source: sql`excluded.source`,
            publishedAt: sql`excluded.published_at`,
            severity: sql`excluded.severity`,
            category: sql`excluded.category`,
            country: sql`excluded.country`,
            countryLabel: sql`excluded.country_label`,
            region: sql`excluded.region`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            originCountry: sql`excluded.origin_country`,
            originLat: sql`excluded.origin_lat`,
            originLng: sql`excluded.origin_lng`,
            geoConfidence: sql`excluded.geo_confidence`,
            mitreGroups: sql`excluded.mitre_groups`,
          },
        })
      );
      const [first, ...rest] = upserts;
      await db.batch([first, ...rest]);
    }
    if (statuses.length) {
      const checkedAt = new Date().toISOString();
      await db.insert(sourceStatus).values(statuses.map((status) => ({
        source: status.source,
        ok: status.ok,
        count: status.count,
        error: status.error ?? null,
        checkedAt,
      }))).onConflictDoUpdate({
        target: sourceStatus.source,
        set: {
          ok: sql`excluded.ok`,
          count: sql`excluded.count`,
          error: sql`excluded.error`,
          checkedAt: sql`excluded.checked_at`,
        },
      });
    }
  } catch {
    // D1 unavailable or not migrated yet — live response must still succeed.
  }
}

async function loadFallbackFromDb(): Promise<CollectedItem[]> {
  try {
    const db = getDb();
    const rows = await db.select().from(articles).orderBy(desc(articles.publishedAt)).limit(42);
    return rows.map((row) => ({
      id: hash(`${row.source}:${row.link}`),
      title: row.title,
      description: row.description,
      link: row.link,
      source: row.source as SourceName,
      publishedAt: row.publishedAt ?? row.ingestedAt,
      country: row.country,
      countryLabel: row.countryLabel,
      region: row.region,
      lat: row.lat,
      lng: row.lng,
      originCountry: row.originCountry,
      originLat: row.originLat,
      originLng: row.originLng,
      geoConfidence: row.geoConfidence,
      severity: row.severity as Severity,
      category: row.category,
      mitreGroups: row.mitreGroups,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const seen = new Set<string>();
  const liveItems = results.flatMap(result => result.items).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).filter(item=>{const key=item.link.replace(/\?.*$/,"").replace(/\/$/,"");if(seen.has(key))return false;seen.add(key);return true}).slice(0, 42);
  const statuses: SourceReport[] = results.map((result) => ({ source: result.source, ok: result.ok, count: result.count, error: result.error }));

  await persist(liveItems, statuses);

  const degraded = liveItems.length === 0;
  const items = degraded ? await loadFallbackFromDb() : liveItems;

  return Response.json({ items, sources: statuses, updatedAt: new Date().toISOString(), refreshSeconds: 180, degraded }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=180, stale-while-revalidate=600", "Access-Control-Allow-Origin": "*" } });
}
