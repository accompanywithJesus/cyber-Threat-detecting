import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type ArticleMitreMatch = {
  id: string;
  key: string;
  mitreName: string;
  aliases: string[];
  mitreUrl: string;
  version: string;
};

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    link: text("link").notNull().unique(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    source: text("source").notNull(),
    publishedAt: text("published_at"),
    severity: text("severity").notNull(),
    category: text("category").notNull(),
    country: text("country").notNull(),
    countryLabel: text("country_label").notNull(),
    region: text("region").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    originCountry: text("origin_country").notNull(),
    originLat: real("origin_lat").notNull(),
    originLng: real("origin_lng").notNull(),
    geoConfidence: integer("geo_confidence").notNull(),
    mitreGroups: text("mitre_groups", { mode: "json" })
      .$type<ArticleMitreMatch[]>()
      .notNull(),
    ingestedAt: text("ingested_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("articles_published_at_idx").on(table.publishedAt),
    index("articles_country_idx").on(table.country),
  ]
);

export const sourceStatus = sqliteTable("source_status", {
  source: text("source").primaryKey(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  count: integer("count").notNull(),
  error: text("error"),
  checkedAt: text("checked_at").notNull(),
});
