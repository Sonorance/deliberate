import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_FILE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.svg$/;
const MAX_CHARTS = 3;
const MAX_POINTS = 60;
const MAX_SVG_BYTES = 1_000_000;

const text = (value, field, max) => {
  const out = String(value || '').trim();
  if (!out) throw new Error(`chart ${field} is required`);
  if (out.length > max) throw new Error(`chart ${field} must be at most ${max} characters`);
  return out;
};

const dateValue = (value, field) => {
  const out = String(value || '');
  if (!ISO_DATE.test(out) || Number.isNaN(Date.parse(`${out}T00:00:00Z`))) {
    throw new Error(`chart ${field} must be an ISO date (YYYY-MM-DD)`);
  }
  return out;
};

export function normalizeTrendChartSpec(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('chart spec must be an object');
  const title = text(input.title, 'title', 100);
  const unit = text(input.unit, 'unit', 40);
  const comparison = text(input.comparison, 'comparison', 40);
  const source = text(input.source, 'source', 2048);
  if (!Array.isArray(input.series) || input.series.length < 4) throw new Error('chart series requires at least 4 completed periods');
  if (input.series.length > MAX_POINTS) throw new Error(`chart series supports at most ${MAX_POINTS} periods`);

  let previousEnd = '';
  const seen = new Set();
  const series = input.series.map((point, index) => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw new Error(`chart series[${index}] must be an object`);
    const period_start = dateValue(point.period_start, `series[${index}].period_start`);
    const period_end = dateValue(point.period_end, `series[${index}].period_end`);
    if (period_start > period_end) throw new Error(`chart series[${index}] starts after it ends`);
    if (previousEnd && period_end <= previousEnd) throw new Error('chart series must be strictly ordered by period_end');
    if (seen.has(period_end)) throw new Error(`chart series repeats period_end ${period_end}`);
    const value = point.value === null ? null : Number(point.value);
    if (value !== null && !Number.isFinite(value)) throw new Error(`chart series[${index}].value must be finite or null`);
    previousEnd = period_end;
    seen.add(period_end);
    return { period_start, period_end, value };
  });
  if (series.filter(point => point.value !== null).length < 4) {
    throw new Error('chart series requires at least 4 completed periods with finite values');
  }
  return { title, unit, comparison, source, series };
}

const xmlAttr = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const xmlText = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const hasUnsafeSvgMarkup = (svg) => {
  if (/<script\b|<foreignObject\b/i.test(svg)) return true;
  for (const match of svg.matchAll(/<[A-Za-z][^>]*>/g)) {
    const tag = match[0];
    const attributes = /\s([A-Za-z_:][A-Za-z0-9:._-]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
    for (const attribute of tag.matchAll(attributes)) {
      const name = attribute[1].toLowerCase();
      const value = String(attribute[2] || '').replace(/^(['"])([\s\S]*)\1$/, '$2');
      if (/^on[a-z]+$/.test(name)) return true;
      if ((name === 'href' || name.endsWith(':href') || name === 'src') && /^(?:https?:|data:)/i.test(value)) return true;
    }
  }
  return false;
};

export async function renderTrendChart(input) {
  const chart = normalizeTrendChartSpec(input);
  const first = chart.series[0];
  const last = chart.series.at(-1);
  const subtitle = `${chart.comparison} · ${first.period_start} – ${last.period_end} · ${chart.unit}`;
  const values = chart.series.map(point => ({
    period_end: `${point.period_end}T00:00:00Z`,
    period: point.period_start === point.period_end ? point.period_end : `${point.period_start} – ${point.period_end}`,
    value: point.value,
  }));
  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    width: 720,
    height: 260,
    background: '#ffffff',
    padding: { left: 12, right: 20, top: 12, bottom: 8 },
    title: {
      text: chart.title,
      subtitle,
      anchor: 'start',
      color: '#17212b',
      font: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 18,
      fontWeight: 650,
      subtitleColor: '#52606d',
      subtitleFont: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      subtitleFontSize: 12,
      subtitlePadding: 6,
      offset: 16,
    },
    data: { values },
    mark: {
      type: 'line',
      color: '#2f8299',
      strokeWidth: 3,
      invalid: 'break-paths-show-path-domains',
      point: { filled: true, fill: '#ffffff', stroke: '#2f8299', strokeWidth: 2, size: 58 },
    },
    encoding: {
      x: {
        field: 'period_end',
        type: 'temporal',
        axis: {
          title: null,
          format: '%b %d',
          grid: false,
          labelColor: '#52606d',
          labelFontSize: 11,
          labelOverlap: 'greedy',
          tickCount: 6,
          tickColor: '#9fb3c8',
          domainColor: '#9fb3c8',
        },
      },
      y: {
        field: 'value',
        type: 'quantitative',
        scale: { zero: true, nice: true },
        axis: {
          title: chart.unit,
          titleColor: '#334e68',
          titleFontSize: 12,
          titleFontWeight: 600,
          titlePadding: 12,
          labelColor: '#52606d',
          labelFontSize: 11,
          gridColor: '#d9e2ec',
          gridOpacity: 0.8,
          tickColor: '#9fb3c8',
          domain: false,
        },
      },
      tooltip: [
        { field: 'period', type: 'nominal', title: 'Period' },
        { field: 'value', type: 'quantitative', title: chart.unit },
      ],
    },
    config: {
      view: { stroke: null },
      axis: { labelFont: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', titleFont: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    },
  };
  const runtime = parse(compile(spec).spec);
  const view = new View(runtime, { renderer: 'none' });
  try {
    let svg = await view.toSVG();
    const aria = `${chart.title}. ${subtitle}. Source: ${chart.source}.`;
    svg = svg.replace('<svg ', `<svg data-deliberate-chart="1" role="img" aria-label="${xmlAttr(aria)}" `);
    svg = svg.replace(/(<svg[^>]*>)/, `$1<title>${xmlText(chart.title)}</title><desc>${xmlText(aria)}</desc>`);
    return svg;
  } finally {
    view.finalize();
  }
}

export async function renderTrendChartFile(specFile, outputFile) {
  if (extname(outputFile).toLowerCase() !== '.svg') throw new Error('chart output must end in .svg');
  let input;
  try { input = JSON.parse(readFileSync(specFile, 'utf8')); }
  catch (error) { throw new Error(`could not read chart spec: ${error.message}`); }
  const svg = await renderTrendChart(input);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, svg.endsWith('\n') ? svg : `${svg}\n`);
  return outputFile;
}

export function loadReadoutCharts(bundleDir, markdown) {
  const chartsDir = join(bundleDir, 'charts');
  const refs = [];
  const refPattern = /!\[([^\]]+)\]\((?:\.\/)?charts\/([a-zA-Z0-9][a-zA-Z0-9._-]*\.svg)(?:\s+"[^"]*")?\)/g;
  for (const match of String(markdown || '').matchAll(refPattern)) {
    if (!match[1].trim()) throw new Error('readout chart images require descriptive alt text');
    refs.push(match[2]);
  }
  if (!existsSync(chartsDir)) {
    if (refs.length) throw new Error('readout references charts, but the bundle has no charts/ directory');
    return [];
  }
  const entries = readdirSync(chartsDir, { withFileTypes: true });
  if (entries.some(entry => !entry.isFile())) throw new Error('readout charts/ may contain SVG files only');
  const names = entries.map(entry => entry.name).sort();
  if (names.length > MAX_CHARTS) throw new Error(`readout bundles support at most ${MAX_CHARTS} charts`);
  if (names.some(name => extname(name).toLowerCase() !== '.svg' || !SAFE_FILE.test(name))) {
    throw new Error('readout chart filenames must be lowercase, safe, and end in .svg');
  }
  const uniqueRefs = [...new Set(refs)];
  const missing = uniqueRefs.filter(name => !names.includes(name));
  if (missing.length) throw new Error(`readout references missing chart: ${missing.join(', ')}`);
  const unused = names.filter(name => !uniqueRefs.includes(name));
  if (unused.length) throw new Error(`readout bundle contains unreferenced chart: ${unused.join(', ')}`);

  return names.map(name => {
    const file = join(chartsDir, name);
    const size = statSync(file).size;
    if (!size || size > MAX_SVG_BYTES) throw new Error(`readout chart ${name} must be between 1 byte and ${MAX_SVG_BYTES} bytes`);
    const content = readFileSync(file);
    const svg = content.toString('utf8');
    if (!svg.includes('data-deliberate-chart="1"') || hasUnsafeSvgMarkup(svg)) {
      throw new Error(`readout chart ${name} is not a safe Deliberate-generated SVG`);
    }
    return { name: basename(name), content };
  });
}
