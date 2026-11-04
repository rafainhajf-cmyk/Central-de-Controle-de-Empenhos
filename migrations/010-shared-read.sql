ALTER TABLE central_day.profiles ADD COLUMN IF NOT EXISTS global_read boolean NOT NULL DEFAULT false;
