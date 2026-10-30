import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Only this explicit section is evidence. Examples, comments and code are not links.
// Drops each fenced code block (``` or ~~~ up to a line starting with the same marker). An unclosed fence stays.
function withoutFences(text) {
  const lines = text.split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const marker = /^[ \t]*(`{3,}|~{3,})/.exec(lines[i])?.[1];
    const close = marker ? lines.findIndex((line, j) => j > i && line.replace(/^[ \t]*/, '').startsWith(marker)) : -1;
    if (close === -1) {
      kept.push(lines[i]);
    } else {
      i = close;
    }
  }
  return kept.join('\n');
}

export function references(body, repository) {
  const text = withoutFences(String(body ?? '').replace(/<!--[\s\S]*?(?:-->|$)/g, ''))
    .replace(/`[^`\n]*`/g, '');
  const sections = [...text.matchAll(/^##[ \t]+Tracking issues[ \t]*\r?\n([\s\S]*?)(?=^#{1,2}[ \t]|$(?![\s\S]))/gim)];
  if (sections.length !== 1) throw new Error('Include exactly one ## Tracking issues section.');
  const section = sections[0][1];
  // Keep a deliberately narrow, auditable grammar instead of guessing at prose.
  // Each nonempty line is "Refs #123" (an optional bullet is allowed), or a full
  // same-repository issue URL. Multiple issues use separate lines.
  const result = [];
  for (const line of section.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
    const value = line.replace(/^[-*][ \t]+/, '').replace(/^(?:Refs|References|Closes|Fixes|Resolves):?[ \t]+/i, '').trim();
    let number;
    if (/^#[1-9]\d*$/.test(value)) number = Number(value.slice(1));
    else {
      const match = value.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/([1-9]\d*)\/?$/i);
      if (!match || match[1].toLowerCase() !== repository.toLowerCase()) {
        throw new Error('Use Refs #123 or an exact https://github.com/OWNER/REPO/issues/123 URL for this repository, one per line.');
      }
      number = Number(match[2]);
    }
    if (!Number.isSafeInteger(number)) throw new Error('Invalid issue number.');
    result.push(number);
  }
  const unique = [...new Set(result)];
  if (!unique.length) throw new Error('Tracking issues must list at least one real issue; placeholders do not count.');
  if (unique.length > 100) throw new Error('List at most 100 tracking issues. Split the release if necessary.');
  return unique;
}

export async function validate({ body, repository, getIssue }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('Invalid repository.');
  const numbers = references(body, repository);
  for (const number of numbers) {
    const issue = await getIssue(number);
    // The issues REST endpoint also returns PRs. Do not accept those as issues.
    if (!issue || issue.pull_request || issue.number !== number || !issue.id ||
        !['open', 'closed'].includes(issue.state) ||
        issue.html_url?.toLowerCase() !== `https://github.com/${repository}/issues/${number}`.toLowerCase()) {
      throw new Error(`#${number} is not a verified tracking issue in this repository.`);
    }
  }
  return numbers;
}

export async function run({ env = process.env, fetchImpl = fetch } = {}) {
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
    if (!response.ok) throw new Error(`GitHub verification failed (HTTP ${response.status}); no issue links accepted.`);
    return response.json();
  };
  // Read the current body, never a stale event body. Check both ends of the read
  // so a concurrent head/body/base change cannot receive this run's success.
  const pr = await get(`pulls/${number}`);
  const same = (a, b) => a.head?.sha === b.head?.sha && a.base?.ref === b.base?.ref && a.body === b.body && a.state === b.state;
  if (pr.head?.sha !== event.pull_request.head?.sha || pr.base?.ref !== event.pull_request.base?.ref || pr.state !== 'open') {
    throw new Error('PR changed since this event. Rerun the latest PR event.');
  }
  const numbers = await validate({ body: pr.body, repository, getIssue: n => get(`issues/${n}`) });
  if (!same(pr, await get(`pulls/${number}`))) throw new Error('PR changed during verification. Rerun the latest PR event.');
  console.log(`Verified ${numbers.length} tracking issue(s): ${numbers.map(n => `#${n}`).join(', ')}.`);
  return numbers;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(() => {
    // Never echo API bodies, issue text, untrusted workflow commands or tokens.
    console.error('::error::Tracking issue verification failed. Use one real same-repository issue per line under ## Tracking issues (Refs #123); check API availability and rerun the latest event.');
    process.exitCode = 1;
  });
}
