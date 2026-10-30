import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const versionPattern = '(0|[1-9][0-9]*)';
const releasePattern = new RegExp(`^release/${versionPattern}\\.${versionPattern}\\.${versionPattern}$`);

export function selectRelease(branches, milestones) {
  const candidates = branches.filter(({ name }) => releasePattern.test(name)).filter(({ name }) => {
    const version = name.slice(8);
    return milestones.some(({ state, title }) => state === 'open' && (
      new RegExp(`^v${version.replaceAll('.', '\\.')}($|[^0-9.])`).test(title) ||
      (version.endsWith('.0') && new RegExp(`^v${version.slice(0, -2).replaceAll('.', '\\.')}($|[^0-9.])`).test(title)) ||
      (version.startsWith('0.') && version.endsWith('.0') &&
        new RegExp(`^M${Number(version.split('.')[1])}($|[^0-9])`).test(title))
    ));
  });
  candidates.sort((a, b) => {
    const av = a.name.slice(8).split('.').map(Number);
    const bv = b.name.slice(8).split('.').map(Number);
    return bv[0] - av[0] || bv[1] - av[1] || bv[2] - av[2];
  });
  if (!candidates.length) throw new Error('No release branch matches an open milestone; refusing a main/develop fallback.');
  return candidates[0].name;
}

export async function routeUpdates(api, repository, event = {}) {
  const target = selectRelease(await api('branches?per_page=100'), await api('milestones?state=open&per_page=100'));
  const prs = event.pull_request ? [event.pull_request] : await api('pulls?state=open&per_page=100');
  for (const pr of prs) {
    if (pr.user?.login !== 'dependabot[bot]' || pr.user?.type !== 'Bot' ||
        pr.head?.repo?.full_name !== repository || !pr.head.ref.startsWith('dependabot/') ||
        pr.state !== 'open' || pr.base.ref === target) continue;
    await api(`pulls/${pr.number}`, { method: 'PATCH', body: { base: target } });
  }
  return target;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required.');
  const root = `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository}/`;
  async function api(path, options = {}) {
    let url = root + path;
    const result = [];
    do {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`GitHub ${options.method || 'GET'} ${path}: HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) return data;
      result.push(...data);
      url = response.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1];
      if (url && !url.startsWith(root)) throw new Error('Unexpected pagination origin.');
    } while (url);
    return result;
  }
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  console.log(`Dependabot target: ${await routeUpdates(api, repository, event)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
