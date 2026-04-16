export function buildWorkChapterSequence(workMeta) {
  if (!workMeta?.books?.length) return [];
  const sequence = [];
  for (const book of workMeta.books) {
    for (let chapter = 1; chapter <= (book.chapterCount || 0); chapter += 1) {
      sequence.push({
        workId: workMeta.id,
        workTitle: workMeta.title,
        bookId: book.id,
        bookTitle: book.title,
        chapter,
      });
    }
  }
  return sequence;
}

export function getNextChapterPointer(workMeta, location) {
  if (!workMeta || !location?.bookId || !location?.chapter) return null;
  const sequence = buildWorkChapterSequence(workMeta);
  const index = sequence.findIndex((item) => item.bookId === location.bookId && item.chapter === location.chapter);
  if (index < 0 || index + 1 >= sequence.length) return null;
  return sequence[index + 1];
}
