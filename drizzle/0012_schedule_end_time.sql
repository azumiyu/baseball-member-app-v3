-- Apply once after 0011_stats_schedules.sql, before deploying the app and weekly schedule worker.
ALTER TABLE schedule_games ADD end_time TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE schedule_games ADD previous_end_time TEXT;
--> statement-breakpoint
-- Keep existing end times unspecified; selecting a start time suggests an end in the editor.
UPDATE app_revisions SET revision=revision+1,write_token='' WHERE scope IN ('team','schedule');
