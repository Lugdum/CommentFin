-- Comment Track storage. Applied idempotently on plugin startup.
-- SQLite file: <IApplicationPaths.DataPath>/comment-track/comments.db

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS comments (
    id          TEXT    PRIMARY KEY,        -- GUID "D"
    item_id     TEXT    NOT NULL,           -- Jellyfin ItemId
    position_ms INTEGER NOT NULL,           -- timecode in milliseconds
    body        TEXT    NOT NULL,
    user_id     TEXT    NOT NULL,           -- Jellyfin user GUID
    user_name   TEXT    NOT NULL,           -- denormalised for display
    created_at  TEXT    NOT NULL,           -- ISO-8601 UTC
    deleted     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_comments_item
    ON comments (item_id, position_ms) WHERE deleted = 0;

CREATE INDEX IF NOT EXISTS ix_comments_ratelimit
    ON comments (user_id, created_at);

-- Per-account overlay settings, synced across every device/browser a viewer
-- uses. Opaque JSON blob (the settings object itself) - the server never
-- interprets it, just stores/returns it.
CREATE TABLE IF NOT EXISTS user_prefs (
    user_id    TEXT PRIMARY KEY,
    settings   TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Admin-set, per-user plugin access. Distinct from user_prefs, which the user
-- owns and can overwrite: only the dashboard writes here. A row exists only
-- while the user is blocked; clearing the block deletes it.
CREATE TABLE IF NOT EXISTS user_policy (
    user_id    TEXT PRIMARY KEY,
    blocked    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO schema_meta (key, value) VALUES ('version', '3')
    ON CONFLICT (key) DO UPDATE SET value = excluded.value;
