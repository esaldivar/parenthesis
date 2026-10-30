import { pathToFileURL } from 'node:url';

export const MONITOR_ID = 804458679;
export const MONITOR_URL = 'https://dev.parenthesisfamily.com/health/ready';
const statuses = { 0: 'Paused', 1: 'Not checked yet', 2: 'Up', 8: 'Seems down', 9: 'Down' };

function number(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function buildReport(data, now = new Date()) {
  if (data?.stat !== 'ok' || !Array.isArray(data.monitors)) {
    throw new Error('UptimeRobot did not return a successful monitor response.');
  }
  const monitor = data.monitors.find(item => Number(item.id) === MONITOR_ID);
  if (!monitor || monitor.url !== MONITOR_URL) {
    throw new Error('Expected UptimeRobot monitor and URL were not returned.');
  }
  const fields = [{ name: 'Current monitor status', value: statuses[monitor.status] ?? 'Unknown', inline: true }];
  const ratios = typeof monitor.custom_uptime_ratios === 'string'
    ? monitor.custom_uptime_ratios.split('-') : [];
  [1, 7, 30].forEach((days, index) => {
    const ratio = number(ratios[index]);
    if (ratio !== null && ratio <= 100) {
      fields.push({ name: 'Uptime · trailing ' + days + (days === 1 ? ' day' : ' days'), value: ratio.toFixed(3) + '%', inline: true });
    }
  });
  const end = Math.floor(now.getTime() / 1000);
  const samples = Array.isArray(monitor.response_times) ? monitor.response_times.filter(sample => {
    const time = number(sample.datetime);
    return time !== null && time >= end - 86400 && time <= end && number(sample.value) !== null;
  }).map(sample => number(sample.value)) : [];
  if (samples.length) {
    fields.push({ name: 'Mean of returned response samples · trailing 24h',
      value: (samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(0) + ' ms (' + samples.length + ' samples)', inline: false });
  }
  const interval = number(monitor.interval);
  if (interval !== null && interval > 0) {
    fields.push({ name: 'Configured check interval', value: interval + ' seconds', inline: true });
  }
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: 'Parenthesis · DEV daily health report',
      description: MONITOR_URL + '\nReported ' + new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'long'
      }).format(now),
      color: Number(monitor.status) === 2 ? 0x2e7d32 : 0xf9a825,
      fields, timestamp: now.toISOString(),
      footer: { text: 'Source: UptimeRobot monitor ' + MONITOR_ID + '. Missing metrics omitted; sampled checks do not guarantee continuous availability. Existing outage alerts are separate.' }
    }]
  };
}

async function request(fetchImpl, url, options, label) {
  let response;
  try {
    response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error(label + ' request failed (network, timeout or redirect).');
  }
  if (!response.ok) throw new Error(label + ' returned HTTP ' + response.status + '.');
  return response;
}

export async function run({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  if (!env.UPTIMEROBOT_API_KEY?.trim()) throw new Error('UPTIMEROBOT_API_KEY is missing.');
  if (!env.DISCORD_WEBHOOK_URL?.trim()) throw new Error('DISCORD_WEBHOOK_URL is missing.');
  let webhook;
  try { webhook = new URL(env.DISCORD_WEBHOOK_URL.trim()); } catch { throw new Error('Invalid Discord webhook URL.'); }
  if (webhook.protocol !== 'https:' || webhook.hostname !== 'discord.com' ||
      webhook.port || webhook.username || webhook.password ||
      !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(webhook.pathname)) {
    throw new Error('Invalid Discord webhook URL.');
  }
  const end = Math.floor(now.getTime() / 1000);
  const body = new URLSearchParams({
    api_key: env.UPTIMEROBOT_API_KEY.trim(), format: 'json', monitors: String(MONITOR_ID),
    custom_uptime_ratios: '1-7-30', response_times: '1', response_times_average: '0',
    response_times_start_date: String(end - 86400), response_times_end_date: String(end)
  });
  const response = await request(fetchImpl, 'https://api.uptimerobot.com/v2/getMonitors',
    { method: 'POST', body }, 'UptimeRobot');
  let data;
  try { data = await response.json(); } catch { throw new Error('UptimeRobot returned invalid JSON.'); }
  const payload = buildReport(data, now);
  webhook.searchParams.set('wait', 'true');
  // Do not retry webhook POSTs: an ambiguous network failure may already have delivered the message.
  await request(fetchImpl, webhook.toString(), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }, 'Discord');
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then(() => console.log('Daily health report delivered to Discord.')).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
