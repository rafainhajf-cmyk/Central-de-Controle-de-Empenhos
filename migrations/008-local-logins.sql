ALTER TABLE central_day.admin_credentials ADD COLUMN IF NOT EXISTS login text;
CREATE UNIQUE INDEX IF NOT EXISTS local_credentials_login_unique ON central_day.admin_credentials(lower(login)) WHERE login IS NOT NULL;
