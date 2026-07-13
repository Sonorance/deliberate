/**
 * cases.mjs — case read helpers. The engine no longer runs the funnel itself: the
 * host harness drives every stage (create → `prompt` → produce → `save`), so there
 * is no headless run, rerun, gate-continue, background scheduler, or auto-resume here.
 * This module just exposes a convenience read (`caseDetail`) over the store.
 */
import { STAGES } from 'sonorance/plugins/deliberate/stages.mjs';
import { STATUS } from 'sonorance/plugins/deliberate/domain.mjs';

export const caseDetail = (store, pid, id) => ({
  case: store.getCase(id),
  stages: STAGES.map(name => {
    const st = store.listStages(id).find(s => s.name === name) || { name, status: STATUS.PENDING };
    const summary = st.status === STATUS.DONE ? (st.summary || store.readStage(pid, id, name, 'output_summary.md')) : null;
    return { ...st, summary };
  }),
});
