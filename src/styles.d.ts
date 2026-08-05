/**
 * Ambient declaration for the side-effect stylesheet import in `src/visual.ts`.
 *
 * The `style` field in `pbiviz.json` is only honoured by the official
 * `pbiviz package` command. This repository packages through `scripts/package.js`
 * instead, so the only thing that pulls `style/visual.less` into the webpack module
 * graph — and therefore the only thing that makes `dist/visual.css` exist — is the
 * explicit `import` in the visual entry point. Without this declaration TypeScript
 * cannot resolve that import.
 */
declare module "*.less";
