export const CASE_LENS = Object.freeze({
  PRODUCT: 'product',
  MARKET: 'market',
  STRATEGY: 'strategy',
  PLATFORM: 'platform',
});

export const DEFAULT_CASE_LENS = CASE_LENS.PRODUCT;
export const CASE_LENSES = Object.freeze(Object.values(CASE_LENS));
export const CASE_LENS_LABELS = Object.freeze({
  [CASE_LENS.PRODUCT]: 'product & experience',
  [CASE_LENS.MARKET]: 'market & commercial',
  [CASE_LENS.STRATEGY]: 'strategy & portfolio',
  [CASE_LENS.PLATFORM]: 'platform & ecosystem',
});
export const PROTOTYPE_LENSES = Object.freeze([CASE_LENS.PRODUCT, CASE_LENS.MARKET]);

export const isCaseLens = (value) => CASE_LENSES.includes(value);
export const caseLens = (kase) => isCaseLens(kase?.lens) ? kase.lens : DEFAULT_CASE_LENS;
export const caseLensLabel = (value) => CASE_LENS_LABELS[isCaseLens(value) ? value : DEFAULT_CASE_LENS];
export const supportsPrototype = (value) => PROTOTYPE_LENSES.includes(value);

export function requireCaseLens(value) {
  const lens = String(value || '');
  if (!isCaseLens(lens)) {
    throw new Error(`Unknown case lens "${lens}" — expected ${CASE_LENSES.join(', ')}`);
  }
  return lens;
}
