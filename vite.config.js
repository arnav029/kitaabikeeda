import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const PRIVATE_BOOK = new URL('./private/book.json', import.meta.url);

// A personal copy of a copyrighted book (built with `npm run book -- <id>`) is
// served in place of public/book.json by the dev server only, so it never gets
// copied into dist/ or deployed.
const privateBook = () => ({
  name: 'private-book',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/book.json', (req, res, next) => {
      if (!existsSync(PRIVATE_BOOK)) return next();
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(readFileSync(PRIVATE_BOOK));
    });
  },
});

export default defineConfig({
  // Relative asset paths so the build works from any static host sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [privateBook()],
});
