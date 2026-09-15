import './style.css';

const feed = document.querySelector('.feed');
const chrome = document.querySelector('.chrome');
const progressFill = document.querySelector('.progress-fill');
const chapterLabel = document.querySelector('.chapter-label');
const jumpForm = document.querySelector('.jump');
const jumpInput = jumpForm.querySelector('input');

const MAX_FIT_LEVEL = 3; // how many times a page may shrink its type to fit the safe zone

const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const toRoman = (n) => ROMAN.reduce((out, [value, glyph]) => {
  for (; n >= value; n -= value) out += glyph;
  return out;
}, '');

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Page text -> paragraphs, with Gutenberg `_italic_` markup turned into <em>. */
const renderText = (text) =>
  text
    .split('\n\n')
    .map((para) => `<p>${escapeHtml(para).replace(/_([^_]+)_/g, '<em>$1</em>')}</p>`)
    .join('');

function buildFeed(book) {
  const total = book.pages.length;
  const sections = [
    `<section class="screen cover" data-page="0">
      <div class="safe">
        <div class="cover-inner">
          <h1>${escapeHtml(book.title)}</h1>
          <p class="author">${escapeHtml(book.author)}</p>
          <button type="button" class="jump-link" data-jump>Go to page…</button>
        </div>
      </div>
      <p class="hint" aria-hidden="true"><span class="chevron"></span>Swipe up to begin</p>
    </section>`,
  ];

  // A single-story book already has its title on the cover; skip the chapter card.
  const showChapterCards = book.pages.filter((page) => page.chapterTitle).length > 1;
  let chapterNumber = 0;
  for (const page of book.pages) {
    if (page.chapterTitle && showChapterCards) {
      chapterNumber += 1;
      sections.push(`<section class="screen chapter-card" data-page="${page.index}">
        <div class="safe">
          <div class="chapter-inner">
            <p class="numeral">${toRoman(chapterNumber)}</p>
            <h2>${escapeHtml(page.chapterTitle)}</h2>
          </div>
        </div>
      </section>`);
    }
    sections.push(`<section class="screen page" data-page="${page.index}" aria-label="Page ${page.index + 1} of ${total}">
      <div class="safe"><div class="text">${renderText(page.text)}</div></div>
      <button type="button" class="page-num" data-jump aria-label="Page ${page.index + 1} of ${total}. Go to another page">${page.index + 1}<span> / ${total}</span></button>
    </section>`);
  }

  sections.push(`<section class="screen end" data-page="${total - 1}">
    <div class="safe">
      <div class="end-inner">
        <p class="the-end">The End</p>
        <button type="button" class="restart">Read again</button>
        <p class="credit">${
          book.license === 'public-domain'
            ? `${escapeHtml(book.title)} is in the public domain. Text from
              <a href="${escapeHtml(book.sourceUrl ?? 'https://www.gutenberg.org')}" target="_blank" rel="noopener">${escapeHtml(book.source)}</a>.`
            : `${escapeHtml(book.title)} ${escapeHtml(book.copyright ?? '')}. ${escapeHtml(book.source)}, for private reading.`
        }</p>
      </div>
    </div>
  </section>`);

  feed.innerHTML = sections.join('');
  return [...feed.querySelectorAll('.screen')];
}

/**
 * Pages are budgeted by word count at build time, so on a small screen or with
 * large system text a page can still overflow its safe zone. Step the type
 * size down a notch at a time until it fits.
 */
function fit(section) {
  const safe = section.querySelector('.safe');
  const text = section.querySelector('.text');
  if (!text || section.dataset.fitted) return;
  let level = 0;
  section.style.removeProperty('--fit');
  while (text.offsetHeight > safe.clientHeight && level < MAX_FIT_LEVEL) {
    level += 1;
    section.style.setProperty('--fit', level);
  }
  section.dataset.fitted = 'true';
}

function start(book) {
  const screens = buildFeed(book);
  const total = book.pages.length;
  document.title = `${book.title} · Kitaabi Keeda`;

  // Chapter title that applies to each page, for the top-zone label.
  const chapterOf = [];
  for (const page of book.pages) chapterOf.push(page.chapterTitle ?? chapterOf.at(-1));

  // Screen index of each page, so a page number can be turned into a scroll target.
  const screenOfPage = [];
  screens.forEach((screen, i) => {
    if (screen.classList.contains('page')) screenOfPage[Number(screen.dataset.page)] = i;
  });

  let current = 0;
  const setActive = (index) => {
    current = index;
    const screen = screens[index];
    const page = Number(screen.dataset.page);
    const isCover = screen.classList.contains('cover');
    const isEnd = screen.classList.contains('end');
    progressFill.style.transform = `scaleX(${isCover ? 0 : (page + 1) / total})`;
    chapterLabel.textContent = isCover || isEnd || screen.classList.contains('chapter-card') ? '' : chapterOf[page];
    chrome.classList.toggle('hidden', isCover);
    // Keep the page in the URL (#57) so a reload or a saved link reopens it.
    try {
      history.replaceState(null, '', isCover ? location.pathname + location.search : `#${page + 1}`);
    } catch {
      // Some browsers rate-limit replaceState; the URL is only a convenience.
    }
  };

  const activeObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(screens.indexOf(entry.target));
      }
    },
    { root: feed, threshold: 0.6 },
  );

  // Measure fit a screen ahead, so type never visibly shrinks on arrival.
  const fitObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) fit(entry.target);
    },
    { root: feed, rootMargin: '100% 0px' },
  );

  for (const screen of screens) {
    activeObserver.observe(screen);
    if (screen.classList.contains('page')) fitObserver.observe(screen);
  }

  const goTo = (index, behavior = 'smooth') => {
    current = Math.max(0, Math.min(screens.length - 1, index));
    const target = screens[current];
    feed.scrollTo({ top: target.offsetTop, behavior });
  };

  const goToPage = (number) => {
    const index = screenOfPage[Math.max(1, Math.min(total, number)) - 1];
    goTo(index, 'instant');
    // Closing the on-screen keyboard resizes the viewport; land on the page again once it settles.
    setTimeout(() => goTo(index, 'instant'), 350);
  };

  const openJump = () => {
    const screen = screens[current];
    jumpInput.max = total;
    jumpInput.value = '';
    jumpInput.placeholder = screen.classList.contains('cover') ? '1' : String(Number(screen.dataset.page) + 1);
    jumpForm.querySelector('.jump-total').textContent = `of ${total}`;
    jumpForm.hidden = false;
    jumpInput.focus();
  };

  const closeJump = () => {
    jumpForm.hidden = true;
    feed.focus({ preventScroll: true });
  };

  feed.addEventListener('click', (event) => {
    if (event.target.closest('[data-jump]')) openJump();
  });

  jumpForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const number = parseInt(jumpInput.value, 10);
    closeJump();
    if (Number.isFinite(number)) goToPage(number);
  });

  // Close on a tap outside. (Not on focusout: iOS blurs the input before a tap on "Go" lands.)
  document.addEventListener('pointerdown', (event) => {
    if (!jumpForm.hidden && !jumpForm.contains(event.target)) closeJump();
  });

  jumpForm.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeJump();
  });

  const readHash = () => parseInt(location.hash.match(/^#(\d+)$/)?.[1], 10);
  window.addEventListener('hashchange', () => {
    const number = readHash();
    if (Number.isFinite(number)) goToPage(number);
  });

  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('button, a, input')) return;
    if (event.key === 'g') {
      event.preventDefault();
      openJump();
      return;
    }
    const step = {
      ArrowDown: 1, PageDown: 1, j: 1, ' ': event.shiftKey ? -1 : 1,
      ArrowUp: -1, PageUp: -1, k: -1,
    }[event.key];
    if (step) {
      event.preventDefault();
      goTo(current + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0, 'instant');
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(screens.length - 1, 'instant');
    }
  });

  feed.querySelector('.restart').addEventListener('click', () => goTo(0, 'instant'));

  // Viewport or font changes invalidate earlier fit measurements.
  let resizeTimer;
  const refit = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const screen of feed.querySelectorAll('[data-fitted]')) delete screen.dataset.fitted;
      for (let i = current - 3; i <= current + 3; i++) if (screens[i]) fit(screens[i]);
    }, 150);
  };
  window.addEventListener('resize', refit);
  document.fonts?.ready.then(refit);

  const initialPage = readHash();
  if (Number.isFinite(initialPage)) goToPage(initialPage);

  feed.focus({ preventScroll: true });
}

// Always revalidate: the book behind this URL gets swapped (rotation, private copies).
fetch('./book.json', { cache: 'no-cache' })
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
  .then(start)
  .catch((error) => {
    console.error(error);
    feed.innerHTML = '<p class="status">Couldn’t open the book. Please refresh to try again.</p>';
  });
