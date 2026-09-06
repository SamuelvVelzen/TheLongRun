-- Overlay groups: each GPX/run row stays source of truth; members are never merged.

CREATE TABLE IF NOT EXISTS activity_groups (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL DEFAULT '',
	created_on  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_group_members (
	group_id       TEXT NOT NULL REFERENCES activity_groups(id) ON DELETE CASCADE,
	activity_slug  TEXT NOT NULL REFERENCES runs(slug) ON DELETE CASCADE,
	sort_order     INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (group_id, activity_slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS activity_group_members_slug_uniq
	ON activity_group_members (activity_slug);

CREATE INDEX IF NOT EXISTS activity_group_members_group_idx
	ON activity_group_members (group_id, sort_order);
