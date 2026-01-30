-- Add model_path and smart_reporting columns to ai_models table
ALTER TABLE ai_models 
ADD COLUMN IF NOT EXISTS model_path TEXT,
ADD COLUMN IF NOT EXISTS smart_reporting BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN ai_models.model_path IS 'Path to the model file in storage';
COMMENT ON COLUMN ai_models.smart_reporting IS 'Enable smart reporting features for this model';
