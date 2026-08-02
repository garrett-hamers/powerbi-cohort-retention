# Contributing

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
