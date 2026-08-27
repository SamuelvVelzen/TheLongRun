-- The Long Run — Cloudflare D1 (SQLite) schema
-- Applied with `npm run d1:apply:local` (or `wrangler d1 migrations apply thelongrun --remote`).

CREATE TABLE IF NOT EXISTS runs (
	slug           TEXT PRIMARY KEY,
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
	best_efforts   TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS runs_date_idx ON runs (date DESC);
CREATE INDEX IF NOT EXISTS runs_strava_id_idx ON runs (strava_id);

-- GeoJSON route tracks, kept out of `runs` so list queries stay light.
-- `polyline` is a downsampled [[lat, lng], …] used by heatmaps; detail maps still read `geojson`.
CREATE TABLE IF NOT EXISTS routes (
	id        TEXT PRIMARY KEY,
	geojson   TEXT NOT NULL,
	polyline  TEXT
);

CREATE TABLE IF NOT EXISTS context (
	name     TEXT PRIMARY KEY,
	content  TEXT NOT NULL DEFAULT ''
);

-- Planned routes exported from BRouter. Separate from activity GPS tracks
-- so they don't show up on the dashboard heatmap of completed runs.
CREATE TABLE IF NOT EXISTS planned_routes (
	slug         TEXT PRIMARY KEY,
	name         TEXT NOT NULL,
	notes        TEXT NOT NULL DEFAULT '',
	distance_km  REAL,
	elev_gain    REAL,
	elev_loss    REAL,
	elev_min     REAL,
	elev_max     REAL,
	point_count  INTEGER NOT NULL DEFAULT 0,
	est_time     TEXT NOT NULL DEFAULT '',
	saved_on     TEXT NOT NULL,
	country      TEXT NOT NULL DEFAULT '',
	province     TEXT NOT NULL DEFAULT '',
	place        TEXT NOT NULL DEFAULT '',
	waypoints    TEXT NOT NULL DEFAULT '[]',
	geojson      TEXT NOT NULL,
	polyline     TEXT
);

CREATE TABLE IF NOT EXISTS planned_route_links (
	id             INTEGER PRIMARY KEY AUTOINCREMENT,
	route_slug     TEXT NOT NULL REFERENCES planned_routes(slug) ON DELETE CASCADE,
	kind           TEXT NOT NULL,
	activity_slug  TEXT REFERENCES runs(slug) ON DELETE CASCADE,
	plan_week      INTEGER,
	plan_day       TEXT,
	created_on     TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_plan_uniq
	ON planned_route_links (plan_week, plan_day)
	WHERE kind = 'plan';
CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_activity_uniq
	ON planned_route_links (activity_slug)
	WHERE kind = 'activity';
