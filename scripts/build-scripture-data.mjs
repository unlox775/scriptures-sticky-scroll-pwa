import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(projectRoot, "node_modules", "@bencrowder", "scriptures-json");
const outputRoot = path.join(projectRoot, "public", "data");

const worksConfig = [
  {
    id: "book-of-mormon",
    title: "Book of Mormon",
    sourceFile: "book-of-mormon.json",
    studyPath: "bofm",
  },
  {
    id: "old-testament",
    title: "Old Testament",
    sourceFile: "old-testament.json",
    studyPath: "ot",
  },
  {
    id: "new-testament",
    title: "New Testament",
    sourceFile: "new-testament.json",
    studyPath: "nt",
  },
  {
    id: "doctrine-and-covenants",
    title: "Doctrine and Covenants",
    sourceFile: "doctrine-and-covenants.json",
    studyPath: "dc-testament/dc",
    hasSections: true,
  },
  {
    id: "pearl-of-great-price",
    title: "Pearl of Great Price",
    sourceFile: "pearl-of-great-price.json",
    studyPath: "pgp",
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-+|-+$)/g, "");
}

function chapterExternalUrl(studyPath, bookSlug, chapter) {
  const chapterPath = bookSlug ? `${studyPath}/${bookSlug}/${chapter}` : `${studyPath}/${chapter}`;
  return `https://www.churchofjesuschrist.org/study/scriptures/${chapterPath}?lang=eng`;
}

function blockKey(...parts) {
  return parts.filter(Boolean).join("-");
}

function textBlock({ type = "heading", role, key, reference, text }) {
  if (!text) return null;
  return {
    type,
    role,
    key,
    reference,
    text,
  };
}

function verseBlock(verse) {
  return {
    type: "verse",
    key: blockKey("verse", verse.verse),
    verse: Number(verse.verse),
    reference: verse.reference,
    text: verse.text,
  };
}

function normalizeChapterBlocks({ book, chapter, verses }) {
  const blocks = [];
  if (Number(chapter.chapter) === 1) {
    blocks.push(
      textBlock({
        type: "title",
        role: "book-title",
        key: "book-title",
        reference: book.book,
        text: book.full_title,
      }),
      textBlock({
        type: "subtitle",
        role: "book-subtitle",
        key: "book-subtitle",
        reference: book.book,
        text: book.full_subtitle,
      }),
      textBlock({
        role: "book-heading",
        key: "book-heading",
        reference: book.book,
        text: book.heading,
      }),
    );
  }
  blocks.push(
    textBlock({
      role: "chapter-heading",
      key: "chapter-heading",
      reference: chapter.reference,
      text: chapter.heading,
    }),
  );
  blocks.push(...verses.map(verseBlock));
  return blocks.filter(Boolean);
}

async function writeBookPayload(workId, bookId, payload) {
  const bookDir = path.join(outputRoot, "books", workId);
  await fs.mkdir(bookDir, { recursive: true });
  const jsonPath = path.join(bookDir, `${bookId}.json`);
  const gzPath = `${jsonPath}.gz`;
  const serialized = JSON.stringify(payload);
  await fs.writeFile(jsonPath, serialized, "utf8");
  await fs.writeFile(gzPath, gzipSync(Buffer.from(serialized)));
}

function normalizeBookWork(config, sourceData) {
  return sourceData.books.map((book) => {
    const bookId = book.lds_slug || slugify(book.book);
    const bookSlug = book.lds_slug || slugify(book.book);
    const chapters = book.chapters.map((chapter) => {
      const verses = chapter.verses.map((verse) => ({
        verse: Number(verse.verse),
        reference: verse.reference,
        text: verse.text,
      }));
      return {
        chapter: Number(chapter.chapter),
        reference: chapter.reference,
        heading: chapter.heading,
        externalUrl: chapterExternalUrl(config.studyPath, bookSlug, chapter.chapter),
        blocks: normalizeChapterBlocks({ book, chapter, verses }),
        verses,
      };
    });
    return {
      id: bookId,
      title: book.book,
      fullTitle: book.full_title,
      fullSubtitle: book.full_subtitle,
      heading: book.heading,
      slug: bookSlug,
      chapterCount: chapters.length,
      chapters,
    };
  });
}

function normalizeSectionsWork(config, sourceData) {
  const bookId = "dc";
  const chapters = sourceData.sections.map((section) => {
    const verses = section.verses.map((verse) => ({
      verse: Number(verse.verse),
      reference: verse.reference,
      text: verse.text,
    }));
    const blocks = [
      textBlock({
        role: "section-heading",
        key: "section-heading",
        reference: section.reference,
        text: section.heading,
      }),
      ...verses.map(verseBlock),
    ].filter(Boolean);
    return {
      chapter: Number(section.section),
      reference: section.reference,
      heading: section.heading,
      externalUrl: chapterExternalUrl(config.studyPath, null, section.section),
      blocks,
      verses,
    };
  });
  return [
    {
      id: bookId,
      title: "Doctrine and Covenants",
      slug: "dc",
      chapterCount: chapters.length,
      chapters,
    },
  ];
}

async function main() {
  const packageManifest = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const works = [];

  for (const config of worksConfig) {
    const sourcePath = path.join(packageRoot, config.sourceFile);
    const sourceData = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    const normalizedBooks = config.hasSections
      ? normalizeSectionsWork(config, sourceData)
      : normalizeBookWork(config, sourceData);

    const workRecord = {
      id: config.id,
      title: config.title,
      studyPath: config.studyPath,
      books: [],
    };

    for (const normalizedBook of normalizedBooks) {
      const payload = {
        workId: config.id,
        workTitle: config.title,
        studyPath: config.studyPath,
        ...normalizedBook,
      };
      await writeBookPayload(config.id, normalizedBook.id, payload);
      workRecord.books.push({
        id: normalizedBook.id,
        title: normalizedBook.title,
        fullTitle: normalizedBook.fullTitle,
        fullSubtitle: normalizedBook.fullSubtitle,
        heading: normalizedBook.heading,
        slug: normalizedBook.slug,
        chapterCount: normalizedBook.chapterCount,
        workId: config.id,
        pathJson: `data/books/${config.id}/${normalizedBook.id}.json`,
        pathGz: `data/books/${config.id}/${normalizedBook.id}.json.gz`,
      });
    }

    works.push(workRecord);
  }

  const index = {
    generatedAt: new Date().toISOString(),
    source: {
      package: "@bencrowder/scriptures-json",
      version: packageManifest.version,
      notes:
        "Includes public-domain text fields present in upstream data; official footnotes are not included.",
    },
    works,
  };

  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(path.join(outputRoot, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`Built scripture data index with ${works.length} works.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
