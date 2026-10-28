CREATE TABLE IF NOT EXISTS central_day.access_requests (
 user_id text PRIMARY KEY, email text NOT NULL, name text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
 requested_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz, decided_by text
);
