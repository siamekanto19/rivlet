// Vite's `?raw` import of the migration SQL. Kept in a script-context .d.ts (no
// top-level import/export) so it is a global ambient module declaration.
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
