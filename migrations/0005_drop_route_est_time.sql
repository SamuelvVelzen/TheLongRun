-- Planned routes no longer store BRouter estimated time.

ALTER TABLE planned_routes DROP COLUMN est_time;
