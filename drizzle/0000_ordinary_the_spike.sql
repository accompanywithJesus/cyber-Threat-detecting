CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`link` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`published_at` text,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`country` text NOT NULL,
	`country_label` text NOT NULL,
	`region` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`origin_country` text NOT NULL,
	`origin_lat` real NOT NULL,
	`origin_lng` real NOT NULL,
	`geo_confidence` integer NOT NULL,
	`mitre_groups` text NOT NULL,
	`ingested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_link_unique` ON `articles` (`link`);--> statement-breakpoint
CREATE INDEX `articles_published_at_idx` ON `articles` (`published_at`);--> statement-breakpoint
CREATE INDEX `articles_country_idx` ON `articles` (`country`);--> statement-breakpoint
CREATE TABLE `source_status` (
	`source` text PRIMARY KEY NOT NULL,
	`ok` integer NOT NULL,
	`count` integer NOT NULL,
	`error` text,
	`checked_at` text NOT NULL
);
