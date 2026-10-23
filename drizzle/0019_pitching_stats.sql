ALTER TABLE `player_game_stats` ADD `pitching_recorded` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `innings_pitched_outs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `runs_allowed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `earned_runs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `hits_allowed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `home_runs_allowed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `strikeouts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `walks_allowed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `player_game_stats` ADD `hit_by_pitch` integer DEFAULT 0 NOT NULL;