/**
 * Jest stand-in for the side-effect `style/visual.less` import in `src/visual.ts`.
 * Webpack compiles that import into `dist/visual.css`; under Jest there is no loader
 * chain, so the module simply resolves to an empty object.
 */
module.exports = {};
