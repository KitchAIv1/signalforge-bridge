-- Migration 025: Lock amd_state after initial 10:31 UTC detection.
-- Prevents redeploy/rerun from overwriting auto_direction via full upsert.
-- Unlocked by 16:30 UTC outcome cron targeted update.

ALTER TABLE amd_state
  ADD COLUMN IF NOT EXISTS detection_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detection_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS detection_locked_reason text;
