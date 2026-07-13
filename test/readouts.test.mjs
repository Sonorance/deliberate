import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'dlb-readouts-'));
process.env.SONORANCE_HOME = home;
process.env.DELIBERATE_MODEL = 'stub';

const { openVault } = await import('sonorance/plugins/deliberate/vault.mjs');
const { readoutPeriod, readoutPrompt, persistReadout } = await import('../src/engine/readouts.mjs');
const { loadReadoutCharts, normalizeTrendChartSpec, renderTrendChart } = await import('../src/engine/readout-charts.mjs');
const { createProjectWithId } = await import('./project-fixture.mjs');

let store, pid;
before(() => {
  store = openVault();
  pid = createProjectWithId(store, 'rp', 'ReadoutProj').id;
  store.writeContext(pid, '# ReadoutProj\n\n## Metrics & traction\n\n- Weekly value moments — count of completed value events; source: analytics query; desired direction: up; period: completed calendar week, Monday–Sunday, America/Chicago; comparison: previous calendar week (WoW); segment: project.\n');
});
after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });

const DAY = 86400000;
const trendSpec = {
  title: 'Weekly value moments',
  unit: 'events',
  comparison: 'WoW',
  source: 'https://metrics.example/query',
  series: [
    { period_start: '2026-06-01', period_end: '2026-06-07', value: 8 },
    { period_start: '2026-06-08', period_end: '2026-06-14', value: 10 },
    { period_start: '2026-06-15', period_end: '2026-06-21', value: 9 },
    { period_start: '2026-06-22', period_end: '2026-06-28', value: 13 },
  ],
};

test('readoutPeriod: defaults to the previous completed Monday–Sunday calendar week', () => {
  const at = Date.UTC(2026, 6, 10, 15);
  const period = readoutPeriod(store, pid, at);
  assert.equal(period.firstEver, true);
  assert.equal(period.custom, false);
  assert.equal(period.start, Date.UTC(2026, 5, 29));
  assert.equal(period.end, Date.UTC(2026, 6, 6) - 1);
  assert.equal(period.comparisonStart, Date.UTC(2026, 5, 22));
  assert.equal(period.comparisonEnd, Date.UTC(2026, 5, 29) - 1);
});

test('readoutPeriod: accepts a completed calendar-month override and chooses the prior month for comparison', () => {
  const period = readoutPeriod(store, pid, Date.UTC(2026, 6, 10), { periodStart: '2026-05-01', periodEnd: '2026-05-31' });
  assert.equal(period.custom, true);
  assert.equal(period.start, Date.UTC(2026, 4, 1));
  assert.equal(period.end, Date.UTC(2026, 5, 1) - 1);
  assert.equal(period.comparisonStart, Date.UTC(2026, 3, 1));
  assert.equal(period.comparisonEnd, Date.UTC(2026, 4, 1) - 1);
});

test('readoutPeriod: rejects incomplete, invalid, and half-specified overrides', () => {
  const at = Date.UTC(2026, 6, 10, 15);
  assert.throws(() => readoutPeriod(store, pid, at, { periodStart: '2026-07-01', periodEnd: '2026-07-31' }), /must be fully completed/);
  assert.throws(() => readoutPeriod(store, pid, at, { periodStart: '2026-06-31', periodEnd: '2026-07-01' }), /valid calendar date/);
  assert.throws(() => readoutPeriod(store, pid, at, { periodStart: '2026-06-01' }), /must be provided together/);
  assert.throws(() => readoutPeriod(store, pid, at, { timeZone: 'Chicago-ish' }), /valid IANA timezone/);
});

test('readoutPeriod: evaluates completion and the default week in the project timezone', () => {
  const nearUtcMidnight = Date.UTC(2026, 6, 10, 0, 30);
  assert.throws(
    () => readoutPeriod(store, pid, nearUtcMidnight, {
      periodStart: '2026-07-01',
      periodEnd: '2026-07-09',
      timeZone: 'America/Los_Angeles',
    }),
    /must be fully completed/,
    'July 9 is still in progress while Los Angeles remains on July 9',
  );
  assert.doesNotThrow(() => readoutPeriod(store, pid, nearUtcMidnight, {
    periodStart: '2026-07-01',
    periodEnd: '2026-07-09',
    timeZone: 'UTC',
  }));

  const mondayUtcButSundayPacific = Date.UTC(2026, 6, 6, 0, 30);
  const utc = readoutPeriod(store, pid, mondayUtcButSundayPacific, { timeZone: 'UTC' });
  const pacific = readoutPeriod(store, pid, mondayUtcButSundayPacific, { timeZone: 'America/Los_Angeles' });
  assert.equal(utc.start, Date.UTC(2026, 5, 29));
  assert.equal(pacific.start, Date.UTC(2026, 5, 22));
});

test('readoutPrompt makes one completed reporting period the ground for the whole report', async () => {
  store.addSource(pid, 'https://metrics.example/dashboard', 'Weekly product metrics', 'metrics-data');
  store.addSource(pid, '/research/interviews', 'Customer interviews', 'customer-voice');
  const { system, user, template } = await readoutPrompt(store, store.getProject(pid), { at: Date.UTC(2026, 6, 30) });
  assert.match(system, /Metrics & data/, 'source category labels are included');
  assert.match(system, /Customer voice/, 'customer evidence category is included');
  assert.match(system, /metrics\.example\/dashboard/, 'configured evidence location is included');
  assert.match(system, /product readout/i, 'the product readout method is injected');
  assert.match(system, /Reporter/, 'the Reporter instructions are injected');
  assert.match(system, /one completed reporting period grounds the entire report/i, 'all evidence uses one completed period');
  assert.match(system, /percentage-point change/i, 'rate changes use percentage points');
  assert.match(user, /FIRST readout/, 'the first reporting period is explicit');
  assert.doesNotMatch(user, /establish a baseline/i, 'a first readout does not create a time-sensitive baseline');
  assert.match(user, /## Reporting period \(STRICT\)/);
  assert.match(user, /timezone: UTC/);
  assert.match(user, /period_start:/);
  assert.match(user, /period_end:/);
  assert.match(user, /comparison_start:/);
  assert.match(user, /This completed period grounds the entire report: metrics, customer evidence, releases, experiments, incidents, takeaways, insights, and actions/i);
  assert.match(user, /Use only evidence inside it/i, 'out-of-period evidence is excluded');
  assert.match(template, /\| Metric \| Value \| Comparison \| Read \|/, 'the metric table does not repeat the report-level period');
  assert.doesNotMatch(template, /Latest complete period/i, 'the redundant per-metric period column is gone');
  assert.doesNotMatch(template, /\|\s*Target\s*\|/i, 'the readout has no target column');
  assert.match(template, /^Period:/m, 'the report has one authoritative period');
  assert.match(user, /----- OUTPUT TEMPLATE -----/);
});

test('readoutPrompt injects the prior readout without frontmatter', async () => {
  const p = createProjectWithId(store, 'rp-prev', 'ReadoutPrevious').id;
  store.writeContext(p, '# ReadoutPrevious\n\n## Metrics & traction\n\n- Activation.\n');
  const at = Date.UTC(2026, 6, 30);
  store.createReadout(p, {
    period_start: at - 40 * DAY,
    period_end: at - 10 * DAY,
    body: '# Product readout\n\n## Key takeaways\n\n- Activation rose 8%.',
  }, at - 10 * DAY);
  const { user } = await readoutPrompt(store, store.getProject(p), { at });
  assert.match(user, /Previous readout — read-only prior context/);
  assert.match(user, /Activation rose 8%/);
  assert.match(user, /previous readout is narrative context only, not the comparison period/i, 'the previous report is narrative context, not the metric comparator');
  assert.doesNotMatch(user, /type: deliberate\/readout/);
});

test('persistReadout cleans, stores, and creates a new date-keyed artifact each run', async () => {
  const p = createProjectWithId(store, 'rp-save', 'ReadoutSave').id;
  const at = Date.UTC(2026, 6, 30);
  const raw = '# Product readout\n\nPeriod: May 1, 2026 – May 31, 2026\n\nThis completes the task.\n\n## Key takeaways\n\n- Activation rose 8%. [Source](https://metrics.example)\n';
  const options = { at, periodStart: '2026-05-01', periodEnd: '2026-05-31' };
  const first = await persistReadout(store, store.getProject(p), raw, options);
  const second = await persistReadout(store, store.getProject(p), raw.replace('8%', '9%'), options);
  assert.notEqual(first.readout.id, second.readout.id, 'same-day runs create separate durable readouts');
  assert.equal(store.listReadouts(p).length, 2);
  assert.match(store.readReadoutRecord(first.readout.id).text, /Activation rose 8%/);
  assert.match(store.readReadoutRecord(second.readout.id).text, /Activation rose 9%/);
  assert.doesNotMatch(store.readReadoutRecord(first.readout.id).text, /This completes the task/);
  assert.equal(first.readout.period_start, Date.UTC(2026, 4, 1));
  assert.equal(first.readout.period_end, Date.UTC(2026, 5, 1) - 1);
});

test('persistReadout rejects a Period line that disagrees with the selected period', async () => {
  const p = createProjectWithId(store, 'rp-mismatch', 'ReadoutMismatch').id;
  const raw = '# Product readout\n\nPeriod: June 1, 2026 – June 30, 2026\n\n## Key takeaways\n\n- Activation rose.\n';
  await assert.rejects(
    persistReadout(store, store.getProject(p), raw, {
      at: Date.UTC(2026, 6, 30),
      periodStart: '2026-05-01',
      periodEnd: '2026-05-31',
    }),
    /Period must be exactly "May 1, 2026 – May 31, 2026"/,
  );
  assert.equal(store.listReadouts(p).length, 0, 'a mismatched report is never persisted');
});

test('persistReadout unwraps hard-wrapped prose', async () => {
  const p = createProjectWithId(store, 'rp-wrap', 'ReadoutWrap').id;
  const raw = '# Product readout\n\nPeriod: May 1, 2026 – May 31, 2026\n\n## Insights\n\n- Activation increased across self-serve customers, while\nenterprise activation remained flat. [Source](https://metrics.example)\n';
  const { readout } = await persistReadout(store, store.getProject(p), raw, {
    at: Date.UTC(2026, 6, 30),
    periodStart: '2026-05-01',
    periodEnd: '2026-05-31',
  });
  const rec = store.readReadoutRecord(readout.id);
  assert.match(rec.text, /customers, while enterprise activation remained flat/);
  assert.doesNotMatch(rec.text, /while\nenterprise/);
});

test('renderTrendChart validates normalized periods and produces an accessible deterministic SVG', async () => {
  const svg = await renderTrendChart(trendSpec);
  assert.match(svg, /^<svg[^>]+data-deliberate-chart="1"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title>Weekly value moments<\/title>/);
  assert.match(svg, /<desc>Weekly value moments\./);
  assert.match(svg, /WoW/);
  assert.match(svg, /https:\/\/metrics\.example\/query/);
  assert.throws(() => normalizeTrendChartSpec({ ...trendSpec, series: trendSpec.series.slice(0, 3) }), /at least 4 completed periods/);
  assert.throws(() => normalizeTrendChartSpec({ ...trendSpec, series: [...trendSpec.series].reverse() }), /strictly ordered/);
  assert.throws(() => normalizeTrendChartSpec({ ...trendSpec, series: trendSpec.series.map((p, i) => i === 2 ? { ...p, value: NaN } : p) }), /must be finite/);
});

test('renderTrendChart preserves explicit missing periods as visible gaps', async () => {
  const svg = await renderTrendChart({
    ...trendSpec,
    series: [
      ...trendSpec.series.slice(0, 2),
      { period_start: '2026-06-15', period_end: '2026-06-21', value: null },
      { period_start: '2026-06-22', period_end: '2026-06-28', value: 9 },
      { period_start: '2026-06-29', period_end: '2026-07-05', value: 11 },
    ],
  });
  const linePath = svg.match(/aria-roledescription="line mark" d="([^"]+)"/)?.[1];
  assert.ok(linePath, 'the trend line is rendered');
  assert.equal(linePath.match(/M/g)?.length, 2, 'the line restarts after the missing period');
  assert.doesNotMatch(svg, /value: 0; Period: 2026-06-15/, 'a missing observation is never plotted as zero');
});

test('a readout bundle persists referenced SVG charts atomically beside readout.md', async () => {
  const p = createProjectWithId(store, 'rp-charts', 'ReadoutCharts').id;
  const bundle = mkdtempSync(join(tmpdir(), 'readout-bundle-'));
  const chartsDir = join(bundle, 'charts');
  mkdirSync(chartsDir);
  const svg = await renderTrendChart(trendSpec);
  writeFileSync(join(chartsDir, 'weekly-value-moments.svg'), svg);
  const body = '# Product readout\n\nPeriod: June 1, 2026 – June 30, 2026\n\n## Key metrics\n\n![Weekly value moments over four completed weeks](charts/weekly-value-moments.svg)\n';
  writeFileSync(join(bundle, 'readout.md'), body);
  const charts = loadReadoutCharts(bundle, body);
  const { readout } = await persistReadout(store, store.getProject(p), body, {
    at: Date.UTC(2026, 6, 30),
    charts,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
  });
  const reportFile = store.readoutFilePath(readout.id);
  const chartFile = join(dirname(reportFile), 'charts', 'weekly-value-moments.svg');
  assert.equal(charts.length, 1);
  assert.ok(existsSync(chartFile));
  assert.match(readFileSync(chartFile, 'utf8'), /data-deliberate-chart="1"/);
  assert.match(store.readReadoutRecord(readout.id).text, /charts\/weekly-value-moments\.svg/);
  rmSync(bundle, { recursive: true, force: true });
});

test('readout bundles reject missing, unreferenced, or non-generated chart assets', async () => {
  const bundle = mkdtempSync(join(tmpdir(), 'readout-invalid-bundle-'));
  const chartsDir = join(bundle, 'charts');
  mkdirSync(chartsDir);
  const ref = '![Trend](charts/trend.svg)';
  assert.throws(() => loadReadoutCharts(bundle, ref), /missing chart/);
  writeFileSync(join(chartsDir, 'trend.svg'), '<svg><script>alert(1)</script></svg>');
  assert.throws(() => loadReadoutCharts(bundle, ref), /not a safe Deliberate-generated SVG/);
  writeFileSync(join(chartsDir, 'trend.svg'), await renderTrendChart({ ...trendSpec, source: 'https://metrics.example/query?onset=baseline' }));
  assert.equal(loadReadoutCharts(bundle, ref).length, 1, 'event-like source text is not mistaken for an SVG attribute');
  writeFileSync(join(chartsDir, 'trend.svg'), '<svg data-deliberate-chart="1" onload="alert(1)"></svg>');
  assert.throws(() => loadReadoutCharts(bundle, ref), /not a safe Deliberate-generated SVG/);
  writeFileSync(join(chartsDir, 'trend.svg'), await renderTrendChart(trendSpec));
  assert.throws(() => loadReadoutCharts(bundle, '# No chart reference'), /unreferenced chart/);
  rmSync(bundle, { recursive: true, force: true });
});
