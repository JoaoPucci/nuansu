// Ambient module declarations for CSS-only packages imported for side
// effects in `apps/web/src/main.tsx`. TypeScript 6 tightened side-effect
// import checking and needs an explicit declaration for bare specifiers
// that resolve to non-`.ts`/`.js` entrypoints (the fontsource packages
// have `"main": "index.css"` and ship no `.d.ts`).
declare module "@fontsource-variable/*";
