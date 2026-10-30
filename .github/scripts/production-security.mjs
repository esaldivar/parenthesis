// Verify the immutable production artifact against a successful Sonar run for identical source (#66).
// Run only after production environment approval, before Azure login/migrations. No Sonar secrets are needed here.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const requiredJobs = ['SonarQube Cloud', 'Release security gate'];
export class VerificationError extends Error {}
const requireValue = (condition, message) => { if (!condition) throw new VerificationError(message); };

export function githubClient(repository, token, fetchImpl = fetch) {
  requireValue(/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') && token, 'Missing GitHub verification context.');
  const root = new URL(`https://api.github.com/repos/${repository.split('/').map(encodeURIComponent).join('/')}/`);
  return async path => {
    // Only this repository's API: a path that leaves it (another host, "..", an absolute URL) is refused.
    const url = new URL(path, root);
    requireValue(url.origin === root.origin && url.pathname.startsWith(root.pathname), 'Refusing a GitHub request outside this repository.');
    const response = await fetchImpl(url.href, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    requireValue(response.ok, 'GitHub security evidence is unavailable.');
    return response.json();
  };
}

async function allPages(get, path, key) {
  const items = [];
  let total;
  for (let page = 1; page <= 10; page++) {
    const data = await get(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    requireValue(Number.isSafeInteger(data.total_count) && data.total_count >= 0 && Array.isArray(data[key]), 'Incomplete GitHub security evidence.');
    if (total === undefined) total = data.total_count;
    requireValue(data.total_count === total && total <= 1000 && items.length + data[key].length <= total, 'Security evidence changed or exceeds the pagination limit.');
    items.push(...data[key]);
    if (items.length === total) return items;
    requireValue(data[key].length > 0, 'Incomplete GitHub security evidence.');
  }
  throw new VerificationError('Incomplete GitHub security evidence.');
}

function matchingRun(run, repository, revision, workflowId) {
  return positive(run.id) && positive(run.run_attempt) && run.workflow_id === workflowId
    && run.head_sha === revision && run.head_branch === 'main' && run.event === 'push'
    && run.path?.split('@')[0] === '.github/workflows/sonar.yml'
    && run.repository?.full_name?.toLowerCase() === repository.toLowerCase()
    && run.head_repository?.full_name?.toLowerCase() === repository.toLowerCase();
}

/** Never fall back to an older green run or to successful jobs from an earlier attempt. */
export async function verifyEvidence({ get, repository, revision, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 15 * 60 * 1000 }) {
  const workflow = await get('actions/workflows/sonar.yml');
  requireValue(positive(workflow.id) && workflow.path === '.github/workflows/sonar.yml', 'The Sonar workflow could not be verified.');
  const runsPath = `actions/workflows/${workflow.id}/runs?head_sha=${revision}&event=push&branch=main`;
  const latest = async () => {
    const runs = await allPages(get, runsPath, 'workflow_runs');
    requireValue(runs.every(run => matchingRun(run, repository, revision, workflow.id)), 'Sonar evidence is for a different candidate, workflow or repository.');
    return runs.sort((a, b) => b.id - a.id)[0];
  };
  const deadline = now() + timeoutMs;
  while (true) {
    const run = await latest();
    if (run?.status === 'completed') {
      requireValue(run.conclusion === 'success', 'The latest Sonar run did not pass.');
      const jobs = await allPages(get, `actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
      for (const name of requiredJobs) {
        const matches = jobs.filter(job => job.name === name);
        requireValue(matches.length === 1 && matches[0].head_sha === revision && matches[0].run_id === run.id
          && matches[0].status === 'completed' && matches[0].conclusion === 'success', 'Sonar analysis and Release security gate must both pass for this candidate.');
      }
      const fresh = await get(`actions/runs/${run.id}`);
      const current = await latest();
      requireValue(matchingRun(fresh, repository, revision, workflow.id) && fresh.run_attempt === run.run_attempt
        && fresh.status === 'completed' && fresh.conclusion === 'success' && current?.id === run.id
        && current?.run_attempt === run.run_attempt && current?.status === 'completed' && current?.conclusion === 'success', 'Sonar evidence changed during verification.');
      return run.id;
    }
    requireValue(!run || ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status), 'Unknown Sonar workflow state.');
    requireValue(now() < deadline, 'No completed security evidence for this candidate; wait for its main Sonar run and retry.');
    await sleep(30000);
  }
}

const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 }).trim();

/** Production release/hotfix uses current main; rollback uses its released main tag. The artifact must match its tree. */
export async function verifyProduction({ env, exec = execute, get, sleep, now, timeoutMs }) {
  const repository = env.GITHUB_REPOSITORY;
  requireValue(/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') && env.GITHUB_REF === 'refs/heads/main' && sha(env.GITHUB_SHA), 'Production must run from main with a known commit.');
  requireValue(['release', 'build-hotfix', 'rollback'].includes(env.KIND), 'Unknown production deployment kind.');
  const image = `ghcr.io/${repository.split('/')[0].toLowerCase()}/parenthesis-api`;
  requireValue(env.IMAGE === image && typeof env.TARGET === 'string' && env.TARGET.startsWith(`${image}:`), 'Unexpected production image repository.');
  const tag = env.TARGET.slice(image.length + 1);
  requireValue(/^(sha-[a-f0-9]{40}|v\d+\.\d+\.\d+)$/.test(tag), 'Unexpected production image tag.');
  let revision = env.GITHUB_SHA;
  if (env.KIND === 'rollback') {
    requireValue(/^v\d+\.\d+\.\d+$/.test(tag), 'Rollback requires a released version.');
    revision = exec('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`]);
    requireValue(sha(revision), 'The released version has no known commit.');
    exec('git', ['merge-base', '--is-ancestor', revision, env.GITHUB_SHA]);
  } else {
    requireValue(tag.startsWith('sha-'), 'A release/hotfix requires a revision-tagged image.');
  }
  exec('docker', ['pull', env.TARGET]);
  const inspected = JSON.parse(exec('docker', ['image', 'inspect', env.TARGET]));
  requireValue(Array.isArray(inspected) && inspected.length === 1, 'Image metadata is missing.');
  const artifact = inspected[0];
  const labels = artifact.Config?.Labels;
  const source = labels?.['org.opencontainers.image.revision'];
  requireValue(sha(source) && labels?.['org.opencontainers.image.source']?.toLowerCase() === `https://github.com/${repository.toLowerCase()}`, 'Image source provenance is missing or unexpected.');
  requireValue(!tag.startsWith('sha-') || tag === `sha-${source}`, 'Image revision does not match its tag.');
  const digest = artifact.RepoDigests?.filter(value => typeof value === 'string' && value.startsWith(`${image}@sha256:`));
  requireValue(digest?.length === 1 && new RegExp(`^${image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@sha256:[a-f0-9]{64}$`).test(digest[0]), 'An immutable image digest is required.');
  const tree = commit => exec('git', ['rev-parse', '--verify', `${commit}^{tree}`]);
  const sourceTree = tree(source);
  requireValue(sha(sourceTree) && sourceTree === tree(revision), 'The image source differs from the security candidate.');
  const runId = await verifyEvidence({ get, repository, revision, sleep, now, timeoutMs });
  return { image: digest[0], source, revision, runId };
}

export async function run({ env = process.env, exec, get } = {}) {
  const result = await verifyProduction({ env, exec, get: get ?? githubClient(env.GITHUB_REPOSITORY, env.GH_TOKEN) });
  requireValue(env.GITHUB_ENV && env.GITHUB_STEP_SUMMARY, 'Missing deployment output files.');
  appendFileSync(env.GITHUB_ENV, `TARGET=${result.image}\n`);
  appendFileSync(env.GITHUB_STEP_SUMMARY, `\n## Production security verified\nImage: \`${result.image}\`\nArtifact revision: \`${result.source}\`\nIdentical source checked at: \`${result.revision}\`\nSonar run: https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${result.runId}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => {
    console.error(`::error::${error instanceof VerificationError ? error.message : 'Production security verification failed; no production changes authorized.'}`);
    process.exitCode = 1;
  });
}
