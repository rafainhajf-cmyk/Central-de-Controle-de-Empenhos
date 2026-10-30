CREATE TABLE IF NOT EXISTS central_day.admin_login_links (
 token_hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES central_day.admin_credentials(user_id),
 credential_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_login_links_expiry ON central_day.admin_login_links(expires_at);
