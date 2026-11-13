import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify, command, report, run } from './pr-risk.mjs';

// #141, report-only. Synthetic file lists, shaped like GitHub's "list pull request files" response.
const file = (filename, extra = {}) => ({ filename, status: 'modified', ...extra });
const ids = files => classify(files).map(r => r.id);

test('a normal UI change has no risk areas', () => {
  assert.deepEqual(ids([file('src/frontend/src/app/features/approvals/approvals-page.ts'), file('src/frontend/src/styles.scss'), file('TODO.md')]), []);
  assert.match(report([]).line, /No risk areas detected/);
  assert.equal(report([]).warn, false);
});

test('authentication, PINs, secrets and the delivery pipeline need a security review', () => {
  for (const f of [
    'src/backend/Modules/CoParent.Modules.Identity/Endpoints/AuthEndpoints.cs',
    'src/backend/CoParent.SharedKernel/Security/Hashing.cs',
    'src/backend/Modules/CoParent.Modules.Families/Domain/ParentPin.cs',
    'src/frontend/src/app/core/auth/auth.store.ts',
    '.github/workflows/deploy.yml',
    'docker/api.Dockerfile',
    'src/backend/CoParent.Api/appsettings.Production.json',
  ]) assert.ok(ids([file(f)]).includes('security-review'), f);
});

test('file-name words match whole words only: EventMapping.cs and Author.cs are not security changes', () => {
  assert.deepEqual(ids([file('src/backend/Modules/CoParent.Modules.Calendar/Infrastructure/EventMapping.cs')]), []);
  assert.deepEqual(ids([file('src/backend/Modules/CoParent.Modules.Calendar/Domain/Author.cs')]), []);
  assert.deepEqual(ids([file('src/backend/Modules/CoParent.Modules.Calendar/Domain/Pinned.cs')]), []);
});

test('migrations are database changes, and dropping or renaming data is flagged as destructive', () => {
  const add = file('src/backend/Modules/CoParent.Modules.Calendar/Infrastructure/Migrations/20261029_AddIndex.cs', { status: 'added', patch: '+ migrationBuilder.CreateIndex(...)' });
  const drop = file('src/backend/Modules/CoParent.Modules.Calendar/Infrastructure/Migrations/20261029_DropNotes.cs', { status: 'added', patch: '+ migrationBuilder.DropColumn(name: "notes")' });
  const gone = file('src/backend/Modules/CoParent.Modules.Calendar/Infrastructure/Migrations/20261001_Old.cs', { status: 'removed' });
  const [safe] = classify([add]);
  assert.equal(safe.id, 'database-change');
  assert.equal(safe.destructive, undefined);
  assert.equal(report([safe]).warn, false);
  const [risky] = classify([add, drop, gone]);
  assert.deepEqual(risky.destructive, [drop.filename, gone.filename]);
  assert.equal(report([risky]).warn, true);
});

test('endpoints, contracts and the frontend API client are possible breaking changes; removals are called out', () => {
  const risks = classify([
    file('src/backend/Modules/CoParent.Modules.Calendar/Endpoints/PlaceSuggestionEndpoints.cs'),
    file('src/frontend/src/app/core/api/api.ts'),
    file('src/backend/Modules/CoParent.Modules.Calendar/Contracts/NewName.cs', { status: 'renamed', previous_filename: 'src/backend/Modules/CoParent.Modules.Calendar/Contracts/OldName.cs' }),
  ]);
  const breaking = risks.find(r => r.id === 'breaking-change');
  assert.equal(breaking.files.length, 3);
  assert.deepEqual(breaking.removed, ['src/backend/Modules/CoParent.Modules.Calendar/Contracts/OldName.cs']);
});

test('account deletion, tenancy, families, approvals and Restrict are high risk and warn', () => {
  for (const f of [
    'src/frontend/src/app/features/settings/delete-account.ts',
    'src/backend/CoParent.Infrastructure/Tenancy/TenantFilter.cs',
    'src/backend/Modules/CoParent.Modules.Families/Endpoints/ChildAccessEndpoints.cs',
    'src/backend/Modules/CoParent.Modules.Approvals/Domain/ChangeRequest.cs',
    'src/backend/Modules/CoParent.Modules.Families/Domain/ChildRestrict.cs',
  ]) {
    const risks = classify([file(f)]);
    assert.ok(risks.some(r => r.id === 'high-risk'), f);
    assert.equal(report(risks).warn, true, f);
  }
});

test('a renamed file is judged by its old path too, so moving a file out of a sensitive folder still shows', () => {
  assert.ok(ids([file('src/backend/Misc/Moved.cs', { status: 'renamed', previous_filename: 'src/backend/CoParent.SharedKernel/Security/Moved.cs' })]).includes('security-review'));
});

test('the summary lists at most ten files per risk, escapes backticks, and never includes file contents', () => {
  const many = Array.from({ length: 14 }, (_, i) => file(`src/backend/Modules/CoParent.Modules.Approvals/Domain/F${i}.cs`, { patch: 'SECRET_PATCH_TEXT' }));
  many.push(file('src/backend/Modules/CoParent.Modules.Approvals/Domain/a`b.cs'));
  const { summary } = report(classify(many));
  assert.match(summary, /and 5 more/);
  assert.ok(!summary.includes('SECRET_PATCH_TEXT'));
  assert.ok(!summary.includes('a`b'));
});

test('an incomplete file list warns', () => {
  const r = report([], { complete: false });
  assert.equal(r.warn, true);
  assert.match(r.summary, /Incomplete/);
});

test('workflow command text is escaped', () => {
  assert.equal(command('x::error::y\n'), 'x: :error: :y%0A');
});

// The run: trusted context, pagination, labels ignored, forks and races.
function context(prs, pages, event = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-risk-'));
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 7, head: { sha: 'abc' }, ...event } }));
  const calls = [];
  let read = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    const route = url.replace('https://api.github.com/repos/esaldivar/parenthesis/', '');
    const value = route === 'pulls/7' ? prs[Math.min(read++, prs.length - 1)] : pages[Number(new URL(url).searchParams.get('page')) - 1] ?? [];
    return value === undefined ? { ok: false, status: 404, json: async () => ({}) } : { ok: true, status: 200, json: async () => value };
  };
  const out = [];
  return { env: { GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: 'esaldivar/parenthesis', GITHUB_TOKEN: 't' }, fetchImpl, calls, out, write: s => out.push(s) };
}
const pr = (extra = {}) => ({ state: 'open', head: { sha: 'abc', repo: { full_name: 'esaldivar/parenthesis' } }, changed_files: 1, labels: [], ...extra });

test('labels are never an input: removing high-risk or adding a reassuring label changes nothing', async () => {
  const files = [[file('src/backend/Modules/CoParent.Modules.Approvals/Domain/ChangeRequest.cs')]];
  const without = await run(context([pr(), pr()], files));
  const relabelled = await run(context([pr({ labels: [{ name: 'low-risk' }] }), pr({ labels: [] })], files, { labels: [{ name: 'safe' }] }));
  assert.deepEqual(relabelled.risks, without.risks);
  assert.ok(without.risks.some(r => r.id === 'high-risk'));
});

test('a fork PR is classified the same way, from GitHub metadata only, with read-only GET requests', async () => {
  const c = context([pr({ head: { sha: 'abc', repo: { full_name: 'someone/fork' } } }), pr()], [[file('.github/workflows/ci.yml')]]);
  const { risks } = await run(c);
  assert.deepEqual(risks.map(r => r.id), ['security-review']);
  assert.ok(c.calls.every(call => call.method === 'GET'));
});

test('reads every page of changed files, and reports when GitHub lists fewer than the PR has', async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => file(`docs/f${i}.md`));
  const c = context([pr({ changed_files: 101 }), pr()], [page1, [file('src/backend/CoParent.Infrastructure/Tenancy/T.cs')]]);
  const { risks, complete } = await run(c);
  assert.equal(complete, true);
  assert.ok(risks.some(r => r.id === 'high-risk'));
  const short = await run(context([pr({ changed_files: 5000 }), pr()], [[file('README.md')]]));
  assert.equal(short.complete, false);
});

test('a PR that changes during the check reports nothing for this run, and API errors fail the run (the CLI warns)', async () => {
  await assert.rejects(run(context([pr(), pr({ head: { sha: 'newer' } })], [[]])), /changed during the check/);
  await assert.rejects(run(context([pr({ head: { sha: 'other' } })], [[]])), /changed since this event/);
  await assert.rejects(run(context([undefined], [[]])), /HTTP 404/);
});
