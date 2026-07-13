/**
 * log.mjs — append-only file log + process crash capture. Everything lands in
 * ~/.sonorance/sonorance.log so failed runs are diagnosable after the fact.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { appHome, logFile } from 'sonorance/plugins/deliberate/paths.mjs';

let file;
function path() { if (!file) { mkdirSync(appHome(), { recursive: true }); file = logFile(); } return file; }
export function log(level, msg, extra) {
  const line = `${new Date().toISOString()} ${level} ${msg}${extra ? ' ' + (extra.stack || JSON.stringify(extra)) : ''}\n`;
  try { appendFileSync(path(), line); } catch {}
  if (level === 'ERROR') console.error(line.trim()); else console.log(line.trim());
}
export const info = (m, e) => log('INFO', m, e);
export const error = (m, e) => log('ERROR', m, e);

// Keep the daemon alive and record why anything blew up.
export function installCrashHandlers() {
  process.on('uncaughtException', (e) => error('uncaughtException', e));
  process.on('unhandledRejection', (e) => error('unhandledRejection', e instanceof Error ? e : { reason: String(e) }));
}
