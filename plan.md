# Vertical Book Scroll — Product & Build Plan

## 1. Concept

A single-purpose web app that lets you "scroll" through a book the way you'd
scroll Reels/Shorts — one snap-scroll screen at a time, each screen holding a
small, comfortably readable chunk of the book's text. No chapters list, no
table of contents, no settings menu on the reading screen itself — just an
endless vertical feed of text you flick through, in either direction, until
the book runs out.

**V1 scope (per your brief):** one hardcoded book, no backend, no accounts.
**Future scope:** swap the book daily/weekly, eventually a content pipeline
and maybe a backend + multiple users.

---

## 2. A note on the source book (read this first)

You mentioned pulling a Chetan Bhagat book off the internet. He's a living,
actively-publishing author and his books are under normal commercial
copyright — reproducing his text (even chapter excerpts) in an app is
copyright infringement, personal project or not, and gets riskier the moment
anyone other than you opens the app.

**Recommendation for V1:** use a **public-domain** book instead — legally
free to copy, chop up, and redistribute however you like. Good candidates
that also happen to read well in short bursts:
- *The Adventures of Sherlock Holmes* — Arthur Conan Doyle
- *Pride and Prejudice* — Jane Austen
- *Alice's Adventures in Wonderland* — Lewis Carroll
- *The Great Gatsby* — F. Scott Fitzgerald (US public domain since 2021)

All available as clean plain text from **Project Gutenberg** (gutenberg.org).
This doesn't block anything in the plan below — the pipeline is written so
the book source is a swappable JSON file, so you (or future-you) can drop in
a properly licensed Chetan Bhagat–style book later if you get the rights, or
just keep rotating public-domain classics.

---

## 3. Core UX principles

1. **One idea per screen.** Each screen = one "page" of the feed. Never more
   text than fits without scrolling *within* the screen — internal scroll
   would break the reels feel.
2. **Breathing room top & bottom.** Text block is vertically centered in a
   safe zone — roughly the middle 60–70% of the viewport height. Top ~15%
   and bottom ~15% of the screen stay clear of text (reserved for subtle UI
   chrome: progress indicator, maybe a tap-to-pause hint — never body text).
3. **Snap, don't drift.** Each swipe/scroll gesture locks to exactly one
   page — CSS scroll-snap (`scroll-snap-type: y mandatory`), not free
   scrolling with inertia that leaves you mid-page.
4. **Bidirectional.** Swipe up = next page, swipe down = previous page,
   freely, at any point — same as re-watching a Reel.
5. **Natural stopping point.** Last page of the book ends the feed — no
   auto-loop, maybe a simple "The End" card with a restart affordance.
6. **Typography carries the whole product.** With almost no UI, font choice,
   size, line-height, and contrast *are* the design. Large-ish serif or
   humanist sans, generous line-height (1.5–1.7), constrained line length
   (45–65 characters) for readability.

---

## 4. Pagination — the hardest real problem

Reels works because each video is pre-authored to fit a screen. A book isn't
— so we have to *split* raw text into screen-sized chunks algorithmically.
Two viable approaches:

### Approach A — Fixed word/character budget (simple, ship this first)
Split the book into pages of roughly N words (tune by testing — likely
60–110 words depending on font size), breaking on paragraph or sentence
boundaries so pages never cut a sentence mid-word. Good enough for V1 and
works identically on every device since you're budgeting by word count, not
pixels.

### Approach B — Real viewport-fit measurement (better, do later)
At runtime, render candidate text into an offscreen/hidden measuring node at
the actual device's font-size and viewport width, and greedily add words
until it would overflow the safe zone, then cut. This adapts perfectly to
any screen size and font size (including accessibility text-scaling) but
adds real engineering complexity (must re-paginate on resize/orientation
change/font-size change).

**Recommendation:** ship Approach A now, note Approach B as a fast-follow
once the core feel is validated.

Either way, pagination happens **once**, ahead of time (at build time or on
first load), producing a flat array of page objects — not recomputed on
every render.

---

## 5. Data model

```json
// book.json — the swappable content source
{
  "id": "sherlock-holmes-adventures",
  "title": "The Adventures of Sherlock Holmes",
  "author": "Arthur Conan Doyle",
  "source": "Project Gutenberg",
  "license": "public-domain",
  "pages": [
    { "index": 0, "text": "...", "chapterTitle": "A Scandal in Bohemia" },
    { "index": 1, "text": "..." }
  ]
}
```

- `pages` is the pre-split, ready-to-render array (output of the pagination
  step in §4, not raw book text).
- `chapterTitle` only present on a page that starts a new chapter — used for
  a small, unobtrusive label, not a nav menu.
- This same shape is what a future "daily book" pipeline would generate and
  serve — V1 just imports one static file of this shape.

---

## 6. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | React (Vite) or plain HTML/CSS/JS | Either works for V1; React only pays off once you add rotation/backend later |
| Scroll mechanic | CSS `scroll-snap-type: y mandatory` + `overflow-y: scroll` on a full-height container, one `100vh` section per page | Native, GPU-accelerated, no JS scroll-hijacking needed — smoothest possible feel |
| Page tracking | `IntersectionObserver` on each page section to know which page is "active" (for progress indicator) | Cheap, no scroll-event polling |
| Styling | Plain CSS or Tailwind | Typography-first design, minimal chrome |
| Pagination script | Small Node script run at build time, reads raw `.txt` from Gutenberg, outputs `book.json` per §5 | Keeps runtime simple — no client-side text-splitting needed |
| Hosting | Static hosting (Vercel/Netlify/GitHub Pages) | No backend needed for V1 |

---

## 7. Screen layout (single page/section)

```
┌─────────────────────────┐
│  ░░ safe top zone ░░     │  ~15vh — progress dots / chapter label only
│                          │
│     [ page text,         │  ~65-70vh — vertically centered text block,
│       centered,          │  constrained width, large readable font
│       readable ]         │
│                          │
│  ░░ safe bottom zone ░░  │  ~15vh — subtle "swipe up" hint on page 1 only
└─────────────────────────┘
```

---

## 8. Build phases

**Phase 1 — Content pipeline**
- Pick the public-domain book, download clean `.txt` from Project Gutenberg
- Write the pagination script (Approach A)
- Output `book.json`

**Phase 2 — Core scroll experience**
- Scaffold the app, build the scroll-snap container + page sections
- Typography pass — get font, size, line-height, margins feeling right
  *before* wiring up anything fancy
- Progress indicator (thin bar or dot cluster) driven by IntersectionObserver

**Phase 3 — Polish**
- "The End" card + restart
- Chapter-start label treatment
- Test on real phone (this concept lives or dies on mobile feel — test on
  device, not just browser devtools)
- Handle very short/very long pages gracefully (widow/orphan lines)

**Phase 4 — Future (not V1)**
- Daily/weekly book rotation (swap `book.json` on a schedule — could be as
  simple as a cron job regenerating the file, no backend required yet)
- Multiple books / a picker
- Bookmarking / resume position (would need `localStorage` at minimum)
- Analytics on drop-off point per page (which page people stop at)

---

## 9. Open questions for you

- Word-budget per page (§4) — want to start around ~80 words and tune by feel?
- Visual style direction — minimal/literary (cream background, serif type)
  vs. dark-mode/modern (black background, sans type)? This shapes the whole
  typography pass in Phase 2.
- Any interest in a subtle "chapter transition" moment (brief pause/visual
  beat) or should every page feel identical regardless of chapter boundary?