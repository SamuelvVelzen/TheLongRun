-- The Long Run — Neon Postgres schema
-- Applied automatically by `npm run migrate`; also safe to paste into the Neon SQL editor.

CREATE TABLE IF NOT EXISTS runs (
	slug           text PRIMARY KEY,
	date           text NOT NULL,
	week           integer,
	day            text NOT NULL DEFAULT '',
	activity_type  text NOT NULL DEFAULT 'run',
	session        text NOT NULL DEFAULT 'other',
	effort         integer,
	shins          integer,
	legs           integer,
	energy         integer,
	weather        text NOT NULL DEFAULT '',
	surface        text NOT NULL DEFAULT '',
	wanted_faster  boolean,
	distance_km    double precision,
	start_time     text NOT NULL DEFAULT '',
	"time"         text NOT NULL DEFAULT '',
	elapsed_time   text NOT NULL DEFAULT '',
	avg_pace       text NOT NULL DEFAULT '',
	avg_hr         integer,
	max_hr         integer,
	elev_gain      double precision,
	calories       integer,
	kilojoules     double precision,
	max_speed      double precision,
	cadence        integer,
	shoes          text NOT NULL DEFAULT '',
	summary_image  text NOT NULL DEFAULT '',
	splits_image   text NOT NULL DEFAULT '',
	strava_id      text NOT NULL DEFAULT '',
	route          text NOT NULL DEFAULT '',
	notes          text NOT NULL DEFAULT '',
	country        text NOT NULL DEFAULT '',
	province       text NOT NULL DEFAULT '',
	place          text NOT NULL DEFAULT ''
);

-- Added after initial schema: location, reverse-geocoded from the start coordinate on import.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS province text NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS place text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS runs_date_idx ON runs (date DESC);
CREATE INDEX IF NOT EXISTS runs_strava_id_idx ON runs (strava_id);

-- GeoJSON route tracks, kept out of `runs` so list queries stay light.
-- id is the route id (Strava activity id) — i.e. the `{id}.json` filename without extension.
-- `polyline` is a downsampled [[lat, lng], …] used by heatmaps; detail maps still read `geojson`.
CREATE TABLE IF NOT EXISTS routes (
	id        text PRIMARY KEY,
	geojson   jsonb NOT NULL,
	polyline  jsonb
);

ALTER TABLE routes ADD COLUMN IF NOT EXISTS polyline jsonb;

-- Free-form context documents (goals.md, shoes.md, plan.json, profile.md, ...).
CREATE TABLE IF NOT EXISTS context (
	name     text PRIMARY KEY,
	content  text NOT NULL DEFAULT ''
);

-- Planned routes exported from BRouter (GPX / GeoJSON). Separate from activity GPS tracks
-- so they don't show up on the dashboard heatmap of completed runs.
CREATE TABLE IF NOT EXISTS planned_routes (
	slug         text PRIMARY KEY,
	name         text NOT NULL,
	notes        text NOT NULL DEFAULT '',
	distance_km  double precision,
	elev_gain    double precision,
	elev_loss    double precision,
	elev_min     double precision,
	elev_max     double precision,
	point_count  integer NOT NULL DEFAULT 0,
	est_time     text NOT NULL DEFAULT '',
	saved_on     text NOT NULL,
	country      text NOT NULL DEFAULT '',
	province     text NOT NULL DEFAULT '',
	place        text NOT NULL DEFAULT '',
	waypoints    jsonb NOT NULL DEFAULT '[]'::jsonb,
	geojson      jsonb NOT NULL,
	polyline     jsonb
);

ALTER TABLE planned_routes ADD COLUMN IF NOT EXISTS est_time text NOT NULL DEFAULT '';
ALTER TABLE planned_routes ADD COLUMN IF NOT EXISTS polyline jsonb;

-- A planned route can be reused across many plan days and logged activities.
-- One plan day / one activity maps to at most one planned route.
CREATE TABLE IF NOT EXISTS planned_route_links (
	id             serial PRIMARY KEY,
	route_slug     text NOT NULL REFERENCES planned_routes(slug) ON DELETE CASCADE,
	kind           text NOT NULL,
	activity_slug  text REFERENCES runs(slug) ON DELETE CASCADE,
	plan_week      integer,
	plan_day       text,
	created_on     text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_plan_uniq
	ON planned_route_links (plan_week, plan_day)
	WHERE kind = 'plan';
CREATE UNIQUE INDEX IF NOT EXISTS planned_route_links_activity_uniq
	ON planned_route_links (activity_slug)
	WHERE kind = 'activity';

-- Fastest rolling windows per activity (5k / 10k / half / …), ranked at read time.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS best_efforts jsonb NOT NULL DEFAULT '[]'::jsonb;
