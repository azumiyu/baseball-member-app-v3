CREATE TABLE `marathon_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`last_watered_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`total_water_ml` integer DEFAULT 0 NOT NULL,
	`last_giver_name` text,
	`write_token` text DEFAULT '' NOT NULL,
	CONSTRAINT "marathon_state_singleton_check" CHECK("marathon_state"."id" = 1),
	CONSTRAINT "marathon_state_revision_check" CHECK("marathon_state"."revision" >= 0),
	CONSTRAINT "marathon_state_total_check" CHECK("marathon_state"."total_water_ml" >= 0)
);
--> statement-breakpoint
-- All visitors share one runner. Applying this migration starts the marathon;
-- the initial five minutes of thirst allow the first visitor to give water.
INSERT INTO `marathon_state` (`id`,`started_at`,`last_watered_at`)
SELECT 1,started_at,started_at-300000
FROM (SELECT CAST(strftime('%s','now') AS INTEGER)*1000 AS started_at);
