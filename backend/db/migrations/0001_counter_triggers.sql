-- Like count triggers
CREATE OR REPLACE FUNCTION update_like_count_insert() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_like_count_delete() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_likes_insert ON likes;
CREATE TRIGGER trg_likes_insert AFTER INSERT ON likes FOR EACH ROW EXECUTE FUNCTION update_like_count_insert();

DROP TRIGGER IF EXISTS trg_likes_delete ON likes;
CREATE TRIGGER trg_likes_delete AFTER DELETE ON likes FOR EACH ROW EXECUTE FUNCTION update_like_count_delete();

-- Comment count triggers
CREATE OR REPLACE FUNCTION update_comment_count_insert() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_comment_count_delete() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comments_insert ON comments;
CREATE TRIGGER trg_comments_insert AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION update_comment_count_insert();

DROP TRIGGER IF EXISTS trg_comments_delete ON comments;
CREATE TRIGGER trg_comments_delete AFTER DELETE ON comments FOR EACH ROW EXECUTE FUNCTION update_comment_count_delete();

-- Repost count triggers
CREATE OR REPLACE FUNCTION update_repost_count_insert() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET repost_count = repost_count + 1 WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_repost_count_delete() RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts SET repost_count = repost_count - 1 WHERE id = OLD.post_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reposts_insert ON reposts;
CREATE TRIGGER trg_reposts_insert AFTER INSERT ON reposts FOR EACH ROW EXECUTE FUNCTION update_repost_count_insert();

DROP TRIGGER IF EXISTS trg_reposts_delete ON reposts;
CREATE TRIGGER trg_reposts_delete AFTER DELETE ON reposts FOR EACH ROW EXECUTE FUNCTION update_repost_count_delete();

-- Comment like count triggers
CREATE OR REPLACE FUNCTION update_comment_like_count_insert() RETURNS TRIGGER AS $$
BEGIN
  UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_comment_like_count_delete() RETURNS TRIGGER AS $$
BEGIN
  UPDATE comments SET like_count = like_count - 1 WHERE id = OLD.comment_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_likes_insert ON comment_likes;
CREATE TRIGGER trg_comment_likes_insert AFTER INSERT ON comment_likes FOR EACH ROW EXECUTE FUNCTION update_comment_like_count_insert();

DROP TRIGGER IF EXISTS trg_comment_likes_delete ON comment_likes;
CREATE TRIGGER trg_comment_likes_delete AFTER DELETE ON comment_likes FOR EACH ROW EXECUTE FUNCTION update_comment_like_count_delete();

-- Follow count triggers
CREATE OR REPLACE FUNCTION update_follow_counts_insert() RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET follower_count = follower_count + 1 WHERE address = NEW.followed_address;
  UPDATE users SET following_count = following_count + 1 WHERE address = NEW.follower_address;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_follow_counts_delete() RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET follower_count = GREATEST(follower_count - 1, 0) WHERE address = OLD.followed_address;
  UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE address = OLD.follower_address;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_follows_insert ON follows;
CREATE TRIGGER trg_follows_insert AFTER INSERT ON follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts_insert();

DROP TRIGGER IF EXISTS trg_follows_delete ON follows;
CREATE TRIGGER trg_follows_delete AFTER DELETE ON follows FOR EACH ROW EXECUTE FUNCTION update_follow_counts_delete();
