// The checked-out commit, read from git's own files instead of running a git program found on PATH
// (SonarQube S4036). Handles a normal checkout, a worktree, a detached HEAD and packed refs.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const SHA = /^[0-9a-f]{40}$/;
const read = path => readFileSync(path, 'utf8').trim();

/** The .git directory for `start` or a folder above it, following a worktree's `gitdir:` file. */
export function gitDirectory(start = process.cwd()) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const dotGit = join(dir, '.git');
    if (existsSync(dotGit)) {
      if (statSync(dotGit).isDirectory()) return dotGit;
      const pointer = /^gitdir:\s*(.+)$/m.exec(read(dotGit));
      if (pointer?.[1]) return resolve(dir, pointer[1].trim());
    }
    if (dirname(dir) === dir) throw new Error(`No git checkout found at or above ${start}.`);
  }
}

/** The 40-character SHA that HEAD points to. */
export function headSha(start = process.cwd()) {
  const gitDir = gitDirectory(start);
  const head = read(join(gitDir, 'HEAD'));
  if (SHA.test(head)) return head;
  const ref = /^ref:\s*(\S+)$/.exec(head)?.[1];
  if (!ref) throw new Error(`Unrecognised HEAD in ${gitDir}.`);
  // A worktree keeps its own HEAD but shares refs with the main checkout.
  const common = existsSync(join(gitDir, 'commondir')) ? resolve(gitDir, read(join(gitDir, 'commondir'))) : gitDir;
  for (const dir of [gitDir, common]) {
    const loose = join(dir, ref);
    if (existsSync(loose) && SHA.test(read(loose))) return read(loose);
  }
  const packed = join(common, 'packed-refs');
  if (existsSync(packed)) {
    for (const line of read(packed).split('\n')) {
      const [sha, name] = line.split(' ');
      if (name === ref && sha && SHA.test(sha)) return sha;
    }
  }
  throw new Error(`${ref} has no commit in ${gitDir}.`);
}
