# wllnr.nl

Source code for the personal website of Jeroen Wellner, [wllnr.nl](https://www.wllnr.nl).

It is a static site that opens as a fullscreen, in-browser terminal. Pages are also real HTML (`/about/`, `/stack/`, ...), so the site works without JavaScript and is indexable.

## Stack

- [Eleventy](https://www.11ty.dev/) builds Markdown + Nunjucks into `build/`
- Sass for styles, Rollup for the terminal JS; both are compiled in `eleventy.config.js` and inlined into the HTML in production
- nginx in a Docker image serves the result

## Development

Requires Node `>=18` and [yarn](https://yarnpkg.com/).

```bash
yarn install
yarn start    # dev server on http://localhost:3000
yarn build    # production build → build/
```

## Project layout

| Path | Contents |
|------|----------|
| `src/content/` | Pages (Markdown + front matter) |
| `src/content/sections/` | Pages of the terminal's `website` app; each is also a page at `/<slug>/` |
| `src/content/_data/site.json` | Site-wide metadata, title, tagline and quote |
| `layouts/` | Nunjucks layouts |
| `src/js/shell/` | Parser, in-memory filesystem, env, history, tab completion |
| `src/js/view/` | Terminal DOM, keyboard handling, fullscreen screens |
| `src/js/commands/` | Terminal commands, one module per group |
| `src/scss/` | Styles |
| `public/assets/` | Static assets, copied as-is |
| `docker/`, `Dockerfile` | nginx image config |

See [AGENTS.md](AGENTS.md) for conventions, including how to add a terminal command.

## Deploy

Publish a release tag to build and push a versioned image to GHCR. Flux on the `beast` cluster watches those tags and updates the Deployment.

```bash
git tag v1.0.0
git push origin v1.0.0
# optional:
# gh release create v1.0.0 --generate-notes
```

CI only runs for tags matching `v*` (for example `v1.0.1`). Image: `ghcr.io/jwellner/website/website:<tag>`.

The tag is passed to the build as `VERSION`/`COMMIT` and shown in the site footer and the `version`, `help` and `neofetch` commands. Local builds show `dev`.

## License

MIT
