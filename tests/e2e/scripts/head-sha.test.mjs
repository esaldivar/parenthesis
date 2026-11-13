import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { headSha } from './head-sha.mjs';

const a = 'a'.repeat(40);
const b = 'b'.repeat(40);
const write = (path, text) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
};
const checkout = () => {
  const root = mkdtempSync(join(tmpdir(), 'head-sha-'));
  mkdirSync(join(root, '.git'));
  return root;
};

test('reads a detached HEAD, as CI checks out a commit', () => {
  const root = checkout();
  write(join(root, '.git', 'HEAD'), `${a}\n`);
  assert.equal(headSha(root), a);
});

test('follows a branch to its loose ref, from a subfolder', () => {
  const root = checkout();
  write(join(root, '.git', 'HEAD'), 'ref: refs/heads/feat/x\n');
  write(join(root, '.git', 'refs', 'heads', 'feat', 'x'), `${b}\n`);
  mkdirSync(join(root, 'tests', 'e2e'), { recursive: true });
  assert.equal(headSha(join(root, 'tests', 'e2e')), b);
});

test('falls back to packed refs', () => {
  const root = checkout();
  write(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  write(join(root, '.git', 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted\n${a} refs/heads/develop\n${b} refs/heads/main\n`);
  assert.equal(headSha(root), b);
});

test('follows a worktree to its own HEAD and the shared refs', () => {
  const main = checkout();
  write(join(main, '.git', 'refs', 'heads', 'fix'), `${a}\n`);
  const wtGit = join(main, '.git', 'worktrees', 'fix');
  write(join(wtGit, 'HEAD'), 'ref: refs/heads/fix\n');
  write(join(wtGit, 'commondir'), '../..\n');
  const worktree = mkdtempSync(join(tmpdir(), 'head-sha-wt-'));
  write(join(worktree, '.git'), `gitdir: ${wtGit}\n`);
  assert.equal(headSha(worktree), a);
});

test('fails clearly when the branch has no commit or there is no checkout', () => {
  const root = checkout();
  write(join(root, '.git', 'HEAD'), 'ref: refs/heads/empty\n');
  assert.throws(() => headSha(root), /refs\/heads\/empty has no commit/);
  write(join(root, '.git', 'HEAD'), 'garbage\n');
  assert.throws(() => headSha(root), /Unrecognised HEAD/);
});
