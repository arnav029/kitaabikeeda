# Kitaabi Keeda

Scroll through a book the way you scroll Reels: one snap-scrolled screen at a
time, each holding a small, readable chunk of text. See [plan.md](plan.md).

V1 ships *The Adventures of Sherlock Holmes* (public domain, via Project Gutenberg).

## Commands

```sh
npm install
npm run dev      # local dev server
npm run build    # static build in dist/ (relative paths, deploy anywhere)
npm test         # pagination unit tests
npm run book     # regenerate public/book.json from content/*.txt
```

## How it works

- **Content pipeline**: `scripts/build-book.mjs` reads the raw Gutenberg text in
  `content/`, strips the licence header and footer, finds chapters and sections,
  and paginates with `scripts/lib/paginate.mjs`. It writes `public/book.json`
  (the shape in plan §5), and fails if any text was lost or reordered.
- **Pagination (Approach A)**: sentences are packed greedily up to about 80 words
  per page (hard cap 100). Each new paragraph counts as extra words because of
  its gap. A page may run past the target to finish a paragraph, a sentence that
  is too long is split at commas and dashes, a tiny last page is merged into the
  one before it, and every story section starts on a new page. Tune these in
  `DEFAULTS`.
- **Reader**: plain JS + CSS, no framework. The feed uses
  `scroll-snap-type: y mandatory` with `scroll-snap-stop: always`, so one flick
  moves exactly one screen. Text stays inside the middle 70% of the screen. An
  `IntersectionObserver` drives the progress bar and the chapter label.
- **Fit safety net**: if a page would still overflow its safe zone on a small
  screen, its text size is reduced by up to three small steps. This is measured
  one screen ahead, so the text never visibly shrinks.
- **Page numbers**: each page shows `12 / 169` at the bottom. Tap it (or the
  cover's "Go to page…", or press `g`) to jump to any page. The URL keeps the
  current page (`#12`), so a reload or a saved link reopens it.
- **Keys** (desktop): ↑/↓, PgUp/PgDn, Space, j/k, Home/End, g (go to page).

## Swapping the book

Put a Gutenberg `.txt` file in `content/` and add an entry to `BOOKS` in
`scripts/build-book.mjs` (with chapter and section heading patterns). Then run
`npm run book -- <id>`. Only the static `public/book.json` needs to change on
the host.

### Personal copies of copyrighted books

For a book you own but that isn't public domain, put the files in `private/`.
That folder is git-ignored. For example, *The Grownup*:

```sh
pdftotext -enc UTF-8 -layout private/grownup.pdf private/grownup.layout.txt
npm run book -- grownup   # writes private/book.json
npm run dev
```

While `private/book.json` exists, the **dev server only** serves it in place
of `public/book.json`. `npm run build` still ships the public-domain book, so a
personal copy never ends up in `dist/` or a deployment. Delete
`private/book.json` to go back to the public book locally.
