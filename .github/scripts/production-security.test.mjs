import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyEvidence, verifyProduction, githubClient, run } from './production-security.mjs';

const main = 'a'.repeat(40), source = 'b'.repeat(40), tree = 'c'.repeat(40), old = 'd'.repeat(40);
const repository = 'esaldivar/parenthesis', image = 'ghcr.io/esaldivar/parenthesis-api';
const digest = `${image}@sha256:${'e'.repeat(64)}`;
const env = { GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: main, IMAGE: image, TARGET: `${image}:sha-${source}`, KIND: 'release' };
const passing = () => ({ id: 22, run_attempt: 2, workflow_id: 3, head_sha: main, head_branch: 'main', event: 'push', path: '.github/workflows/sonar.yml', repository: { full_name: repository }, head_repository: { full_name: repository }, status: 'completed', conclusion: 'success' });
const job = name => ({ name, head_sha: main, run_id: 22, status: 'completed', conclusion: 'success' });
function api({ runs = [passing()], jobs = [job('SonarQube Cloud'), job('Release security gate')], transform = (_, data) => data } = {}) {
  const calls = [];
  const get = async path => {
    calls.push(path);
    let data;
    if (path === 'actions/workflows/sonar.yml') data = { id: 3, path: '.github/workflows/sonar.yml' };
    else if (path.startsWith('actions/workflows/3/runs?')) data = { total_count: runs.length, workflow_runs: structuredClone(runs) };
    else if (path.startsWith('actions/runs/22/attempts/2/jobs?')) data = { total_count: jobs.length, jobs: structuredClone(jobs) };
    else if (path === 'actions/runs/22') data = structuredClone(runs.find(r => r.id === 22));
    else throw Error(`Unexpected evidence request: ${path}`);
    return transform(path, data, calls);
  };
  return { get, calls };
}
function artifact({ sourceRevision = source, artifactTree = tree, candidateTree = tree, provenance = `https://github.com/${repository}`, repoDigests = [digest], ancestor = true } = {}) {
  const calls = [];
  const exec = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'docker' && args[0] === 'pull') return '';
    if (command === 'docker' && args[0] === 'image') return JSON.stringify([{ Config: { Labels: { 'org.opencontainers.image.revision': sourceRevision, 'org.opencontainers.image.source': provenance } }, RepoDigests: repoDigests }]);
    if (command === 'git' && args[0] === 'merge-base') { if (!ancestor) throw Error('Not an ancestor'); return ''; }
    if (command === 'git' && args[2].startsWith('refs/tags/')) return main;
    if (command === 'git' && args[2] === `${sourceRevision}^{tree}`) return artifactTree;
    if (command === 'git' && args[2] === `${main}^{tree}`) return candidateTree;
    throw Error(`Unexpected artifact command: ${command} ${args.join(' ')}`);
  };
  return { exec, calls };
}
const verify = (options = {}) => verifyProduction({ env, ...artifact(), ...api(), ...options });

test('release verifies identical develop image tree against main, current Sonar attempt and immutable digest', async () => {
  const evidence = api(), local = artifact();
  assert.deepEqual(await verify({ ...evidence, ...local }), { image: digest, source, revision: main, runId: 22 });
  assert(evidence.calls.some(p => p.includes(`/attempts/2/jobs?`)));
  assert(evidence.calls[1].includes(`head_sha=${main}&event=push&branch=main`));
  assert(local.calls.every(([command]) => ['docker', 'git'].includes(command)));
});
test('hotfix verifies its own revision; manual production rollback verifies released tag ancestry and source tree', async () => {
  assert.equal((await verify({ env: { ...env, KIND: 'build-hotfix', TARGET: `${image}:sha-${main}` }, ...artifact({ sourceRevision: main }) })).revision, main);
  const local = artifact();
  assert.equal((await verify({ env: { ...env, KIND: 'rollback', TARGET: `${image}:v0.2.0` }, ...local })).image, digest);
  assert(local.calls.some(args => args.join(' ') === `git merge-base --is-ancestor ${main} ${main}`));
  await assert.rejects(verify({ env: { ...env, KIND: 'rollback', TARGET: `${image}:v0.2.0` }, ...artifact({ ancestor: false }) }));
});
for (const [label, changes] of Object.entries({ branch: { GITHUB_REF: 'refs/heads/develop' }, kind: { KIND: 'build' }, registry: { TARGET: 'ghcr.io/other/api:v0.2.0' }, tag: { TARGET: `${image}:latest` }, rollback: { KIND: 'rollback' } })) {
  test(`rejects invalid production ${label} before pulling any image`, async () => {
    const local = artifact();
    await assert.rejects(verify({ env: { ...env, ...changes }, ...local }));
    assert.equal(local.calls.length, 0);
  });
}
for (const [label, options] of Object.entries({ tree: { candidateTree: old }, revision: { sourceRevision: old }, source: { provenance: 'https://github.com/other/repo' }, missingDigest: { repoDigests: [] }, malformedDigest: { repoDigests: [`${image}@sha256:no`] }, ambiguousDigest: { repoDigests: [digest, digest] } })) {
  test(`rejects artifact ${label} without querying security or authorizing deployment`, async () => {
    const evidence = api();
    await assert.rejects(verify({ ...artifact(options), ...evidence }));
    assert.equal(evidence.calls.length, 0);
  });
}
for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
  test(`latest ${conclusion} run blocks despite older green evidence`, async () => {
    await assert.rejects(verify({ ...api({ runs: [{ ...passing(), conclusion }, { ...passing(), id: 21 }] }) }), /latest Sonar run/);
  });
}
for (const changes of [{ head_sha: old }, { head_branch: 'develop' }, { event: 'pull_request' }, { workflow_id: 9 }, { path: '.github/workflows/other.yml' }, { repository: { full_name: 'other/repo' } }, { head_repository: { full_name: 'fork/repo' } }]) {
  test(`rejects evidence identity ${JSON.stringify(changes)}`, async () => {
    await assert.rejects(verify({ ...api({ runs: [{ ...passing(), ...changes }] }) }), /different candidate/);
  });
}
for (const jobs of [[], [job('SonarQube Cloud')], [job('SonarQube Cloud'), { ...job('Release security gate'), conclusion: 'skipped' }], [job('SonarQube Cloud'), { ...job('Release security gate'), head_sha: old }], [job('SonarQube Cloud'), { ...job('Release security gate'), run_id: 21 }], [job('SonarQube Cloud'), job('Release security gate'), job('Release security gate')]]) {
  test(`requires both successful jobs for exact attempt: ${JSON.stringify(jobs)}`, async () => {
    await assert.rejects(verify({ ...api({ jobs }) }), /must both pass/);
  });
}
test('waits for this candidate then succeeds; absent evidence times out without an older revision fallback', async () => {
  let clock = 0;
  const evidence = api({ transform: (path, data) => path.includes('/runs?') && clock === 0 ? { total_count: 0, workflow_runs: [] } : data });
  assert.equal(await verifyEvidence({ ...evidence, repository, revision: main, now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 60000 }), 22);
  clock = 0;
  await assert.rejects(verifyEvidence({ ...api({ runs: [] }), repository, revision: main, now: () => clock, sleep: async ms => { clock += ms; }, timeoutMs: 30000 }), /No completed security evidence/);
});
test('evidence changed during recheck fails closed', async () => {
  await assert.rejects(verify({ ...api({ transform: (path, data) => path === 'actions/runs/22' ? { ...data, run_attempt: 3 } : data }) }), /changed during verification/);
  let listing = 0;
  await assert.rejects(verify({ ...api({ transform: (path, data) => path.includes('/runs?') && ++listing === 2 ? { total_count: 1, workflow_runs: [{ ...passing(), id: 23 }] } : data }) }), /changed during verification/);
});
test('incomplete pagination and unavailable API fail closed', async () => {
  await assert.rejects(verify({ ...api({ transform: (path, data) => path.includes('/runs?') ? { total_count: 1, workflow_runs: [] } : data }) }), /Incomplete/);
  await assert.rejects(verify({ get: async () => { throw Error('unavailable'); } }), /unavailable/);
});
test('GitHub requests cannot redirect tokens and error output excludes response bodies', async () => {
  const get = githubClient(repository, 'test-token', async (url, options) => {
    assert.equal(url, `https://api.github.com/repos/${repository}/actions/workflows/sonar.yml`);
    assert.equal(options.redirect, 'error');
    return { ok: false, text: () => 'sensitive response' };
  });
  await assert.rejects(get('actions/workflows/sonar.yml'), /^Error: GitHub security evidence is unavailable\.$/);
});
test('only successful verification publishes digest and evidence; failure leaves outputs unwritten', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'production-security-'));
  try {
    const output = { GITHUB_ENV: join(dir, 'env'), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
    await assert.rejects(run({ env: { ...env, ...output }, ...artifact({ candidateTree: old }), ...api() }));
    assert.throws(() => readFileSync(output.GITHUB_ENV));
    await run({ env: { ...env, ...output }, ...artifact(), ...api() });
    assert.equal(readFileSync(output.GITHUB_ENV, 'utf8'), `TARGET=${digest}\n`);
    assert.match(readFileSync(output.GITHUB_STEP_SUMMARY, 'utf8'), /actions\/runs\/22/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('production guard precedes Azure and preserves environment approval, failure rollback and development independence', () => {
  const workflow = readFileSync(new URL('../workflows/deploy.yml', import.meta.url), 'utf8');
  const deploy = workflow.slice(workflow.indexOf('\n  deploy:'));
  const verifyAt = deploy.indexOf('- name: Verify production artifact security');
  const azureAt = deploy.indexOf('- name: Sign in to Azure');
  assert(verifyAt > 0 && verifyAt < azureAt);
  const guard = deploy.slice(verifyAt, azureAt);
  assert.match(guard, /if: env\.ENVIRONMENT == 'production'/);
  assert.match(guard, /node \.github\/scripts\/production-security\.mjs/);
  assert.doesNotMatch(guard, /continue-on-error|always\(\)/);
  assert.match(deploy, /name: \$\{\{ needs\.prepare\.outputs\.environment \}\}/);
  assert.match(deploy, /actions: read/);
  assert.match(deploy, /fetch-depth: 0/);
  assert.match(deploy, /if: failure\(\) && steps\.before\.outputs\.previous != ''/);
  assert.match(deploy, /job update[^\n]+--image "\$TARGET"/);
  assert.match(deploy, /containerapp update[^\n]+--image "\$TARGET"/);
});
