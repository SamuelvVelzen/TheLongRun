-- Per-activity before/after habit notes (overrides of the sport defaults).

ALTER TABLE runs ADD COLUMN before_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE runs ADD COLUMN after_notes TEXT NOT NULL DEFAULT '';
