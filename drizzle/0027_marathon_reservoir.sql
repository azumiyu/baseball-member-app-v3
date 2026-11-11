ALTER TABLE `marathon_shop_inventory`
ADD COLUMN `reservoir_owned` integer DEFAULT 0 NOT NULL CHECK (`reservoir_owned` BETWEEN 0 AND 1);
--> statement-breakpoint
ALTER TABLE `marathon_shop_inventory`
ADD COLUMN `reservoir_ml` integer DEFAULT 0 NOT NULL CHECK (`reservoir_ml` >= 0);
--> statement-breakpoint
ALTER TABLE `marathon_shop_inventory`
ADD COLUMN `reservoir_growth_japan_date` text DEFAULT '1970-01-01' NOT NULL;
--> statement-breakpoint
ALTER TABLE `marathon_shop_inventory`
ADD COLUMN `reservoir_last_deposit_at` integer;
--> statement-breakpoint
ALTER TABLE `marathon_shop_inventory`
ADD COLUMN `reservoir_god_count` integer DEFAULT 0 NOT NULL CHECK (`reservoir_god_count` >= 0);
