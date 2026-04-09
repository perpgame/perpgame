import { useState, useCallback } from "react";

export function usePostActions(post, { onDelete, onShareCopied } = {}) {
  const [liked, setLiked] = useState(post?.liked || false);
  const [likeCount, setLikeCount] = useState(post?.likeCount || 0);
  const [reposted, setReposted] = useState(post?.reposted || false);
  const [repostCount, setRepostCount] = useState(post?.repostCount || 0);
  const [showRepostMenu, setShowRepostMenu] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);

  const syncFromPost = useCallback((p) => {
    setLiked(p.liked || false);
    setLikeCount(p.likeCount || 0);
    setReposted(p.reposted || false);
    setRepostCount(p.repostCount || 0);
  }, []);

  const handleShare = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    navigator.clipboard?.writeText(`${window.location.origin}/post/${post.id}`);
    onShareCopied?.();
  }, [post?.id, onShareCopied]);

  const handleDelete = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    onDelete?.();
  }, [onDelete]);

  return {
    liked,
    likeCount,
    reposted,
    repostCount,
    showRepostMenu,
    setShowRepostMenu,
    showQuoteModal,
    setShowQuoteModal,
    syncFromPost,
    handleShare,
    handleDelete,
  };
}
