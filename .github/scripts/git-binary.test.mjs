import { test } from "node:test";
import assert from "node:assert/strict";
import { GIT_LOCATIONS, gitBinary } from "./git-binary.mjs";

test("picks the first fixed location that exists", () => {
  const present = new Set(["/usr/local/bin/git", "/opt/homebrew/bin/git"]);
  assert.equal(gitBinary("linux", (p) => present.has(p)), "/usr/local/bin/git");
  assert.equal(gitBinary("darwin", (p) => p === "/usr/bin/git"), "/usr/bin/git");
});

test("uses Git for Windows' install folder on Windows", () => {
  assert.equal(gitBinary("win32", (p) => p === GIT_LOCATIONS.win32[1]), "C:\\Program Files\\Git\\bin\\git.exe");
});

test("every location is absolute, never a bare name looked up on PATH", () => {
  for (const p of [...GIT_LOCATIONS.default]) assert.ok(p.startsWith("/"), p);
  for (const p of GIT_LOCATIONS.win32) assert.match(p, /^[A-Z]:\\/);
});

test("fails clearly when git isn't installed in a fixed location", () => {
  assert.throws(() => gitBinary("linux", () => false), /git wasn't found in \/usr\/bin\/git/);
});
