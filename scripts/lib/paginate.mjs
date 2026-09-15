// Approach A pagination (plan §4): split a book into screen-sized pages by a
// word budget, breaking only on sentence boundaries where possible.

export const DEFAULTS = {
  targetWords: 80, // aim for this much "cost" per page
  maxWords: 100, // never exceed this, except for a single unsplittable unit
  minFill: 50, // below this, allow going past target (up to max) to fill a page
  orphanWords: 30, // a trailing page smaller than this gets merged backwards
  paragraphCost: 6, // extra budget a new paragraph eats (gap + ragged last line)
};

const ABBREVIATIONS = new Set([
  'Mr', 'Mrs', 'Messrs', 'Dr', 'St', 'Mme', 'Esq', 'Col', 'Capt', 'Rev', 'Prof', 'Co', 'Jr', 'Sr',
]);

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

export function countWords(text) {
  return text.split(/[\s—]+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function titleCase(text) {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/(?<=^|-)\p{L}/gu, (c) => c.toUpperCase())))
    .join(' ');
}

/** Strip the Project Gutenberg header/footer and read title/author metadata. */
export function parseGutenberg(raw) {
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n?/g, '\n');
  const start = text.search(/^\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK.*$/m);
  const end = text.search(/^\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK.*$/m);
  if (start < 0 || end < 0) throw new Error('Could not find Project Gutenberg START/END markers');

  const header = text.slice(0, start);
  const body = text.slice(text.indexOf('\n', start) + 1, end);
  return {
    title: header.match(/^Title:\s*(.+)$/m)?.[1].trim(),
    author: header.match(/^Author:\s*(.+)$/m)?.[1].trim(),
    body,
  };
}

/**
 * Paragraphs from `pdftotext -layout` output, where page breaks and blank lines
 * are layout noise and only a line's indentation marks a new paragraph.
 * `start`/`end` match the lines just before and at the end of the body text.
 */
export function parseLayoutText(raw, { start, end, isParagraphStart }) {
  const lines = raw.replace(/\r\n?/g, '\n').replace(/\f/g, '').split('\n');
  const from = lines.findIndex((line) => start.test(line));
  const to = lines.findIndex((line, i) => i > from && end.test(line));
  if (from < 0 || to < 0) throw new Error('Could not find start/end markers in layout text');

  const paragraphs = [];
  for (const line of lines.slice(from + 1, to)) {
    const text = line.trim();
    if (!text) continue;
    const indent = line.length - line.trimStart().length;
    const last = paragraphs.length - 1;
    if (last < 0 || isParagraphStart(indent)) {
      paragraphs.push(text);
    } else {
      // Lines ending in a hyphen or dash continue the word without a space.
      paragraphs[last] += (/[-—]$/.test(paragraphs[last]) ? '' : ' ') + text;
    }
  }
  return paragraphs;
}

/**
 * Turn a book body into chapters of sections of paragraphs.
 * Anything before the first chapter heading (title page, contents) is dropped.
 */
export function parseStructure(body, { chapterPattern, sectionPattern }) {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chapters = [];
  for (const para of paragraphs) {
    const heading = para.match(chapterPattern);
    if (heading) {
      chapters.push({ title: titleCase(heading[1]), sections: [[]] });
      continue;
    }
    const chapter = chapters.at(-1);
    if (!chapter) continue;
    if (sectionPattern?.test(para)) {
      if (chapter.sections.at(-1).length) chapter.sections.push([]);
      continue;
    }
    chapter.sections.at(-1).push(para);
  }
  if (!chapters.length) throw new Error('No chapter headings matched chapterPattern');
  return chapters;
}

/** Split a paragraph into sentences. Each piece keeps its own punctuation. */
export function splitSentences(paragraph) {
  const sentences = [];
  const boundary = /[.!?]+[”’"')\]]*\s+(?=[“‘"'(\[_]?[\p{Lu}\p{N}])/gu;
  let last = 0;
  for (const match of paragraph.matchAll(boundary)) {
    const endsWithQuote = /[”’"')\]]\s*$/.test(match[0]);
    const before = paragraph.slice(last, match.index).match(/([\p{L}]+)$/u)?.[1];
    const isAbbreviation = !endsWithQuote && before && (ABBREVIATIONS.has(before) || /^\p{Lu}$/u.test(before));
    if (isAbbreviation) continue;
    const cut = match.index + match[0].length;
    sentences.push(paragraph.slice(last, cut).trim());
    last = cut;
  }
  const rest = paragraph.slice(last).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

/**
 * Break an over-long sentence into chunks no longer than `limit` words,
 * preferring clause punctuation, falling back to plain word boundaries.
 * Returns [{ text, glue }] where glue is what joins it to the previous chunk.
 */
function splitLong(sentence, limit) {
  const pieces = [];
  const clause = /(?<=[,;:])\s+|(?<=—)(?=\S)/g;
  let last = 0;
  for (const match of sentence.matchAll(clause)) {
    pieces.push({ text: sentence.slice(last, match.index), glue: pieces.length ? pieceGlue(sentence, last) : '' });
    last = match.index + match[0].length;
  }
  pieces.push({ text: sentence.slice(last), glue: pieces.length ? pieceGlue(sentence, last) : '' });

  const words = [];
  for (const piece of pieces) {
    if (countWords(piece.text) <= limit) {
      words.push(piece);
      continue;
    }
    piece.text.split(' ').forEach((w, i) => words.push({ text: w, glue: i ? ' ' : piece.glue }));
  }

  const chunks = [];
  for (const piece of words) {
    const current = chunks.at(-1);
    if (current && countWords(current.text + piece.glue + piece.text) <= limit) {
      current.text += piece.glue + piece.text;
    } else {
      chunks.push({ ...piece });
    }
  }
  return chunks;
}

function pieceGlue(sentence, index) {
  return sentence[index - 1] === '—' ? '' : ' ';
}

/** Flatten a section's paragraphs into packable units. */
function toUnits(paragraphs, opts) {
  const units = [];
  for (const paragraph of paragraphs) {
    splitSentences(paragraph).forEach((sentence, i) => {
      const glue = ' ';
      const chunks = countWords(sentence) > opts.maxWords ? splitLong(sentence, opts.targetWords) : [{ text: sentence, glue: '' }];
      chunks.forEach((chunk, j) => {
        units.push({
          text: chunk.text,
          glue: j ? chunk.glue : glue,
          words: countWords(chunk.text),
          paraStart: i === 0 && j === 0,
          paraEnd: false,
        });
      });
    });
    units.at(-1).paraEnd = true;
  }
  return units;
}

function pageCost(units, opts) {
  return units.reduce((sum, u, i) => sum + u.words + (i > 0 && u.paraStart ? opts.paragraphCost : 0), 0);
}

function renderUnits(units) {
  return units.reduce((text, u, i) => (i === 0 ? u.text : text + (u.paraStart ? '\n\n' : u.glue) + u.text), '');
}

/** Greedy-pack units into pages, then fold a tiny trailing page backwards. */
function packSection(units, opts) {
  const pages = [];
  let current = [];
  for (const unit of units) {
    if (current.length) {
      const cost = pageCost(current, opts);
      const next = pageCost([...current, unit], opts);
      // Past the target is fine (up to max) to fill a thin page or to finish a paragraph.
      const fits = next <= opts.targetWords || ((cost < opts.minFill || unit.paraEnd) && next <= opts.maxWords);
      if (!fits) {
        pages.push(current);
        current = [];
      }
    }
    current.push(unit);
  }
  if (current.length) pages.push(current);

  if (pages.length > 1) {
    const tail = pages.at(-1);
    const prev = pages.at(-2);
    if (pageCost(tail, opts) < opts.orphanWords && pageCost([...prev, ...tail], opts) <= opts.maxWords) {
      pages.splice(-2, 2, [...prev, ...tail]);
    }
  }
  return pages;
}

export function paginate(chapters, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const pages = [];
  for (const chapter of chapters) {
    chapter.sections.forEach((section, s) => {
      packSection(toUnits(section, opts), opts).forEach((units, p) => {
        const page = { index: pages.length, text: renderUnits(units) };
        if (s === 0 && p === 0) page.chapterTitle = chapter.title;
        pages.push(page);
      });
    });
  }
  return pages;
}
