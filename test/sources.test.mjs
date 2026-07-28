import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { externalSources, isExternalSource } from '../src/engine/sources.mjs';

test('sources distinguish project files from external paths and URLs', () => {
  const root = mkdtempSync(join(tmpdir(), 'deliberate-sources-'));
  const projectDir = join(root, 'project');
  const externalFile = join(root, 'external.md');
  const insideFile = join(projectDir, 'docs', 'context.md');
  mkdirSync(dirname(insideFile), { recursive: true });
  writeFileSync(insideFile, 'inside');
  writeFileSync(externalFile, 'outside');
  symlinkSync(insideFile, join(root, 'inside-link.md'));

  assert.equal(isExternalSource(projectDir, 'docs/context.md'), false);
  assert.equal(isExternalSource(projectDir, insideFile), false);
  assert.equal(isExternalSource(projectDir, pathToFileURL(insideFile).href), false);
  assert.equal(isExternalSource(projectDir, join(root, 'inside-link.md')), false);
  assert.equal(isExternalSource(projectDir, externalFile), true);
  assert.equal(isExternalSource(projectDir, pathToFileURL(externalFile).href), true);
  assert.equal(isExternalSource(projectDir, 'https://example.com/customer-research'), true);
  assert.equal(isExternalSource(projectDir, 'github.com/team/research'), true);
  assert.equal(isExternalSource(projectDir, 'git@example.com:team/research.git'), true);

  assert.deepEqual(
    externalSources(projectDir, [
      { location: insideFile },
      { location: externalFile },
      { location: 'https://example.com/customer-research' },
    ]),
    [{ location: externalFile }, { location: 'https://example.com/customer-research' }],
  );
});
