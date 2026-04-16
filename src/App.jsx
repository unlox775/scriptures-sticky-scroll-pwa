import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { loadIndex, BookCache } from "./data.js";
import { createTelemetryEmitter } from "./telemetry.js";
import { getNextChapterPointer } from "./readerSequence.js";

const VIEWS = {
  HOME: "home",
  BOOKS: "books",
  CHAPTERS: "chapters",
  READER: "reader",
};

const dataEmit = createTelemetryEmitter("backend.dataAccess");
const uiReaderEmit = createTelemetryEmitter("ui.readerView");

function referenceFor(bookTitle, chapter, verse = 1) {
  return `${bookTitle} ${chapter}:${verse}`;
}

function buildInitialReaderState(workMeta, chapterData) {
  const nextPointer = getNextChapterPointer(workMeta, {
    bookId: chapterData.bookId,
    chapter: chapterData.chapter,
  });
  return {
    chapters: [chapterData],
    nextPointer,
    hasNext: Boolean(nextPointer),
  };
}

function normalizeVerseText(verse) {
  return `${verse.verse}. ${verse.text}`;
}

function normalizePointer(pointer) {
  if (!pointer?.bookId || !pointer?.chapter) return null;
  return {
    bookId: pointer.bookId,
    chapter: pointer.chapter,
  };
}

function Header({ view, title, onBackHome, onBack }) {
  const showHome = view !== VIEWS.HOME;
  const showBack = view === VIEWS.CHAPTERS || view === VIEWS.READER;
  return (
    <header className="app-header">
      <button className="header-btn" onClick={onBackHome} hidden={!showHome}>
        Home
      </button>
      <button className="header-btn header-back-btn" onClick={onBack} hidden={!showBack} aria-label="Back">
        <span aria-hidden="true" className="back-icon">
          ‹
        </span>
      </button>
      <div className="header-title">{title}</div>
    </header>
  );
}

function HomeView({ works, onOpenWork }) {
  return (
    <section className="panel">
      <h2>Standard Works</h2>
      <div className="grid works">
        {works.map((work) => (
          <article key={work.id} className="card card-clickable" onClick={() => onOpenWork(work.id)}>
            <h3>{work.title}</h3>
            <p className="bookmark-meta">{work.books.length} books</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function BooksView({ work, onOpenBook }) {
  if (!work) return null;
  return (
    <section className="panel">
      <h2>{work.title}</h2>
      <div className="grid books">
        {work.books.map((book) => (
          <article key={book.id} className="card card-clickable" onClick={() => onOpenBook(book.id)}>
            <h3>{book.title}</h3>
            <p className="bookmark-meta">{book.chapterCount} chapters</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChaptersView({ book, onOpenChapter }) {
  if (!book) return null;
  return (
    <section className="panel">
      <h2>{book.title}</h2>
      <p className="chapter-hint">Select a chapter</p>
      <div className="grid chapters">
        {Array.from({ length: book.chapterCount }, (_, idx) => idx + 1).map((chapter) => (
          <button key={chapter} className="chapter-tile" onClick={() => onOpenChapter(chapter)}>
            {chapter}
          </button>
        ))}
      </div>
    </section>
  );
}

function ReaderView({
  chapterBlocks,
  hasMore,
  loadMore,
  openReference,
  readerContainerRef,
  onScroll,
  loading,
}) {
  return (
    <section className="view reader-view">
      <div id="readerScroller" className="reader-scroller" ref={readerContainerRef} onScroll={onScroll}>
        <InfiniteScroll
          dataLength={chapterBlocks.length}
          next={loadMore}
          hasMore={hasMore}
          loader={<p className="chapter-hint">Loading more chapters…</p>}
          scrollableTarget="readerScroller"
          style={{ overflow: "visible" }}
          endMessage={<p className="chapter-hint">Reached the end of this work.</p>}
        >
          <div id="readerContent" className="reader-content">
            {chapterBlocks.map((chapter) => (
              <section key={`${chapter.bookId}:${chapter.chapter}`} className="chapter-block">
                <div className="chapter-header">
                  <h3>{chapter.title}</h3>
                  <button className="secondary-btn" onClick={() => openReference(chapter.externalUrl)}>
                    Open in Gospel Library
                  </button>
                </div>
                {chapter.verses.map((verse) => (
                  <p key={`${chapter.bookId}:${chapter.chapter}:${verse.verse}`} className="verse">
                    {normalizeVerseText(verse)}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </InfiniteScroll>
        {loading && <p className="chapter-hint">Preparing reader…</p>}
      </div>
    </section>
  );
}

export default function App() {
  const [index, setIndex] = useState(null);
  const [view, setView] = useState(VIEWS.HOME);
  const [selectedWorkId, setSelectedWorkId] = useState(null);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [readerState, setReaderState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const readerRef = useRef(null);
  const cacheRef = useRef(
    new BookCache(2, {
      onHit(bookMeta) {
        dataEmit({
          level: "debug",
          event: "book_cache_hit",
          summary: "Book cache hit",
          refs: { workId: bookMeta.workId, bookId: bookMeta.id },
          minVerbosity: "standard",
        });
      },
      onMiss(bookMeta) {
        dataEmit({
          level: "info",
          event: "book_cache_miss",
          summary: "Book cache miss",
          refs: { workId: bookMeta.workId, bookId: bookMeta.id },
          minVerbosity: "minimal",
        });
      },
    }),
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setIsLoading(true);
      setError(null);
      try {
        const loaded = await loadIndex();
        if (cancelled) return;
        setIndex(loaded);
        setView(VIEWS.HOME);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedWork = useMemo(() => index?.works?.find((work) => work.id === selectedWorkId) ?? null, [index, selectedWorkId]);
  const selectedBook = useMemo(
    () => selectedWork?.books?.find((book) => book.id === selectedBookId) ?? null,
    [selectedWork, selectedBookId],
  );

  const appTitle = useMemo(() => {
    if (view === VIEWS.BOOKS) return selectedWork?.title ?? "Books";
    if (view === VIEWS.CHAPTERS) return selectedBook?.title ?? "Chapters";
    if (view === VIEWS.READER && readerState?.chapters?.length) {
      const first = readerState.chapters[0];
      return `${first.bookTitle} ${first.chapter}`;
    }
    return "Standard Works Reader";
  }, [view, selectedWork, selectedBook, readerState]);

  const loadChapter = useCallback(
    async (workMeta, bookMeta, chapter) => {
      const payload = await cacheRef.current.getBook({
        ...bookMeta,
        workId: workMeta.id,
      });
      const chapterData = payload.chapters.find((item) => item.chapter === chapter);
      if (!chapterData) {
        throw new Error(`Missing chapter ${chapter} in ${bookMeta.title}`);
      }
      return {
        workId: workMeta.id,
        workTitle: workMeta.title,
        bookId: bookMeta.id,
        bookTitle: bookMeta.title,
        title: `${bookMeta.title} ${chapter}`,
        chapter,
        externalUrl: chapterData.externalUrl,
        verses: chapterData.verses,
      };
    },
    [],
  );

  const openWork = useCallback((workId) => {
    setSelectedWorkId(workId);
    setSelectedBookId(null);
    setReaderState(null);
    setView(VIEWS.BOOKS);
  }, []);

  const openBook = useCallback((bookId) => {
    setSelectedBookId(bookId);
    setReaderState(null);
    setView(VIEWS.CHAPTERS);
  }, []);

  const openChapter = useCallback(
    async (chapter) => {
      if (!selectedWork || !selectedBook) return;
      setIsLoadingMore(true);
      try {
        const chapterBlock = await loadChapter(selectedWork, selectedBook, chapter);
        setReaderState(buildInitialReaderState(selectedWork, chapterBlock));
        setView(VIEWS.READER);
        uiReaderEmit({
          level: "info",
          event: "reader_open_ready",
          summary: "Reader opened",
          refs: {
            workId: selectedWork.id,
            bookId: selectedBook.id,
            chapter,
            reference: referenceFor(selectedBook.title, chapter, 1),
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoadingMore(false);
      }
    },
    [selectedBook, selectedWork, loadChapter],
  );

  const loadMoreReader = useCallback(async () => {
    if (!readerState || !selectedWork || isLoadingMore || !readerState.nextPointer) return;
    const nextPointer = normalizePointer(readerState.nextPointer);
    const targetBook = selectedWork.books.find((book) => book.id === nextPointer.bookId);
    if (!targetBook) {
      setReaderState((current) => (current ? { ...current, nextPointer: null, hasNext: false } : current));
      return;
    }
    setIsLoadingMore(true);
    try {
      const chapterBlock = await loadChapter(selectedWork, targetBook, nextPointer.chapter);
      setReaderState((current) => {
        if (!current) return current;
        const upcomingPointer = getNextChapterPointer(selectedWork, {
          bookId: chapterBlock.bookId,
          chapter: chapterBlock.chapter,
        });
        const normalizedUpcoming = normalizePointer(upcomingPointer);
        const nextBlocks = [...current.chapters, chapterBlock];
        return {
          chapters: nextBlocks,
          nextPointer: normalizedUpcoming,
          hasNext: Boolean(normalizedUpcoming),
        };
      });
      uiReaderEmit({
        level: "debug",
        event: "reader_chapter_append",
        summary: "Appended next chapter via infinite scroll",
        refs: {
          workId: selectedWork.id,
          bookId: chapterBlock.bookId,
          chapter: chapterBlock.chapter,
          reference: referenceFor(chapterBlock.bookTitle, chapterBlock.chapter, 1),
        },
        minVerbosity: "standard",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingMore(false);
    }
  }, [readerState, selectedWork, loadChapter, isLoadingMore]);

  const handleBackHome = useCallback(() => {
    setView(VIEWS.HOME);
    setSelectedWorkId(null);
    setSelectedBookId(null);
    setReaderState(null);
  }, []);

  const handleBack = useCallback(() => {
    if (view === VIEWS.READER) {
      setView(VIEWS.CHAPTERS);
      return;
    }
    if (view === VIEWS.CHAPTERS) {
      setView(VIEWS.BOOKS);
    }
  }, [view]);

  const onReaderScroll = useCallback(
    (event) => {
      const target = event.currentTarget;
      uiReaderEmit({
        level: "debug",
        event: "reader_scroll",
        summary: "Reader scrolled",
        metrics: {
          scrollTop: Math.round(target.scrollTop),
          clientHeight: target.clientHeight,
          scrollHeight: target.scrollHeight,
        },
        throttleMs: 1200,
        sampleEvery: 3,
        minVerbosity: "deep",
      });
    },
    [],
  );

  const openReference = useCallback((url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  if (isLoading) {
    return (
      <div id="app">
        <Header view={VIEWS.HOME} title="Standard Works Reader" onBackHome={handleBackHome} onBack={handleBack} />
        <main className="app-main">
          <section className="panel">
            <p>Loading scripture index…</p>
          </section>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div id="app">
        <Header view={VIEWS.HOME} title="Standard Works Reader" onBackHome={handleBackHome} onBack={handleBack} />
        <main className="app-main">
          <section className="panel">
            <h2>Failed to load app</h2>
            <pre>{error}</pre>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div id="app" className={view === VIEWS.READER ? "reader-active" : ""}>
      <Header view={view} title={appTitle} onBackHome={handleBackHome} onBack={handleBack} />
      <main className="app-main">
        {view === VIEWS.HOME && <HomeView works={index?.works ?? []} onOpenWork={openWork} />}
        {view === VIEWS.BOOKS && <BooksView work={selectedWork} onOpenBook={openBook} />}
        {view === VIEWS.CHAPTERS && <ChaptersView book={selectedBook} onOpenChapter={openChapter} />}
        {view === VIEWS.READER && readerState && (
          <ReaderView
            chapterBlocks={readerState.chapters}
            hasMore={readerState.hasNext}
            loadMore={loadMoreReader}
            openReference={openReference}
            readerContainerRef={readerRef}
            onScroll={onReaderScroll}
            loading={isLoadingMore}
          />
        )}
      </main>
    </div>
  );
}
