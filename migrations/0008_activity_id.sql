-- Give activities a stable numeric id. The slug stops being identity and becomes a
-- frozen, unique URL label: ids backfill oldest-first (date, slug) so they are
-- stable and deterministic, group membership moves to activity_id, and existing
-- slugs/URLs keep working unchanged.

PRAGMA defer_foreign_keys=TRUE;

CREATE TABLE runs_new (
	id             INTEGER PRIMARY KEY AUTOINCREMENT,
	slug           TEXT NOT NULL UNIQUE,
	date           TEXT NOT NULL,
	week           INTEGER,
	day            TEXT NOT NULL DEFAULT '',
	activity_type  TEXT NOT NULL DEFAULT 'run',
	session        TEXT NOT NULL DEFAULT 'other',
	effort         INTEGER,
	shins          INTEGER,
	legs           INTEGER,
	energy         INTEGER,
	weather        TEXT NOT NULL DEFAULT '',
	surface        TEXT NOT NULL DEFAULT '',
	wanted_faster  INTEGER,
	distance_km    REAL,
	start_time     TEXT NOT NULL DEFAULT '',
	"time"         TEXT NOT NULL DEFAULT '',
	elapsed_time   TEXT NOT NULL DEFAULT '',
	avg_pace       TEXT NOT NULL DEFAULT '',
	avg_hr         INTEGER,
	max_hr         INTEGER,
	elev_gain      REAL,
	calories       INTEGER,
	kilojoules     REAL,
	max_speed      REAL,
	cadence        INTEGER,
	shoes          TEXT NOT NULL DEFAULT '',
	summary_image  TEXT NOT NULL DEFAULT '',
	splits_image   TEXT NOT NULL DEFAULT '',
	strava_id      TEXT NOT NULL DEFAULT '',
	route          TEXT NOT NULL DEFAULT '',
	notes          TEXT NOT NULL DEFAULT '',
	country        TEXT NOT NULL DEFAULT '',
	province       TEXT NOT NULL DEFAULT '',
	place          TEXT NOT NULL DEFAULT '',
	best_efforts   TEXT NOT NULL DEFAULT '[]',
	before_notes   TEXT NOT NULL DEFAULT '',
	after_notes    TEXT NOT NULL DEFAULT '',
	body_scores    TEXT NOT NULL DEFAULT '[]'
);

-- Backfill ids oldest-first so they read as a stable chronological index.
INSERT INTO runs_new (
	slug, date, week, day, activity_type, session, effort, shins, legs, energy, weather,
	surface, wanted_faster, distance_km, start_time, "time", elapsed_time, avg_pace, avg_hr,
	max_hr, elev_gain, calories, kilojoules, max_speed, cadence, shoes, summary_image,
	splits_image, strava_id, route, notes, country, province, place, best_efforts,
	before_notes, after_notes, body_scores
)
SELECT
	slug, date, week, day, activity_type, session, effort, shins, legs, energy, weather,
	surface, wanted_faster, distance_km, start_time, "time", elapsed_time, avg_pace, avg_hr,
	max_hr, elev_gain, calories, kilojoules, max_speed, cadence, shoes, summary_image,
	splits_image, strava_id, route, notes, country, province, place, best_efforts,
	before_notes, after_notes, body_scores
FROM runs
ORDER BY date ASC, slug ASC;

CREATE TABLE activity_group_members_new (
	group_id    TEXT NOT NULL REFERENCES activity_groups(id) ON DELETE CASCADE,
	activity_id INTEGER NOT NULL REFERENCES runs_new(id) ON DELETE CASCADE,
	sort_order  INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (group_id, activity_id)
);

-- Migrate membership from activity_slug to activity_id.
INSERT INTO activity_group_members_new (group_id, activity_id, sort_order)
SELECT m.group_id, r.id, m.sort_order
FROM activity_group_members m
JOIN runs_new r ON r.slug = m.activity_slug;

DROP TABLE activity_group_members;
DROP TABLE runs;

ALTER TABLE runs_new RENAME TO runs;
ALTER TABLE activity_group_members_new RENAME TO activity_group_members;

CREATE INDEX runs_date_idx ON runs (date DESC);
CREATE INDEX runs_strava_id_idx ON runs (strava_id);
CREATE UNIQUE INDEX activity_group_members_activity_uniq ON activity_group_members (activity_id);
CREATE INDEX activity_group_members_group_idx ON activity_group_members (group_id, sort_order);