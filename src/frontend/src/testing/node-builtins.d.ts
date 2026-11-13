// The few Node built-ins that specs use to read source files (storage-inventory.spec.ts), without adding @types/node.
// Vitest runs specs in Node, so these exist at test time. Excluded from the app build (tsconfig.app.json).
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}
declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
}
declare const process: { cwd(): string };
