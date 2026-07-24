import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';

const repoRoot = join(import.meta.dirname, '..');
const issueTemplateRoot = join(repoRoot, '.github', 'ISSUE_TEMPLATE');
const privateReportUrl = 'https://github.com/Sonorance/deliberate/security/advisories/new';

test('public issue intake keeps sensitive reports private', () => {
  const config = load(readFileSync(join(issueTemplateRoot, 'config.yml'), 'utf8'));
  assert.equal(config.blank_issues_enabled, false);
  assert.ok(config.contact_links.some((link) => link.url === privateReportUrl));

  for (const filename of ['bug.yml', 'support.yml', 'product-feedback.yml']) {
    const form = load(readFileSync(join(issueTemplateRoot, filename), 'utf8'));
    assert.ok(form.name);
    assert.ok(form.description);
    assert.ok(Array.isArray(form.body) && form.body.length > 0);
    assert.ok(form.body.some((item) => item.id === 'public-data'));
  }

  const policy = readFileSync(join(repoRoot, 'SECURITY.md'), 'utf8');
  assert.match(policy, new RegExp(privateReportUrl.replaceAll('/', '\\/')));
  assert.match(policy, /Do not open a public issue/);
});

