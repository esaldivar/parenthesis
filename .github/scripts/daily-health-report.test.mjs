import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, run, MONITOR_ID, MONITOR_URL } from './daily-health-report.mjs';

const now = new Date('2026-10-28T13:00:00Z');
const end = now.getTime() / 1000;
const env = { UPTIMEROBOT_API_KEY: 'synthetic-key', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/synthetic-token' };
const fixture = (extra = {}) => ({ stat: 'ok', monitors: [{ id: MONITOR_ID, url: MONITOR_URL, status: 2, ...extra }] });
const fields = data => buildReport(data, now).embeds[0].fields;
const ok = data => ({ ok: true, status: 200, json: async () => data });

test('uses real ratios and only valid samples inside the last 24h; zero is valid', () => {
  const report = buildReport(fixture({ custom_uptime_ratios: '0-99.9-100', interval: 3600,
    response_times: [
      { datetime: end, value: 0 }, { datetime: end - 3600, value: 200 },
      { datetime: end - 86401, value: 999 }, { datetime: end + 1, value: 999 },
      { datetime: end, value: null }, { datetime: end, value: -1 }
    ] }), now);
  assert.deepEqual(report.allowed_mentions, { parse: [] });
  assert.equal(report.embeds[0].fields[1].value, '0.000%');
  assert.equal(report.embeds[0].fields[4].value, '100 ms (2 samples)');
  assert.equal(report.embeds[0].fields[5].value, '3600 seconds');
});

test('missing, blank, sentinel and invalid metrics are omitted, never fabricated as zero', () => {
  assert.equal(fields(fixture()).length, 1);
  for (const ratios of ['', 'not-a-number-101', null]) {
    assert.equal(fields(fixture({ custom_uptime_ratios: ratios, response_times: [] })).length, 1);
  }
  assert.equal(fields(fixture({ custom_uptime_ratios: '99--100' })).length, 3);
  assert.equal(fields(fixture({ custom_uptime_ratios: '0.000-0.000-0.000' })).length, 4);
});

test('all documented statuses and unknown status are described honestly', () => {
  for (const [status, expected] of [[0, 'Paused'], [1, 'Not checked yet'], [2, 'Up'], [8, 'Seems down'], [9, 'Down'], [77, 'Unknown']]) {
    assert.equal(fields(fixture({ status }))[0].value, expected);
  }
});

test('API failure, missing monitor and wrong endpoint fail closed', () => {
  for (const data of [{ stat: 'fail' }, { stat: 'ok', monitors: [] }, fixture({ url: 'https://example.test' })]) {
    assert.throws(() => buildReport(data, now));
  }
});

test('timestamp display follows America/Chicago before and after both DST transitions', () => {
  for (const [iso, zone] of [
    ['2026-03-07T14:00:00Z', 'CST'], ['2026-03-08T13:00:00Z', 'CDT'],
    ['2026-10-31T13:00:00Z', 'CDT'], ['2026-11-01T14:00:00Z', 'CST']
  ]) {
    const text = buildReport(fixture(), new Date(iso)).embeds[0].description;
    assert.match(text, /8:00:00 AM/);
    assert.ok(text.endsWith(zone));
  }
});

test('reads just the existing monitor, posts once, and requests Discord confirmation', async () => {
  const calls = [];
  await run({ env, now, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return ok(calls.length === 1 ? fixture() : {});
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.uptimerobot.com/v2/getMonitors');
  assert.equal(calls[0].options.body.get('monitors'), String(MONITOR_ID));
  assert.equal(calls[0].options.body.get('response_times_start_date'), String(end - 86400));
  assert.equal(calls[0].options.body.get('custom_uptime_ratios'), '1-7-30');
  assert.equal(new URL(calls[1].url).searchParams.get('wait'), 'true');
  assert.deepEqual(JSON.parse(calls[1].options.body).allowed_mentions, { parse: [] });
  assert.ok(calls.every(call => call.options.redirect === 'error' && call.options.signal));
});

test('bad configuration never sends a request', async () => {
  for (const config of [{}, { ...env, DISCORD_WEBHOOK_URL: 'https://example.test/api/webhooks/123/token' }]) {
    await assert.rejects(run({ env: config, fetchImpl: () => assert.fail('unexpected request') }));
  }
});

test('failure responses do not post fake healthy reports or leak response bodies', async () => {
  for (const first of [
    { ok: false, status: 401 }, ok({ stat: 'fail', error: { message: env.UPTIMEROBOT_API_KEY } }),
    { ok: true, json: async () => { throw new Error(env.UPTIMEROBOT_API_KEY); } }
  ]) {
    let calls = 0;
    await assert.rejects(run({ env, now, fetchImpl: async () => { calls++; return first; } }),
      error => !error.message.includes(env.UPTIMEROBOT_API_KEY));
    assert.equal(calls, 1);
  }
});

test('Discord errors fail the run and are never retried, including network failures', async () => {
  for (const failure of [429, 500, 'network']) {
    let calls = 0;
    await assert.rejects(run({ env, now, fetchImpl: async () => {
      if (++calls === 1) return ok(fixture());
      if (failure === 'network') throw new Error(env.DISCORD_WEBHOOK_URL);
      return { ok: false, status: failure };
    } }), error => !error.message.includes(env.DISCORD_WEBHOOK_URL));
    assert.equal(calls, 2);
  }
});
