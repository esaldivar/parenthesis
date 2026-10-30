import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// #141, phase 2: classify a PR's risk from its changed files, report-only. The classification is recomputed on every
// run from GitHub's own list of changed files (trusted metadata), never from labels, so removing or adding a label
// can't change it. It never fails or edits a PR. Phase 3 (required checks, mandatory review) needs owner approval.

/** Each risk: why it matters and the paths that carry it. Paths are repository-relative, matched case-insensitively. */
export const RISKS = [
  {
    id: 'security-review',
    why: 'Authentication, authorization, secrets, encryption or the delivery pipeline',
    paths: [
      /^src\/backend\/coparent\.sharedkernel\/security\//, /^src\/backend\/modules\/coparent\.modules\.identity\//,
      /^src\/backend\/coparent\.infrastructure\/dataprotection\//, /^src\/backend\/coparent\.api\/hosting\//,
      /^src\/frontend\/src\/app\/core\/auth\//, /^\.github\/workflows\//, /^\.github\/scripts\/(production-security|sonar-release-gate|pr-issue-links|check-pr-branch-policy)/,
      /^docker\//, /^security\.md$/, /appsettings[^/]*\.json$/,
    ],
    // Backend file names, as whole words in their original case: "ParentPin.cs" yes, "EventMapping.cs" no.
    names: /^(?=.*\.cs$).*(Auth(?:entication|orization|orize)?(?![a-z])|Antiforgery|Cookie|Password|Pin(?![a-z])|Token|Secret|Crypt|Permission|Polic(?:y|ies))/,
  },
  {
    id: 'database-change',
    why: 'Schema migrations or persistence mappings',
    paths: [/\/migrations\//, /dbcontext[^/]*\.cs$/, /^src\/backend\/[^]*\/persistence\//],
  },
  {
    id: 'breaking-change',
    why: 'The API surface the browser depends on (endpoints, contracts, the frontend API client)',
    paths: [/^src\/backend\/[^]*\/(endpoints|contracts)\//, /^src\/frontend\/src\/app\/core\/api\/api\.ts$/],
  },
  {
    id: 'high-risk',
    why: 'Account deletion, family and child data access, tenant isolation, approvals (ADR-0003) or Restrict/delete (ADR-0005)',
    paths: [
      /tenancy\//, /^src\/backend\/modules\/coparent\.modules\.approvals\//,
      /^src\/backend\/modules\/coparent\.modules\.families\/(domain|endpoints|infrastructure)\//,
      /delete-account|accountdeletion|deleteaccount/,
    ],
    names: /^(?=.*\.cs$).*(Restrict|Purge|Erase)(?![a-z])/,
  },
];

/** Removing a migration or one that drops or renames data is destructive, whatever its name. */
const DESTRUCTIVE = /migrationBuilder\.(Drop\w+|Rename\w+|AlterColumn)\b|DROP\s+(TABLE|COLUMN)|TRUNCATE\b/i;

/**
 * The PR's risks from its changed files ({ filename, status, previous_filename?, patch? }). Labels are not an input.
 * Returns each risk with the files that triggered it (capped for display) and any destructive database change.
 */
export function classify(files) {
  const risks = [];
  for (const risk of RISKS) {
    const matches = p => risk.paths.some(r => r.test(p.toLowerCase()))
      || (!!risk.names && p.startsWith('src/backend/') && risk.names.test(p.split('/').pop()));
    const hits = files.filter(f => [f.filename, f.previous_filename].filter(Boolean).some(matches));
    if (hits.length) risks.push({ id: risk.id, why: risk.why, files: hits.map(f => f.filename) });
  }
  const destructive = files.filter(f => /\/migrations\//i.test(f.filename) && (f.status === 'removed' || DESTRUCTIVE.test(f.patch ?? '')));
  if (destructive.length) {
    const db = risks.find(r => r.id === 'database-change');
    db.destructive = destructive.map(f => f.filename);
  }
  const removedApi = files.filter(f => f.status === 'removed' || f.status === 'renamed')
    .filter(f => RISKS[2].paths.some(r => r.test((f.previous_filename ?? f.filename).toLowerCase())));
  if (removedApi.length) risks.find(r => r.id === 'breaking-change').removed = removedApi.map(f => f.previous_filename ?? f.filename);
  return risks;
}

/** Escapes text for a workflow command, so a file name can't end the annotation or start another command. */
export function command(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/::/g, ': :');
}

const SHOWN = 10;
/** The job summary and the one-line log. Only file names and fixed text, never file contents. */
export function report(risks, { complete = true } = {}) {
  const ids = risks.map(r => r.id);
  const line = ids.length ? `Risk areas (report-only): ${ids.join(', ')}.` : 'No risk areas detected (report-only).';
  const rows = risks.map(r => {
    const files = r.files.slice(0, SHOWN).map(f => `\`${f.replace(/`/g, "'")}\``).join(', ') + (r.files.length > SHOWN ? `, and ${r.files.length - SHOWN} more` : '');
    const extra = [r.destructive ? ` **Destructive migration:** ${r.destructive.length} file(s).` : '', r.removed ? ` **Removed or renamed API files:** ${r.removed.length}.` : ''].join('');
    return `| \`${r.id}\` | ${r.why}.${extra} | ${files} |`;
  });
  const summary = [
    '## PR risk (#141, report-only)', '', line, '',
    ...(rows.length ? ['| Risk | Why | Files |', '|---|---|---|', ...rows, ''] : []),
    complete ? '' : '> **Incomplete:** the PR changes more files than were read; review the rest by hand.',
    'Computed from the changed files on every run, not from labels. Nothing is blocked; reviewers decide.',
  ].join('\n');
  return { line, summary, warn: risks.some(r => r.id === 'high-risk' || r.destructive) || !complete };
}

const PAGE = 100, MAX_PAGES = 30; // GitHub lists at most 3,000 files per PR.

export async function run({ env = process.env, fetchImpl = fetch, write = s => fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${s}\n`) } = {}) {
  const event = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = env.GITHUB_REPOSITORY;
  const number = event.pull_request?.number;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !Number.isSafeInteger(number) || number < 1 || !env.GITHUB_TOKEN) {
    throw new Error('Missing or invalid trusted workflow context.');
  }
  const get = async path => {
    const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GitHub request failed (HTTP ${response.status}).`);
    return response.json();
  };
  const pr = await get(`pulls/${number}`);
  if (pr.state !== 'open' || pr.head?.sha !== event.pull_request.head?.sha) throw new Error('PR changed since this event; the latest event reports.');
  const files = [];
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const batch = await get(`pulls/${number}/files?per_page=${PAGE}&page=${page}`);
    files.push(...batch);
    if (batch.length < PAGE) break;
  }
  const complete = files.length >= (pr.changed_files ?? files.length);
  const again = await get(`pulls/${number}`);
  if (again.head?.sha !== pr.head?.sha) throw new Error('PR changed during the check; the latest event reports.');
  const risks = classify(files);
  const { line, summary, warn } = report(risks, { complete });
  write(summary);
  console.log(warn ? `::warning title=PR risk::${command(line)}` : line);
  return { risks, complete };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => {
    // Report-only: explain, never fail the PR. Never echo API bodies, patches or tokens.
    const reason = /^(PR changed|Missing or invalid|GitHub request failed \(HTTP \d+\))/.test(error.message) ? error.message : 'the changed files could not be read.';
    console.log(`::warning title=PR risk::Risk check skipped: ${reason}`);
  });
}
