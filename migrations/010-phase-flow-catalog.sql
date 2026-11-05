DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='central_day.management_catalog'::regclass AND conname='management_catalog_kind_check') THEN
  ALTER TABLE central_day.management_catalog DROP CONSTRAINT management_catalog_kind_check;
 END IF;
 ALTER TABLE central_day.management_catalog ADD CONSTRAINT management_catalog_kind_check CHECK (kind IN ('phase','phase-almox','phase-aprv','phase-fiscal','sector','owner'));
END $$;