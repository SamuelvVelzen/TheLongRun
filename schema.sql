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
	country        text NOT NULL DEFAULT ''
);

-- Added after initial schema: activity country, resolved from the start coordinate on import.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS runs_date_idx ON runs (date DESC);
CREATE INDEX IF NOT EXISTS runs_strava_id_idx ON runs (strava_id);

-- GeoJSON route tracks, kept out of `runs` so list queries stay light.
-- id is the route id (Strava activity id) — i.e. the `{id}.json` filename without extension.
CREATE TABLE IF NOT EXISTS routes (
	id       text PRIMARY KEY,
	geojson  jsonb NOT NULL
);

-- Free-form context documents (goals.md, shoes.md, plan.json, profile.md, ...).
CREATE TABLE IF NOT EXISTS context (
	name     text PRIMARY KEY,
	content  text NOT NULL DEFAULT ''
);
