ALTER TABLE `marathon_giver_limits` ADD COLUMN `steal_count` integer DEFAULT 0 NOT NULL CONSTRAINT `marathon_giver_limits_steal_count_check` CHECK (`steal_count` BETWEEN 0 AND 2);
--> statement-breakpoint
ALTER TABLE `marathon_giver_limits` ADD COLUMN `last_steal_request_id` text;
--> statement-breakpoint
ALTER TABLE `marathon_giver_limits` ADD COLUMN `last_steal_result_json` text;
--> statement-breakpoint
ALTER TABLE `marathon_giver_limits` ADD COLUMN `pending_steal_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `marathon_giver_limits` ADD COLUMN `pending_steal_ml` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `marathon_giver_limits` ADD COLUMN `pending_steal_last_giver_name` text;
--> statement-breakpoint
ALTER TABLE `marathon_giver_limits` ADD COLUMN `pending_steal_version` integer DEFAULT 0 NOT NULL CONSTRAINT `marathon_giver_limits_pending_check` CHECK (`pending_steal_count` >= 0 AND `pending_steal_ml` >= 0 AND `pending_steal_version` >= 0);