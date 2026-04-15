ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS prediction_lesson text,
  ADD COLUMN IF NOT EXISTS prediction_lesson_type text;
