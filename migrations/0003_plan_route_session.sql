-- Planned routes attach to a specific plan session, not every session on that weekday.

ALTER TABLE planned_route_links ADD COLUMN plan_label TEXT;
ALTER TABLE planned_route_links ADD COLUMN plan_activity_type TEXT;

DROP INDEX IF EXISTS planned_route_links_plan_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_plan_uniq
	ON planned_route_links (plan_week, plan_day, IFNULL(plan_label, ''), IFNULL(plan_activity_type, ''))
	WHERE kind = 'plan';
