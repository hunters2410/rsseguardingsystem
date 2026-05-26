-- ============================================================
-- Migration: Known Faces Library + Known Color Profiles
-- Run this in Supabase → SQL Editor
-- ============================================================

-- ── Known Faces (person record) ──────────────────────────────
CREATE TABLE IF NOT EXISTS known_faces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee',  -- employee | vip | contractor | blacklist
  department    TEXT,
  photo_url     TEXT NOT NULL,   -- Primary/profile photo URL
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Known Face Photos (multiple angles per person) ────────────
-- Minimum 5 photos recommended per person for 90%+ accuracy.
-- Store: front, left_profile, right_profile, angled_down, different_lighting
CREATE TABLE IF NOT EXISTS known_face_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  known_face_id UUID NOT NULL REFERENCES known_faces(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  angle         TEXT NOT NULL DEFAULT 'front',
  -- Angle options: front | left_45 | right_45 | left_profile | right_profile | angled_down | other
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Known Color Profiles ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS known_color_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  required_colors  TEXT[] NOT NULL DEFAULT '{}',
  prohibited_colors TEXT[] NOT NULL DEFAULT '{}',
  region           TEXT NOT NULL DEFAULT 'top',
  coverage         NUMERIC(4,2) NOT NULL DEFAULT 0.15,
  cooldown         INTEGER NOT NULL DEFAULT 90,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Storage buckets ───────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → New bucket:
--   Name: known-faces   Public: YES

-- ── RLS policies ─────────────────────────────────────────────
ALTER TABLE known_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_face_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE known_color_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON known_faces          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON known_face_photos    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON known_color_profiles FOR ALL USING (true) WITH CHECK (true);

-- ── Seed color profiles ───────────────────────────────────────
INSERT INTO known_color_profiles (name, required_colors, prohibited_colors, region, coverage, cooldown)
VALUES
  ('Security Guard Uniform',  ARRAY['blue','navy'],    ARRAY[]::TEXT[], 'top',  0.20, 120),
  ('Construction Hi-Vis',     ARRAY['orange','yellow'],ARRAY[]::TEXT[], 'full', 0.15, 60),
  ('Restricted Area Policy',  ARRAY[]::TEXT[],         ARRAY['red'],    'full', 0.10, 90)
ON CONFLICT DO NOTHING;
