ALTER TABLE `marathon_state` ADD COLUMN `exclusive_player_id` text;
--> statement-breakpoint
ALTER TABLE `marathon_state` ADD COLUMN `exclusive_until` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `marathon_giver_limits` (
	`player_id` text PRIMARY KEY NOT NULL,
	`japan_date` text NOT NULL,
	`water_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "marathon_giver_limits_count_check" CHECK("marathon_giver_limits"."water_count" BETWEEN 0 AND 10)
);
