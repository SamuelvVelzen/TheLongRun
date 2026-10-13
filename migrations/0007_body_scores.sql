-- One 0–10 score per open body note: JSON array of { note_id, area, score }.
-- The old single `shins` score stays as a column (no longer read; the app mirrors the worst
-- body score into it for backward compatibility).

ALTER TABLE runs ADD COLUMN body_scores TEXT NOT NULL DEFAULT '[]';

-- Backfill: each `shins` value becomes one entry labelled with the body note that was tracked
-- (context row body-notes.json), else area 'Pain' with no note id.
UPDATE runs
SET body_scores = json_array(json_object(
	'note_id', (
		SELECT json_extract(n.value, '$.id')
		FROM context c, json_each(CASE WHEN json_valid(c.content) THEN c.content ELSE '{}' END, '$.notes') n
		WHERE c.name = 'body-notes.json' AND json_extract(n.value, '$.tracked') = 1
		LIMIT 1
	),
	'area', COALESCE((
		SELECT json_extract(n.value, '$.area')
		FROM context c, json_each(CASE WHEN json_valid(c.content) THEN c.content ELSE '{}' END, '$.notes') n
		WHERE c.name = 'body-notes.json' AND json_extract(n.value, '$.tracked') = 1
		LIMIT 1
	), 'Pain'),
	'score', MAX(0, MIN(10, CAST(ROUND(shins) AS INTEGER)))
))
WHERE shins IS NOT NULL;
