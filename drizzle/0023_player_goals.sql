CREATE TABLE `player_goal_progress_snapshots` (
	`season` integer NOT NULL,
	`japan_date` text NOT NULL,
	`achieved_count` integer NOT NULL,
	`total_count` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	PRIMARY KEY(`season`, `japan_date`),
	CONSTRAINT "player_goal_progress_counts_check" CHECK("player_goal_progress_snapshots"."achieved_count" BETWEEN 0 AND "player_goal_progress_snapshots"."total_count" AND "player_goal_progress_snapshots"."total_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE `player_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`season` integer NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`metric` text,
	`target_value` real,
	`direction` text,
	`manual_progress` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "player_goals_title_check" CHECK(length(trim("player_goals"."title")) BETWEEN 1 AND 100),
	CONSTRAINT "player_goals_kind_check" CHECK("player_goals"."kind" IN ('batting', 'pitching', 'manual')),
	CONSTRAINT "player_goals_manual_progress_check" CHECK("player_goals"."manual_progress" BETWEEN 0 AND 100),
	CONSTRAINT "player_goals_shape_check" CHECK(("player_goals"."kind" = 'manual' AND "player_goals"."metric" IS NULL AND "player_goals"."target_value" IS NULL AND "player_goals"."direction" IS NULL) OR ("player_goals"."kind" IN ('batting', 'pitching') AND "player_goals"."metric" IS NOT NULL AND "player_goals"."target_value" > 0 AND "player_goals"."direction" IN ('gte', 'lte')))
);
--> statement-breakpoint
CREATE INDEX `player_goals_player_season_idx` ON `player_goals` (`player_id`,`season`,`sort_order`);
--> statement-breakpoint
WITH `default_goals` (`number`,`name_prefix`,`title`,`kind`,`metric`,`target_value`,`direction`,`sort_order`) AS (
	VALUES
		('25','押野','打率','batting','打率',0.350,'gte',0),
		('25','押野','本塁打','batting','本塁打',10,'gte',1),
		('25','押野','球速 145 km/h','manual',NULL,NULL,NULL,2),
		('1','根岸','犠打','batting','犠打',20,'gte',0),
		('1','根岸','得点','batting','得点',40,'gte',1),
		('1','根岸','打率','batting','打率',0.300,'gte',2),
		('10','池原','打率','batting','打率',0.400,'gte',0),
		('10','池原','本塁打','batting','本塁打',5,'gte',1),
		('42','千明','打率','batting','打率',0.400,'gte',0),
		('42','千明','本塁打','batting','本塁打',10,'gte',1),
		('42','千明','打点','batting','打点',35,'gte',2),
		('42','千明','出塁率','batting','出塁率',0.500,'gte',3),
		('28','戸田','打率','batting','打率',0.300,'gte',0),
		('28','戸田','出塁率','batting','出塁率',0.450,'gte',1),
		('28','戸田','得点','batting','得点',40,'gte',2),
		('60','長安','長打率','batting','長打率',0.700,'gte',0),
		('60','長安','得点圏打率','batting','得点圏打率',0.400,'gte',1),
		('60','長安','OPS','batting','OPS',1.000,'gte',2),
		('19','安曇','球速 135 km/h','manual',NULL,NULL,NULL,0),
		('19','安曇','防御率','pitching','防御率',1.500,'lte',1),
		('19','安曇','K/9','pitching','K/9',9.000,'gte',2),
		('17','三澤','参加率 70%以上','manual',NULL,NULL,NULL,0),
		('17','三澤','本塁打','batting','本塁打',5,'gte',1),
		('17','三澤','打点','batting','打点',20,'gte',2),
		('96','川高','打率','batting','打率',0.350,'gte',0),
		('96','川高','本塁打','batting','本塁打',5,'gte',1),
		('96','川高','盗塁阻止率 90%超','manual',NULL,NULL,NULL,2),
		('4','川鍋','出塁率','batting','出塁率',0.500,'gte',0),
		('4','川鍋','盗塁','batting','盗塁',20,'gte',1),
		('4','川鍋','打点','batting','打点',30,'gte',2),
		('4','川鍋','本塁打','batting','本塁打',5,'gte',3)
)
INSERT INTO `player_goals` (`id`,`player_id`,`season`,`title`,`kind`,`metric`,`target_value`,`direction`,`manual_progress`,`sort_order`,`created_at`,`updated_at`)
SELECT lower(hex(randomblob(16))),p.`id`,2026,g.`title`,g.`kind`,g.`metric`,g.`target_value`,g.`direction`,0,g.`sort_order`,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000
FROM `default_goals` g JOIN `players` p ON p.`number`=g.`number` AND p.`sort_order` IS NOT NULL
	AND replace(replace(p.`name`,' ',''),'　','') LIKE g.`name_prefix` || '%';
