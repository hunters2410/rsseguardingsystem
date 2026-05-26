-- Add AI detection schedule fields to alert_rules table
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS schedule_enabled   BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS schedule_start     TEXT      DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS schedule_end       TEXT      DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS schedule_days      TEXT[]    DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
