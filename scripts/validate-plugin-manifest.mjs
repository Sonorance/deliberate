import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import yaml from 'js-yaml';
import { AGENT_PLUGIN_SCHEMA_URL } from './plugin-manifests.mjs';

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schemas', 'agent-plugin-1.0.0.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
assert.equal(schema.$id, AGENT_PLUGIN_SCHEMA_URL, 'vendored Agent Plugins schema has the wrong canonical identifier');

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export function validateAgentPluginManifest(manifest, path = 'plugin.json') {
  if (validate(manifest)) return manifest;
  const details = ajv.errorsText(validate.errors, { separator: '; ' });
  assert.fail(`${path} does not conform to Agent Plugins 1.0.0: ${details}`);
}

const AGENT_SKILL_FIELDS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

export function validateAgentSkill(content, directoryName, path = 'SKILL.md') {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  assert.ok(match, `${path} must contain YAML frontmatter`);
  const metadata = yaml.load(match[1]);
  assert.ok(metadata && typeof metadata === 'object' && !Array.isArray(metadata), `${path} frontmatter must be an object`);
  const unexpected = Object.keys(metadata).filter((field) => !AGENT_SKILL_FIELDS.has(field));
  assert.deepEqual(unexpected, [], `${path} contains non-portable Agent Skills fields`);
  assert.equal(metadata.name, directoryName, `${path} name must match its directory`);
  assert.match(metadata.name, /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, `${path} has an invalid Agent Skills name`);
  assert.ok(typeof metadata.description === 'string' && metadata.description.length >= 1 && metadata.description.length <= 1024, `${path} has an invalid Agent Skills description`);
  if ('license' in metadata) assert.equal(typeof metadata.license, 'string', `${path} license must be a string`);
  if ('compatibility' in metadata) {
    assert.ok(typeof metadata.compatibility === 'string' && metadata.compatibility.length <= 500, `${path} compatibility must be a string of at most 500 characters`);
  }
  if ('allowed-tools' in metadata) assert.equal(typeof metadata['allowed-tools'], 'string', `${path} allowed-tools must be a string`);
  if ('metadata' in metadata) {
    assert.ok(metadata.metadata && typeof metadata.metadata === 'object' && !Array.isArray(metadata.metadata), `${path} metadata must be an object`);
    for (const [key, value] of Object.entries(metadata.metadata)) {
      assert.equal(typeof value, 'string', `${path} metadata.${key} must be a string`);
    }
  }
  return metadata;
}
