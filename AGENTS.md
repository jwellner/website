# AGENTS.md

Guidance for AI assistants working on [wllnr.nl](https://www.wllnr.nl).

## Project

Personal static site for Jeroen Wellner. Eleventy builds Markdown + Nunjucks into `build/`. CSS (Sass) and JS (Rollup) are compiled in `eleventy.config.js` and **inlined** into HTML in production.

Deploy: tag `v*` → GitHub Actions builds a Docker/nginx image → Flux on `beast` rolls it out. Image: `ghcr.io/jwellner/website/website:<tag>`.

## Commands

```bash
yarn install
yarn start          # http://localhost:3000
yarn build          # output → build/
```

Node `>=18`. Package manager is **yarn** (keep `yarn.lock` in sync; Docker uses `yarn install --frozen-lockfile`).

## Layout

| Path | Role |
|------|------|
| `src/content/` | Pages (Markdown + front matter). Home uses `layout: home.njk`. |
| `src/content/sections/` | Pages of the `website` TUI app (Markdown, ordered by `order`). Each is also a real page at `/<slug>/` (via `sections.json`), and all are embedded in every page for the app. |
| `src/content/_data/site.json` | Site-wide metadata (`site.*` in templates). |
| `layouts/` | Nunjucks layouts (`layout.njk`, `home.njk`, `page.njk`). |
| `src/js/` | Fullscreen terminal. Entry: `main.js` → Rollup bundle. |
| `src/js/shell/` | Parser, in-memory filesystem (`rootfs.js`), env, history, tab completion. No DOM. |
| `src/js/view/` | `terminal.js`: DOM, keyboard handling, fullscreen app screens. |
| `src/js/commands/` | One module per command group; `index.js` is the registry. |
| `src/scss/` | Styles. Entry: `index.scss`. |
| `public/assets/` | Static assets (passthrough). |
| `eleventy.config.js` | Build: Sass, Rollup, inline CSS/JS, HTML minify. |
| `Dockerfile` / `docker/default.conf` | nginx image serving `build/`. |

## Conventions

- Prefer small, focused changes. Match existing style (4-space JS, 2-space SCSS/JSON).
- A command is `{ help, usage, run(ctx) }` in `src/js/commands/`; `help`/`usage` feed `help` and `man`, so there is no separate help file. Use `ctx.out.print()` / `ctx.err.print()` (they escape and linkify). `ctx.out.html()` / `term.printHtml()` take trusted markup only: run anything user-controlled (file names, args, user name) through `escapeHtml()` first.
- Commands that run for a while must honour `ctx.signal` (use `await ctx.sleep(ms)`) so Ctrl+C works. Fullscreen apps use `term.openScreen()` and must close on `q`/Ctrl+C.
- The filesystem is static and in memory (`src/js/shell/rootfs.js`); nothing but command history and the last-login time is persisted (localStorage).
- The address bar follows the app via `history.replaceState` only (no history entries). Directory URLs rely on `absolute_redirect off` in `docker/default.conf`, because TLS terminates in front of the container.
- Do not reintroduce document-level click/keyup handlers that steal focus; listeners stay on the terminal element.
- Site copy/SEO: update `site.json` and page front matter rather than hardcoding in layouts when possible.
- Title, tagline and quote live in `site.json` and are rendered by `home.njk`; `main.js` reads them from the static fallback markup (no-JS/SEO) and then replaces it. Section pages and the home page share `home.njk`; `404.md` uses it with `mode: "404"`, which makes the terminal print a shell-style error instead of opening the app (nginx still returns status 404).

## Out of scope unless asked

- Force-push / rewriting deploy tags
- Adding a JS framework or replacing Eleventy
- Expanding the fake filesystem into a real CMS
