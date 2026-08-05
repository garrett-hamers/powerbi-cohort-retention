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
npm audit
```

Keep the metric contract explicit, preserve matrix identities and hierarchy
metadata, and do not add runtime network access or privileges. Automated tests
use mocked Power BI APIs and do not represent Microsoft certification or live
host validation.
