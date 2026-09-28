-- Apply once after 0012_schedule_end_time.sql, before deploying the updated app and weekly schedule worker.
-- Existing games remain unarranged until an editor explicitly marks them arranged.
ALTER TABLE schedule_games ADD COLUMN umpire_arranged INTEGER NOT NULL DEFAULT 0
  CONSTRAINT schedule_games_umpire_arranged_check CHECK (umpire_arranged IN (0, 1));
--> statement-breakpoint
UPDATE app_revisions SET revision=revision+1,write_token='' WHERE scope IN ('team','schedule');
