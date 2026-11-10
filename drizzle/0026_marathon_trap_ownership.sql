ALTER TABLE `marathon_shop_inventory`
ADD COLUMN `pending_trap_count` integer DEFAULT 0 NOT NULL CHECK (`pending_trap_count` >= 0);
