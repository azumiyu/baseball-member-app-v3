PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_marathon_shop_inventory` (
	`player_id` text PRIMARY KEY NOT NULL,
	`mini_kobayashi_count` integer DEFAULT 0 NOT NULL,
	`steal_guard_charges` integer DEFAULT 0 NOT NULL,
	`steal_counter_charges` integer DEFAULT 0 NOT NULL,
	`steal_glove_count` integer DEFAULT 0 NOT NULL,
	`pending_trap_count` integer DEFAULT 0 NOT NULL,
	`reservoir_owned` integer DEFAULT 0 NOT NULL,
	`reservoir_ml` integer DEFAULT 0 NOT NULL,
	`reservoir_growth_japan_date` text DEFAULT '1970-01-01' NOT NULL,
	`reservoir_last_deposit_at` integer,
	`reservoir_god_count` integer DEFAULT 0 NOT NULL,
	`alcohol_count` integer DEFAULT 0 NOT NULL,
	`alcohol_purchases` integer DEFAULT 0 NOT NULL,
	`japan_date` text NOT NULL,
	`guard_purchases` integer DEFAULT 0 NOT NULL,
	`counter_purchases` integer DEFAULT 0 NOT NULL,
	`trap_purchases` integer DEFAULT 0 NOT NULL,
	`last_purchase_request_id` text,
	`last_purchase_result_json` text,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "marathon_shop_inventory_counts_check" CHECK("__new_marathon_shop_inventory"."mini_kobayashi_count" >= 0 AND "__new_marathon_shop_inventory"."steal_guard_charges" >= 0 AND "__new_marathon_shop_inventory"."steal_counter_charges" >= 0 AND "__new_marathon_shop_inventory"."steal_glove_count" >= 0 AND "__new_marathon_shop_inventory"."pending_trap_count" >= 0 AND "__new_marathon_shop_inventory"."reservoir_owned" BETWEEN 0 AND 1 AND "__new_marathon_shop_inventory"."reservoir_ml" >= 0 AND "__new_marathon_shop_inventory"."reservoir_god_count" >= 0 AND "__new_marathon_shop_inventory"."alcohol_count" >= 0),
	CONSTRAINT "marathon_shop_inventory_daily_check" CHECK("__new_marathon_shop_inventory"."guard_purchases" BETWEEN 0 AND 2 AND "__new_marathon_shop_inventory"."counter_purchases" BETWEEN 0 AND 1 AND "__new_marathon_shop_inventory"."trap_purchases" BETWEEN 0 AND 2 AND "__new_marathon_shop_inventory"."alcohol_purchases" BETWEEN 0 AND 3)
);
--> statement-breakpoint
INSERT INTO `__new_marathon_shop_inventory`("player_id", "mini_kobayashi_count", "steal_guard_charges", "steal_counter_charges", "steal_glove_count", "pending_trap_count", "reservoir_owned", "reservoir_ml", "reservoir_growth_japan_date", "reservoir_last_deposit_at", "reservoir_god_count", "alcohol_count", "alcohol_purchases", "japan_date", "guard_purchases", "counter_purchases", "trap_purchases", "last_purchase_request_id", "last_purchase_result_json") SELECT "player_id", "mini_kobayashi_count", "steal_guard_charges", "steal_counter_charges", "steal_glove_count", "pending_trap_count", "reservoir_owned", "reservoir_ml", "reservoir_growth_japan_date", "reservoir_last_deposit_at", "reservoir_god_count", 0, 0, "japan_date", "guard_purchases", "counter_purchases", "trap_purchases", "last_purchase_request_id", "last_purchase_result_json" FROM `marathon_shop_inventory`;--> statement-breakpoint
DROP TABLE `marathon_shop_inventory`;--> statement-breakpoint
ALTER TABLE `__new_marathon_shop_inventory` RENAME TO `marathon_shop_inventory`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_marathon_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`last_watered_at` integer NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`total_water_ml` integer DEFAULT 0 NOT NULL,
	`last_giver_name` text,
	`write_token` text DEFAULT '' NOT NULL,
	`exclusive_player_id` text,
	`exclusive_until` integer DEFAULT 0 NOT NULL,
	`pending_trap_count` integer DEFAULT 0 NOT NULL,
	`drunk_effect` text,
	`drunk_started_at` integer,
	`drunk_until` integer DEFAULT 0 NOT NULL,
	`drunk_rampage_goal_ml` integer DEFAULT 0 NOT NULL,
	`drunk_rampage_awarded_ml` integer DEFAULT 0 NOT NULL,
	`drunk_rampage_player_ids` text DEFAULT '[]' NOT NULL,
	`distance_paused_ms` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "marathon_state_singleton_check" CHECK("__new_marathon_state"."id" = 1),
	CONSTRAINT "marathon_state_revision_check" CHECK("__new_marathon_state"."revision" >= 0),
	CONSTRAINT "marathon_state_total_check" CHECK("__new_marathon_state"."total_water_ml" >= 0),
	CONSTRAINT "marathon_state_pending_trap_check" CHECK("__new_marathon_state"."pending_trap_count" >= 0),
	CONSTRAINT "marathon_state_drunk_effect_check" CHECK("__new_marathon_state"."drunk_effect" IS NULL OR "__new_marathon_state"."drunk_effect" IN ('super-dehydrated', 'rampage', 'stopped', 'generous')),
	CONSTRAINT "marathon_state_drunk_rampage_check" CHECK("__new_marathon_state"."drunk_rampage_goal_ml" >= 0 AND "__new_marathon_state"."drunk_rampage_awarded_ml" BETWEEN 0 AND "__new_marathon_state"."drunk_rampage_goal_ml" AND "__new_marathon_state"."distance_paused_ms" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_marathon_state`("id", "started_at", "last_watered_at", "revision", "total_water_ml", "last_giver_name", "write_token", "exclusive_player_id", "exclusive_until", "pending_trap_count", "drunk_effect", "drunk_started_at", "drunk_until", "drunk_rampage_goal_ml", "drunk_rampage_awarded_ml", "drunk_rampage_player_ids", "distance_paused_ms") SELECT "id", "started_at", "last_watered_at", "revision", "total_water_ml", "last_giver_name", "write_token", "exclusive_player_id", "exclusive_until", "pending_trap_count", NULL, NULL, 0, 0, 0, '[]', 0 FROM `marathon_state`;--> statement-breakpoint
DROP TABLE `marathon_state`;--> statement-breakpoint
ALTER TABLE `__new_marathon_state` RENAME TO `marathon_state`;