/**
 * readouts.mjs — the Reporter: a project-scoped product readout over configured
 * metrics, customer evidence, and product context. The host performs the source
 * research in-session; this LLM-free engine computes the reporting period,
 * assembles the grounded prompt, and persists the produced Markdown artifact.
 */
import { agentConfig } from './roles.mjs';
import { read, loadBody, loadSkills } from './prompts.mjs';
import { projectContext, cleanArtifact } from './pipeline.mjs';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';

export const READOUT_STAGE = 'readout';
const DAY = 86400000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const calendarDayAt = (ts, timeZone) => {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ts));
  } catch (error) {
    if (error instanceof RangeError) throw new Error('--timezone must be a valid IANA timezone');
    throw error;
  }
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
};

const parseDate = (value, label) => {
  if (!DATE_PATTERN.test(String(value || ''))) throw new Error(`${label} must be YYYY-MM-DD`);
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return timestamp;
};

function comparisonPeriod(start, end) {
  const endExclusive = end + 1;
  const startDate = new Date(start);
  const endDate = new Date(endExclusive);
  const wholeCalendarMonths = startDate.getUTCDate() === 1 && endDate.getUTCDate() === 1
    ? (endDate.getUTCFullYear() * 12 + endDate.getUTCMonth()) - (startDate.getUTCFullYear() * 12 + startDate.getUTCMonth())
    : 0;
  if (wholeCalendarMonths > 0) {
    const comparisonStart = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() - wholeCalendarMonths, 1);
    return { start: comparisonStart, end: start - 1 };
  }
  const duration = endExclusive - start;
  return { start: start - duration, end: start - 1 };
}

export function readoutPeriod(store, pid, at = Date.now(), { periodStart, periodEnd, timeZone = 'UTC' } = {}) {
  if (!!periodStart !== !!periodEnd) throw new Error('--period-start and --period-end must be provided together');
  const zone = timeZone || 'UTC';
  const today = calendarDayAt(at, zone);
  let start;
  let end;
  const custom = !!periodStart;
  if (custom) {
    start = parseDate(periodStart, '--period-start');
    end = parseDate(periodEnd, '--period-end') + DAY - 1;
    if (start > end) throw new Error('--period-start must be on or before --period-end');
    if (end >= today) throw new Error('the readout period must be fully completed; --period-end must be before today');
  } else {
    const weekday = new Date(today).getUTCDay();
    const currentWeekStart = today - ((weekday + 6) % 7) * DAY;
    start = currentWeekStart - 7 * DAY;
    end = currentWeekStart - 1;
  }
  const last = store.lastReadoutEnd(pid);
  const firstEver = last == null;
  const comparison = comparisonPeriod(start, end);
  return { start, end, comparisonStart: comparison.start, comparisonEnd: comparison.end, firstEver, last, custom, timeZone: zone };
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const readoutPeriodLabel = (start, end) => `${fmtDate(start)} – ${fmtDate(end)}`;
const stripFrontmatter = (raw) => { const m = String(raw || '').match(/^---\n[\s\S]*?\n---\n?/); return m ? raw.slice(m[0].length) : String(raw || ''); };

export function previousReadoutBlock(store, pid) {
  const prev = (store.listReadouts(pid) || [])[0];
  if (!prev) return '';
  const rec = store.readReadoutRecord(prev.id);
  const body = stripFrontmatter(rec?.text).trim();
  if (!body) return '';
  return `## Previous readout — read-only prior context (${readoutPeriodLabel(prev.period_start, prev.period_end)})\nUse this to identify what materially changed, avoid repeating unchanged commentary, and preserve metric-definition continuity. Do not treat prior hypotheses as established facts.\n\n${body}`;
}

function windowNote(win) {
  const selection = win.custom ? 'the user-requested completed period' : 'the default previous completed calendar week';
  if (win.firstEver) return `This is the FIRST readout for this project. Analyze ${selection}.`;
  return `This is NOT the first readout. Analyze ${selection}; the previous readout is narrative context only, not the comparison period.`;
}

export async function readoutPrompt(store, project, { at = Date.now(), periodStart, periodEnd, timeZone } = {}) {
  const cfg = agentConfig(READOUT_STAGE);
  const instruction = await loadBody(cfg.instructions);
  const agents = await read('AGENTS.md');
  const template = await read(cfg.templates.default);
  const skillsBlock = (await loadSkills(cfg.skills)) || '(none)';
  const system = `${agents}\n\n${projectContext(store, project)}\n\n## Skills\n${skillsBlock}\n\n## Stage instructions\n${instruction}`;
  const win = readoutPeriod(store, project.id, at, { periodStart, periodEnd, timeZone });
  const windowBlock = `## Reporting period (STRICT)\n${windowNote(win)}\n- timezone: ${win.timeZone}\n- period_start: ${fmtDate(win.start)}\n- period_end: ${fmtDate(win.end)}\n- comparison_start: ${fmtDate(win.comparisonStart)}\n- comparison_end: ${fmtDate(win.comparisonEnd)}\nSet the readout's "Period:" line to exactly "${readoutPeriodLabel(win.start, win.end)}". This completed period grounds the entire report: metrics, customer evidence, releases, experiments, incidents, takeaways, insights, and actions. Use only evidence inside it. Compare metrics with the immediately preceding equivalent completed period shown above. Never mix in data from the period currently in progress.`;
  const previous = previousReadoutBlock(store, project.id);
  const tpl = `\n\n----- OUTPUT TEMPLATE -----\n(Fill every section with real, sourced content. Replace all italic guidance; never echo placeholders and do not add methodology, assumptions, notes, or a source appendix.)\n${template}`;
  const user = `${windowBlock}${previous ? `\n\n${previous}` : ''}\n\nProduce the product readout.${tpl}`;
  return { system, user, template, window: win, model: cfg.model };
}

export async function persistReadout(store, project, rawArtifact, { at = Date.now(), charts = [], periodStart, periodEnd, timeZone } = {}) {
  const cfg = agentConfig(READOUT_STAGE);
  const template = await read(cfg.templates.default);
  const body = unwrapProse(cleanArtifact(rawArtifact, template));
  const win = readoutPeriod(store, project.id, at, { periodStart, periodEnd, timeZone });
  const expectedPeriod = readoutPeriodLabel(win.start, win.end);
  const firstBodyLine = body.split(/\r?\n/).slice(1).find(line => line.trim())?.trim() || '';
  const artifactPeriod = firstBodyLine.match(/^Period:\s*(.+?)\s*$/i)?.[1]?.trim();
  if (artifactPeriod !== expectedPeriod) {
    throw new Error(`readout Period must be exactly "${expectedPeriod}" for the selected completed period`);
  }
  const readout = store.createReadout(project.id, {
    period_start: win.start, period_end: win.end, model: cfg.model, body, charts,
  }, at);
  return { readout, window: win };
}
