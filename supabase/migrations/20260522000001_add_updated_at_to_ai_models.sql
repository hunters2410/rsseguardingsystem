-- Add missing updated_at column to ai_models table
-- AlertConfiguration.tsx saveModelConfig() was failing because this column
-- was never included in the original schema (20251113151704_create_eguarding_schema.sql)

ALTER TABLE ai_models
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Back-fill existing rows so updated_at is not null
UPDATE ai_models SET updated_at = created_at WHERE updated_at IS NULL;

-- Optional: auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION set_ai_models_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_models_updated_at ON ai_models;
CREATE TRIGGER trg_ai_models_updated_at
  BEFORE UPDATE ON ai_models
  FOR EACH ROW EXECUTE FUNCTION set_ai_models_updated_at();
