import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapProse } from 'sonorance/plugins/deliberate/markdown.mjs';

test('unwrapProse joins a hard-wrapped paragraph into one logical line', () => {
  const wrapped = [
    "No — as scoped, the app's exports carry no attribution, watermark, or referral back to the app itself, so",
    'sharing a film-look photo to Instagram or Messages does not expose new viewers to the product; this',
    'concept has no built-in product-led growth loop.',
  ].join('\n');
  const expected = "No — as scoped, the app's exports carry no attribution, watermark, or referral back to the app itself, so sharing a film-look photo to Instagram or Messages does not expose new viewers to the product; this concept has no built-in product-led growth loop.";
  assert.equal(unwrapProse(wrapped), expected);
});

test('unwrapProse keeps blank lines between paragraphs (each paragraph stays one line)', () => {
  const src = 'First paragraph that\nwraps once.\n\nSecond paragraph that\nalso wraps.';
  assert.equal(unwrapProse(src), 'First paragraph that wraps once.\n\nSecond paragraph that also wraps.');
});

test('unwrapProse keeps each list item on its own line and unwraps wrapped item text', () => {
  const src = [
    '- I want to share a snapshot of a decision, so I',
    '  can hand it to a stakeholder.',
    '- A second, short item.',
    '1. Ordered one that\n   wraps too.',
  ].join('\n');
  assert.equal(unwrapProse(src), [
    '- I want to share a snapshot of a decision, so I can hand it to a stakeholder.',
    '- A second, short item.',
    '1. Ordered one that wraps too.',
  ].join('\n'));
});

test('unwrapProse preserves headings, thematic breaks, and table rows verbatim', () => {
  const src = [
    '## Competitive landscape',
    'A lead-in sentence that',
    'wraps onto two lines.',
    '',
    '| Competitor | Offers it? |',
    '|---|---|',
    '| Notion AI | partly |',
    '',
    '---',
  ].join('\n');
  assert.equal(unwrapProse(src), [
    '## Competitive landscape',
    'A lead-in sentence that wraps onto two lines.',
    '',
    '| Competitor | Offers it? |',
    '|---|---|',
    '| Notion AI | partly |',
    '',
    '---',
  ].join('\n'));
});

test('unwrapProse never touches content inside fenced code blocks', () => {
  const src = '```\nconst a = 1\nconst b = 2\n```\nProse that\nwraps.';
  assert.equal(unwrapProse(src), '```\nconst a = 1\nconst b = 2\n```\nProse that wraps.');
});

test('unwrapProse unwraps a wrapped block quote but keeps the marker', () => {
  const src = '> A quoted line that\nis continued.';
  assert.equal(unwrapProse(src), '> A quoted line that is continued.');
});
