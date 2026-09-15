// Build-time content pipeline (plan §8, Phase 1):
//   raw book text  ->  paginated book.json
//
// Usage: npm run book [-- <book-id>]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countWords, paginate, parseGutenberg, parseLayoutText, parseStructure } from './lib/paginate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

// Registry of books the pipeline knows how to build. To swap the book, add an
// entry here (plus its source text) and run `npm run book -- <id>`.
//
// Public-domain books write to public/ and ship with the app. Copyrighted
// personal copies write to private/ (git-ignored), which only the local dev
// server reads — see vite.config.js — so they never end up in a build.
const BOOKS = {
  'sherlock-holmes-adventures': {
    file: 'content/sherlock-holmes-adventures.txt',
    output: 'public/book.json',
    load(raw) {
      const { title, author, body } = parseGutenberg(raw);
      const chapters = parseStructure(body, {
        chapterPattern: /^[IVXLC]+\.\s+([A-Z][A-Z’' -]+)$/,
        sectionPattern: /^[IVXLC]+\.$/,
      });
      return { title, author, chapters };
    },
    source: 'Project Gutenberg',
    sourceUrl: 'https://www.gutenberg.org/ebooks/1661',
    license: 'public-domain',
  },

  // Personal copy. Extract the text from your PDF first:
  //   pdftotext -enc UTF-8 -layout private/grownup.pdf private/grownup.layout.txt
  grownup: {
    file: 'private/grownup.layout.txt',
    output: 'private/book.json',
    load(raw) {
      const paragraphs = parseLayoutText(raw, {
        start: /^To David and Ce/, // dedication, just before the story
        end: /^\s*ACKNOWLEDGMENTS\s*$/,
        // Body paragraphs indent 4; the quoted web page inside the story indents
        // its first lines 15 and wraps at 11.
        isParagraphStart: (indent) => indent === 4 || indent === 15,
      });
      return { title: 'The Grownup', author: 'Gillian Flynn', chapters: [{ title: 'The Grownup', sections: [paragraphs] }] };
    },
    source: 'Personal copy',
    license: 'copyrighted',
    copyright: '© 2014 Gillian Flynn',
  },
};

const id = process.argv[2] ?? 'sherlock-holmes-adventures';
const config = BOOKS[id];
if (!config) {
  console.error(`Unknown book "${id}". Known: ${Object.keys(BOOKS).join(', ')}`);
  process.exit(1);
}

const raw = await readFile(join(root, config.file), 'utf8');
const { title, author, chapters } = config.load(raw);
const pages = paginate(chapters);

// Sanity checks: pagination must never lose, duplicate or reorder text.
const squash = (s) => s.replace(/\s+/g, '');
const expected = chapters.flatMap((c) => c.sections.flat()).map(squash).join('');
const actual = pages.map((p) => squash(p.text)).join('');
if (expected !== actual) {
  console.error('Pagination check failed: page text does not match source text');
  process.exit(1);
}

const wordCounts = pages.map((p) => countWords(p.text));
const oversized = pages.filter((_, i) => wordCounts[i] > 110);
const unbalancedItalics = pages.filter((p) => (p.text.match(/_/g) ?? []).length % 2);

const book = {
  id,
  title,
  author,
  source: config.source,
  sourceUrl: config.sourceUrl,
  license: config.license,
  copyright: config.copyright,
  pages,
};
await writeFile(join(root, config.output), JSON.stringify(book, null, 1) + '\n');

const avg = wordCounts.reduce((a, b) => a + b, 0) / pages.length;
console.log(`${title} — ${author}`);
console.log(`  chapters: ${chapters.length}`);
console.log(`  pages:    ${pages.length}`);
console.log(`  words/page: avg ${avg.toFixed(1)}, min ${Math.min(...wordCounts)}, max ${Math.max(...wordCounts)}`);
if (oversized.length) console.warn(`  warning: ${oversized.length} page(s) over 110 words: ${oversized.map((p) => p.index).join(', ')}`);
if (unbalancedItalics.length) console.warn(`  warning: italics split across pages on: ${unbalancedItalics.map((p) => p.index).join(', ')}`);
console.log(`  wrote ${config.output}`);
