import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { articles } from "@/db/schema";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 3650;
const RESULT_LIMIT = 200;

function clampDays(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
  return Math.min(Math.round(parsed), MAX_DAYS);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = clampDays(searchParams.get("days"));
  const country = (searchParams.get("country") || "").trim();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  if (country && !/^[\p{L} .'-]{2,80}$/u.test(country)) {
    return Response.json({ items: [], count: 0, days, country: null, since, ok: false, error: "invalid country" });
  }

  try {
    const db = getDb();
    const recency = sql`coalesce(${articles.publishedAt}, ${articles.ingestedAt})`;
    const whereClause = country
      ? sql`${recency} >= ${since} and ${articles.country} = ${country}`
      : sql`${recency} >= ${since}`;
    const rows = await db.select().from(articles).where(whereClause).orderBy(sql`${recency} desc`).limit(RESULT_LIMIT);
    return Response.json(
      { items: rows, count: rows.length, days, country: country || null, since, ok: true, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300" } }
    );
  } catch (error) {
    return Response.json({ items: [], count: 0, days, country: country || null, since, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
