# Contributing

## Windows: enable long paths first

The sample report embeds the visual under
`samples/AtlynSample.Report/CustomVisuals/<GUID>/resources/<GUID>.pbiviz.json`. The GUID is 51
characters and appears twice in that path, so with a deep clone directory the full path exceeds
the legacy Windows `MAX_PATH` limit of 260 and git fails with `Filename too long` on `git add`.
Node reads and writes the file fine; only git's default configuration trips.

```text
git config --global core.longpaths true
```

Linux and macOS are unaffected, as is CI.

## Gates

Run the repository gates before submitting a change:

```text
npm ci
npm test -- --coverage
npm run typecheck
npm run eslint
npm run build
npm run package
npm run render:check
npm audit
```

`npm run render:check` must run after `npm run package`: it renders the packaged
`content.js` and `content.css` out of `dist/atlyn-cohort-retention.pbiviz` in headless
Chromium and refuses to fall back to the source tree. It is the only gate that observes
layout, because jsdom performs no layout — sticky positioning, z-index stacking, and
containing-block resolution are invisible to `npm test`.

If you add a fixture to it, make it overflow its scrollport and keep the
`scrollHeight > clientHeight` assertion ahead of every sticky assertion. A fixture that
fits its viewport never scrolls, `position: sticky` never engages, and the whole check
passes vacuously — that is exactly how three live sticky-header defects survived an
earlier render check. `npm run screenshots` cannot cover this: submission captures are
non-scrolling by construction.

Keep the metric contract explicit, preserve matrix identities and hierarchy
metadata, and do not add runtime network access or privileges. Automated tests
use mocked Power BI APIs and do not represent Microsoft certification or live
host validation.
