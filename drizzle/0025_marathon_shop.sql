CREATE TABLE `marathon_shop_inventory` (
	`player_id` text PRIMARY KEY NOT NULL,
	`mini_kobayashi_count` integer DEFAULT 0 NOT NULL,
	`steal_guard_charges` integer DEFAULT 0 NOT NULL,
	`steal_counter_charges` integer DEFAULT 0 NOT NULL,
	`steal_glove_count` integer DEFAULT 0 NOT NULL,
	`japan_date` text NOT NULL,
	`guard_purchases` integer DEFAULT 0 NOT NULL,
	`counter_purchases` integer DEFAULT 0 NOT NULL,
	`trap_purchases` integer DEFAULT 0 NOT NULL,
	`last_purchase_request_id` text,
	`last_purchase_result_json` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "marathon_shop_inventory_counts_check" CHECK("marathon_shop_inventory"."mini_kobayashi_count" >= 0 AND "marathon_shop_inventory"."steal_guard_charges" >= 0 AND "marathon_shop_inventory"."steal_counter_charges" >= 0 AND "marathon_shop_inventory"."steal_glove_count" >= 0),
	CONSTRAINT "marathon_shop_inventory_daily_check" CHECK("marathon_shop_inventory"."guard_purchases" BETWEEN 0 AND 2 AND "marathon_shop_inventory"."counter_purchases" BETWEEN 0 AND 1 AND "marathon_shop_inventory"."trap_purchases" BETWEEN 0 AND 2)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_marathon_giver_limits` (
	`player_id` text PRIMARY KEY NOT NULL,
	`japan_date` text NOT NULL,
	`water_count` integer DEFAULT 0 NOT NULL,
	`steal_count` integer DEFAULT 0 NOT NULL,
	`last_steal_request_id` text,
	`last_steal_result_json` text,
	`pending_steal_count` integer DEFAULT 0 NOT NULL,
	`pending_steal_ml` integer DEFAULT 0 NOT NULL,
	`pending_steal_last_giver_name` text,
	`pending_steal_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "marathon_giver_limits_count_check" CHECK("__new_marathon_giver_limits"."water_count" BETWEEN 0 AND 10),
	CONSTRAINT "marathon_giver_limits_steal_count_check" CHECK("__new_marathon_giver_limits"."steal_count" >= 0),
	CONSTRAINT "marathon_giver_limits_pending_check" CHECK("__new_marathon_giver_limits"."pending_steal_count" >= 0 AND "__new_marathon_giver_limits"."pending_steal_ml" >= 0 AND "__new_marathon_giver_limits"."pending_steal_version" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_marathon_giver_limits`("player_id", "japan_date", "water_count", "steal_count", "last_steal_request_id", "last_steal_result_json", "pending_steal_count", "pending_steal_ml", "pending_steal_last_giver_name", "pending_steal_version") SELECT "player_id", "japan_date", "water_count", "steal_count", "last_steal_request_id", "last_steal_result_json", "pending_steal_count", "pending_steal_ml", "pending_steal_last_giver_name", "pending_steal_version" FROM `marathon_giver_limits`;--> statement-breakpoint
DROP TABLE `marathon_giver_limits`;--> statement-breakpoint
ALTER TABLE `__new_marathon_giver_limits` RENAME TO `marathon_giver_limits`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `marathon_state` ADD COLUMN `pending_trap_count` integer DEFAULT 0 NOT NULL CHECK (`pending_trap_count` >= 0);
