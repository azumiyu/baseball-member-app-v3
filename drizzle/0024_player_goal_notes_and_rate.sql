ALTER TABLE `player_goal_progress_snapshots` ADD `progress_percent` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_goals` ADD `manual_note` text DEFAULT '' NOT NULL;