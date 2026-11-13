import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { githubApi, isDependabotUpdate, matchesReleaseMilestone, selectRelease } from './dependabot-release-target.mjs';
import { references, validate } from './pr-issue-links.mjs';

const issueAuthor = 'github-actions[bot]';

export function addTrackingReference(body, number, repository) {
  const original = body ?? '';
  const heading = /^##[ \t]+Tracking issues[ \t]*\r?$/im.exec(original);
  const ref = `Refs #${number}`;
  let updated;
  if (!heading) {
    updated = `${original}${original ? '\n\n' : ''}## Tracking issues\n\n${ref}\n`;
  } else {
    const start = heading.index + heading[0].length;
    const nextHeading = /^#{1,2}[ \t]/m.exec(original.slice(start));
    const end = nextHeading ? start + nextHeading.index : original.length;
    const section = original.slice(start, end).replace(/^[ \t]*(?:[-*][ \t]+)?Refs[ \t]+#ISSUE[ \t]*\r?\n?/gim, '');
    updated = `${original.slice(0, start)}\n\n${ref}\n${section}${original.slice(end)}`;
  }
  if (!references(updated, repository).includes(number)) {
    throw new Error('Could not add a valid tracking reference to the current PR description.');
  }
  return updated;
}

export async function trackDependabotRun(api, repository, run) {
  if (run?.event !== 'pull_request' || run.head_repository?.full_name !== repository ||
      !run.head_branch?.startsWith('dependabot/') || !run.head_sha) return;

  const owner = repository.split('/')[0];
  const candidates = await api(`pulls?state=open&head=${encodeURIComponent(`${owner}:${run.head_branch}`)}&per_page=100`);
  for (const candidate of candidates) {
    if (!isDependabotUpdate(candidate, repository) || candidate.head.ref !== run.head_branch ||
        candidate.head.sha !== run.head_sha) continue;

    const path = `pulls/${candidate.number}`;
    const pr = await api(path);
    if (!isDependabotUpdate(pr, repository) || pr.head.sha !== run.head_sha || pr.head.ref !== run.head_branch) continue;

    const milestones = await api('milestones?state=open&per_page=100');
    const target = selectRelease(await api('branches?per_page=100'), milestones);
    const matches = milestones.filter(milestone => matchesReleaseMilestone(target, milestone));
    const marker = `<!-- parenthesis:dependabot-pr:${pr.number} -->`;
    const issues = await api(`issues?state=all&creator=${encodeURIComponent(issueAuthor)}&per_page=100`);
    const found = issues.filter(issue => !issue.pull_request && issue.user?.login === issueAuthor &&
      issue.body?.split(/\r?\n/).includes(marker));
    if (found.length > 1) throw new Error(`Multiple tracking issues found for Dependabot PR #${pr.number}.`);
    let issue = found[0];
    if (!issue) {
      const title = `[Dependabot] ${pr.title}`.slice(0, 200);
      const body = [
        marker, '', `Track and validate [Dependabot PR #${pr.number}](https://github.com/${repository}/pull/${pr.number}).`,
        '', `- Target at creation: ${target}`,
        '- Review package names, version changes, and compatibility notes in the linked Dependabot PR.',
        '- Verify the required build, dependency/security, and release checks before merging.',
      ].join('\n');
      const input = { title, body, labels: ['dependencies'], assignees: ['esaldivar'] };
      if (matches.length === 1) input.milestone = matches[0].number;
      issue = await api('issues', { method: 'POST', body: input });
    }

    // Re-read before writing to preserve intervening edits and reject stale bot runs.
    const latest = await api(path);
    if (!isDependabotUpdate(latest, repository) || latest.head.sha !== run.head_sha ||
        latest.head.ref !== run.head_branch) continue;
    let numbers;
    try {
      numbers = references(latest.body, repository);
    } catch {
      numbers = [];
    }
    const body = numbers.includes(issue.number)
      ? latest.body : addTrackingReference(latest.body, issue.number, repository);
    await validate({ body, repository, getIssue: n => api(`issues/${n}`) });

    const patch = {};
    if (body !== latest.body) patch.body = body;
    if (latest.base.ref !== target) patch.base = target;
    if (Object.keys(patch).length) await api(path, { method: 'PATCH', body: patch });
    console.log(`Dependabot PR #${pr.number} tracks issue #${issue.number}.`);
  }
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  await trackDependabotRun(githubApi(repository, process.env.GH_TOKEN), repository, event.workflow_run);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
