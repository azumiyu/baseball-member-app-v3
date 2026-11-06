DROP INDEX `stats_games_schedule_id_unique`;--> statement-breakpoint
CREATE INDEX `stats_games_schedule_id_idx` ON `stats_games` (`schedule_id`);--> statement-breakpoint
UPDATE app_revisions SET revision = revision + 1, write_token = '' WHERE scope = 'stats';
