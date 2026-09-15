import assert from 'node:assert/strict';
import test from 'node:test';
import { countWords, paginate, parseGutenberg, parseLayoutText, parseStructure, splitSentences, titleCase } from './lib/paginate.mjs';

test('splitSentences keeps abbreviations and quoted dialogue intact', () => {
  assert.deepEqual(splitSentences('“Wedlock suits you,” he remarked. “I think, Watson, that you have put on weight.” Mr. Holmes smiled.'), [
    '“Wedlock suits you,” he remarked.',
    '“I think, Watson, that you have put on weight.”',
    'Mr. Holmes smiled.',
  ]);
  assert.deepEqual(splitSentences('Ask J. Clay. He knows.'), ['Ask J. Clay.', 'He knows.']);
});

test('titleCase lowercases small words after the first', () => {
  assert.equal(titleCase('THE ADVENTURE OF THE ENGINEER’S THUMB'), 'The Adventure of the Engineer’s Thumb');
  assert.equal(titleCase('A SCANDAL IN BOHEMIA'), 'A Scandal in Bohemia');
  assert.equal(titleCase('THE RED-HEADED LEAGUE'), 'The Red-Headed League');
});

test('parseGutenberg strips header and footer', () => {
  const raw = 'Title: Test Book\r\nAuthor: Someone\r\n*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\r\nBody.\r\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***\r\nLicense';
  assert.deepEqual(parseGutenberg(raw), { title: 'Test Book', author: 'Someone', body: 'Body.\n' });
});

test('parseLayoutText joins wrapped lines and splits on indentation', () => {
  const raw = 'Front matter\nDEDICATION\n\f    First para wraps\nonto a hand-\njob line.\n\n\fstill first.\n    Second.\nTHE END\nPromo';
  const paragraphs = parseLayoutText(raw, { start: /^DEDICATION$/, end: /^THE END$/, isParagraphStart: (indent) => indent === 4 });
  assert.deepEqual(paragraphs, ['First para wraps onto a hand-job line. still first.', 'Second.']);
});

test('parseStructure drops front matter and splits sections', () => {
  const body = 'Contents\n\nI. ONE\n\nI.\n\nFirst para\nwraps.\n\nII.\n\nSecond.\n\nII. TWO\n\nThird.';
  const chapters = parseStructure(body, { chapterPattern: /^[IVX]+\.\s+([A-Z ]+)$/, sectionPattern: /^[IVX]+\.$/ });
  assert.deepEqual(chapters, [
    { title: 'One', sections: [['First para wraps.'], ['Second.']] },
    { title: 'Two', sections: [['Third.']] },
  ]);
});

test('paginate respects the budget and never loses text', () => {
  const sentence = 'The quick brown fox jumps over the lazy dog again.'; // 10 words
  const paragraphs = Array.from({ length: 30 }, () => `${sentence} ${sentence} ${sentence}`);
  const long = Array.from({ length: 40 }, (_, i) => `clause ${i}`).join(', ') + '—and then it ended.';
  const chapters = [{ title: 'One', sections: [[...paragraphs, long]] }];
  const pages = paginate(chapters);

  assert.ok(pages.length > 5);
  assert.equal(pages[0].chapterTitle, 'One');
  assert.ok(pages.slice(1).every((p) => !p.chapterTitle));
  for (const page of pages) assert.ok(countWords(page.text) <= 100, `page ${page.index} too long`);

  const squash = (s) => s.replace(/\s+/g, '');
  assert.equal(pages.map((p) => squash(p.text)).join(''), [...paragraphs, long].map(squash).join(''));
  assert.ok(pages.map((p) => p.text).join(' ').includes('clause 39—and'));
});

test('paginate starts every section on a fresh page', () => {
  const pages = paginate([{ title: 'One', sections: [['Short.'], ['Also short.']] }]);
  assert.deepEqual(pages.map((p) => p.text), ['Short.', 'Also short.']);
});
