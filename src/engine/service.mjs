/**
 * service.mjs — public facade for the engine's high-level operations, used by the
 * CLI. Split across focused modules (projects / cases) plus the pipeline engine;
 * this barrel keeps a single, stable import surface so callers don't depend on the
 * layout. Context derivation is host-driven now (the harness writes deliberate/context/product.md), so
 * there is no engine `computeContext`; titling is likewise the host's job.
 */
export { setCurrentProject, openProjectVault } from './projects.mjs';
export { caseDetail } from './cases.mjs';
export { projectContext, stagePrompt, persistStage } from './pipeline.mjs';
export { onepagerPrompt, persistOnepager, ONEPAGER_STAGE } from './onepager.mjs';
export { scorePrompt, persistScore, SCORE_STAGE } from './score.mjs';
export { prototypePrompt, persistPrototype, PROTO_STAGE } from './prototype.mjs';
export { briefWindow, briefPrompt, persistBrief, briefPeriodLabel, BRIEF_STAGE } from './briefs.mjs';
export { readoutPeriod, readoutPrompt, persistReadout, readoutPeriodLabel, READOUT_STAGE } from './readouts.mjs';
export { normalizeTrendChartSpec, renderTrendChart, renderTrendChartFile, loadReadoutCharts } from './readout-charts.mjs';
export { matchupPrompt, persistMatchup, matchupAsOfLabel, MATCHUP_STAGE } from './matchups.mjs';
export { initPrompt, INIT_STAGE } from './init.mjs';
