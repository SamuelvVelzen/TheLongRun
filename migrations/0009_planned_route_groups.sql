-- Overlay groups for planned routes — each route row stays source of truth.

CREATE TABLE IF NOT EXISTS planned_route_groups (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL DEFAULT '',
	created_on  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS planned_route_group_members (
	group_id     TEXT NOT NULL REFERENCES planned_route_groups(id) ON DELETE CASCADE,
	route_slug   TEXT NOT NULL REFERENCES planned_routes(slug) ON DELETE CASCADE,
	sort_order   INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (group_id, route_slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS planned_route_group_members_slug_uniq
	ON planned_route_group_members (route_slug);

CREATE INDEX IF NOT EXISTS planned_route_group_members_group_idx
	ON planned_route_group_members (group_id, sort_order);
