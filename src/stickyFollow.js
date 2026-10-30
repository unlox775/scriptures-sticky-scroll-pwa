export const STICKY_FOLLOW_MAX_CHAPTER_GAP = 1;

export function stickyFollowDelta(bookmark, anchor) {
  if (!bookmark?.location || !anchor) return null;
  const loc = bookmark.location;
  if (loc.workId !== anchor.workId) return null;
  if (Number.isFinite(loc.seq) && Number.isFinite(anchor.seq)) {
    // seq is the chapter index across the whole work, so it stays adjacent across book boundaries.
    const seqGap = anchor.seq - loc.seq;
    if (seqGap < 0 || seqGap > STICKY_FOLLOW_MAX_CHAPTER_GAP) return null;
    return seqGap === 0
      ? Math.abs((anchor.verse || 0) - (loc.verse || 0))
      : (anchor.verse || 0);
  }
  if (loc.bookId !== anchor.bookId) return null;
  const chapterGap = (anchor.chapter || 0) - (loc.chapter || 0);
  if (chapterGap < 0 || chapterGap > STICKY_FOLLOW_MAX_CHAPTER_GAP) return null;
  return chapterGap === 0
    ? Math.abs((anchor.verse || 0) - (loc.verse || 0))
    : (anchor.verse || 0);
}
