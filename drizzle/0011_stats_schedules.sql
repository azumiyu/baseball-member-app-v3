-- Apply once after 0010_mini_games.sql, before publishing the updated app.
-- Keep the historical primary key and all player/plate-appearance references.
ALTER TABLE stats_games ADD schedule_id TEXT REFERENCES schedule_games(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX stats_games_schedule_id_unique ON stats_games(schedule_id);
--> statement-breakpoint
-- A date alone identifies a game only when BOTH sides have exactly one row.
-- Leave doubleheaders and unmatched history unlinked for explicit later review.
WITH single_stats_dates AS (
  SELECT game_date FROM stats_games GROUP BY game_date HAVING COUNT(*) = 1
), single_schedule_dates AS (
  SELECT date, MIN(id) AS schedule_id FROM schedule_games GROUP BY date HAVING COUNT(*) = 1
)
UPDATE stats_games
SET schedule_id = (SELECT schedule_id FROM single_schedule_dates WHERE date = stats_games.game_date)
WHERE game_date IN (SELECT game_date FROM single_stats_dates)
  AND game_date IN (SELECT date FROM single_schedule_dates);
--> statement-breakpoint
-- FK SET NULL preserves statistics on schedule deletion. Invalidate stale stats
-- clients in the same transaction before the linked row is cleared by that FK.
-- Drizzle snapshots describe tables/indexes; retain this custom trigger here.
CREATE TRIGGER schedule_games_stats_revision_before_delete
BEFORE DELETE ON schedule_games
WHEN EXISTS (SELECT 1 FROM stats_games WHERE schedule_id = OLD.id)
BEGIN
  UPDATE app_revisions SET revision = revision + 1, write_token = '' WHERE scope = 'stats';
END;
--> statement-breakpoint
UPDATE app_revisions SET revision = revision + 1, write_token = '' WHERE scope = 'stats';
