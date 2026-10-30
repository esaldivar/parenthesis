import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validate } from './pr-issue-links.mjs';

// #140: a PR's milestone comes from its tracking issues (the #132 "## Tracking issues" section, parsed and verified by
// pr-issue-links.mjs, never re-implemented here). Report-only for now (owner decision, October 20, 2026): the workflow
// explains what it would do and never fails a PR or writes anything. `apply` mode exists for the later, separately
// approved rollout and only ever fills an empty milestone; it never overwrites one someone chose.

/** The release a milestone belongs to, per docs/development-workflow.md ("M3 — Calendar" → 0.3.0, "v1.0 — …" → 1.0.0). */
export function releaseOf(title) {
  const m = String(title ?? '').match(/^M(\d+)\b/);
  if (m) return `0.${Number(m[1])}.0`;
  const v = String(title ?? '').match(/^v(\d+)\.(\d+)\b/);
  return v ? `${Number(v[1])}.${Number(v[2])}.0` : null;
}

/**
 * What kind of PR this is, by its branches (docs/development-workflow.md). Rollups (release promotions, develop → main,
 * hotfixes and back-merges) carry many issues across milestones by design, so they get a summary, not an assignment.
 */
export function kindOf(base, head) {
  if (/^release\//.test(head) || base === 'main' || /^hotfix\//.test(head) || /^chore\/sync-/.test(head)) return 'rollup';
  return 'work';
}

/**
 * The decision for one PR. `issues` are verified tracking issues with their milestone ({ number, milestone }).
 * Never guesses: no milestone, or several different ones, is reported for a person to decide.
 */
export function plan({ base, head, current, issues }) {
  const kind = kindOf(base, head);
  const byNumber = new Map();
  for (const issue of issues) if (issue.milestone) byNumber.set(issue.milestone.number, issue.milestone);
  const milestones = [...byNumber.values()].sort((a, b) => a.number - b.number);
  const without = issues.filter(i => !i.milestone).map(i => i.number);
  const notes = [];
  if (without.length) notes.push(`No milestone on ${without.map(n => `#${n}`).join(', ')}.`);
  if (kind === 'rollup') {
    return { kind, decision: 'rollup', milestones, notes: [...notes, 'Release, hotfix and sync PRs keep their milestones as set; nothing is assigned.'] };
  }
  if (!milestones.length) {
    return { kind, decision: 'none', milestones, notes: [...notes, 'No tracking issue has a milestone, so none is assigned. That is fine for repository-wide maintenance; otherwise give the issue a milestone.'] };
  }
  if (milestones.length > 1) {
    return { kind, decision: 'conflict', milestones, notes: [...notes, `Tracking issues are in different milestones (${milestones.map(m => m.title).join(', ')}). Decision required: set the PR's milestone by hand, or split the PR.`] };
  }
  const [milestone] = milestones;
  const release = /^release\/(\d+\.\d+\.\d+)$/.exec(base)?.[1];
  if (release && releaseOf(milestone.title) && releaseOf(milestone.title) !== release) {
    notes.push(`${milestone.title} belongs to release ${releaseOf(milestone.title)}, but this PR targets ${base}.`);
  }
  if (!current) return { kind, decision: 'assign', milestone, milestones, notes };
  if (current.number === milestone.number) return { kind, decision: 'matches', milestone, milestones, notes };
  return { kind, decision: 'differs', milestone, milestones, notes: [...notes, `The PR's milestone (${current.title}) differs from its tracking issues' (${milestone.title}). It is kept as chosen.`] };
}

/** One line for the log and a Markdown summary for the job page. Issue titles and bodies are never echoed. */
export function report(result) {
  const name = m => m.title;
  const line = {
    rollup: `Rollup PR: tracking issues span ${result.milestones.map(name).join(', ') || 'no milestones'}.`,
    none: 'No milestone to inherit.',
    conflict: 'Milestone decision required: tracking issues disagree.',
    assign: `Would set the milestone to ${result.milestone?.title} (report-only: not set).`,
    matches: `Milestone ${result.milestone?.title} matches the tracking issues.`,
    differs: 'The PR milestone differs from its tracking issues; it is kept.',
  }[result.decision];
  const warn = ['conflict', 'differs'].includes(result.decision) || result.notes.some(n => n.includes('belongs to release'));
  const summary = ['## PR milestone (#140, report-only)', '', line, '', ...result.notes.map(n => `- ${n}`)].join('\n');
  return { line, warn, summary };
}

/** Escapes text for a workflow command, so a milestone title can't end the annotation or start another command. */
export function command(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/::/g, ': :');
}

/** Sets an empty PR milestone. Only used in apply mode; never overwrites. */
export async function apply({ result, current, setMilestone }) {
  if (result.decision !== 'assign' || current) return false;
  await setMilestone(result.milestone.number);
  return true;
}

export async function run({ env = process.env, fetchImpl = fetch, write = s => fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${s}\n`) } = {}) {
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = env.GITHUB_REPOSITORY;
  const number = event.pull_request?.number;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !Number.isSafeInteger(number) || number < 1 || !env.GITHUB_TOKEN) {
    throw new Error('Missing or invalid trusted workflow context.');
  }
  const call = async (path, init = {}) => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
      redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub request failed (HTTP ${response.status}).`);
    return response.json();
  };
  // Read the current PR, not the event's copy, and check it didn't change while we looked.
  const pr = await call(`pulls/${number}`);
  if (pr.state !== 'open' || pr.head?.sha !== event.pull_request.head?.sha) throw new Error('PR changed since this event; the latest event reports.');
  const issues = [];
  await validate({
    body: pr.body, repository,
    getIssue: async n => {
      const issue = await call(`issues/${n}`);
      issues.push({ number: n, milestone: issue?.milestone ? { number: issue.milestone.number, title: String(issue.milestone.title) } : null });
      return issue;
    },
  });
  const current = pr.milestone ? { number: pr.milestone.number, title: String(pr.milestone.title) } : null;
  const result = plan({ base: pr.base?.ref, head: pr.head?.ref, current, issues });
  const again = await call(`pulls/${number}`);
  if (again.head?.sha !== pr.head?.sha || again.body !== pr.body || again.milestone?.number !== pr.milestone?.number) {
    throw new Error('PR changed during the check; the latest event reports.');
  }
  const { line, warn, summary } = report(result);
  write(summary);
  console.log(warn ? `::warning title=PR milestone::${command(line)}` : line);
  if (env.PR_MILESTONE_MODE === 'apply') {
    await apply({ result, current, setMilestone: m => call(`issues/${number}`, { method: 'PATCH', body: JSON.stringify({ milestone: m }), headers: { 'Content-Type': 'application/json' } }) });
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => {
    // Report-only: explain, never fail the PR. Never echo API bodies, issue text or tokens.
    const reason = /^(PR changed|Missing or invalid|GitHub request failed \(HTTP \d+\))/.test(error.message) ? error.message : 'Tracking issues could not be read; the Tracking issue links check explains why.';
    console.log(`::warning title=PR milestone::Milestone check skipped: ${reason}`);
  });
}
