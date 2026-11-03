CREATE TABLE IF NOT EXISTS central_day.management_catalog (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('phase','sector','owner')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), sector text NOT NULL DEFAULT '',
 actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS management_catalog_name ON central_day.management_catalog(kind,lower(name));
