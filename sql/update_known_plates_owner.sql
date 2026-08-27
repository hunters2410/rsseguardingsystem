-- ==============================================================================
-- Migration: Add Owner, Vehicle Details, Tag, and Highlight Color to known_plates & number_plates
-- ==============================================================================

-- 1. Add owner metadata to known_plates (Directory & Memory)
ALTER TABLE public.known_plates ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.known_plates ADD COLUMN IF NOT EXISTS vehicle_desc TEXT;
ALTER TABLE public.known_plates ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'unknown';
ALTER TABLE public.known_plates ADD COLUMN IF NOT EXISTS highlight_color TEXT DEFAULT '#64748B';
ALTER TABLE public.known_plates ADD COLUMN IF NOT EXISTS alert_on_detect BOOLEAN DEFAULT false;
ALTER TABLE public.known_plates ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Add owner info & vehicle state to number_plates (Logs)
ALTER TABLE public.number_plates ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE public.number_plates ADD COLUMN IF NOT EXISTS tag TEXT DEFAULT 'unknown';
ALTER TABLE public.number_plates ADD COLUMN IF NOT EXISTS highlight_color TEXT DEFAULT '#64748B';
ALTER TABLE public.number_plates ADD COLUMN IF NOT EXISTS vehicle_state TEXT DEFAULT 'MOVING';

-- 3. Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_known_plates_owner ON public.known_plates(owner_name);
CREATE INDEX IF NOT EXISTS idx_known_plates_tag ON public.known_plates(tag);
CREATE INDEX IF NOT EXISTS idx_number_plates_owner ON public.number_plates(owner_name);
