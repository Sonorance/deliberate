import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_PLUGIN_SCHEMA_URL = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const DELIBERATE_EXTENSION_NAMESPACE = 'com.trydeliberate';
export const GENERATED_MANIFEST_PATHS = [
  '.github/plugin/marketplace.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
  'gemini-extension.json',
  '.cursor-plugin/plugin.json',
];

const marketplaceDescription = 'Analyze grounded product decisions, monitor the market, read product evidence, and keep every result as reviewable files.';

export function projectPluginManifests(plugin) {
  const extension = plugin.extensions?.[DELIBERATE_EXTENSION_NAMESPACE];
  assert.equal(extension?.category, 'productivity', `plugin.json must define ${DELIBERATE_EXTENSION_NAMESPACE}.category`);
  assert.deepEqual(extension?.skills, ['skills/'], `plugin.json must define ${DELIBERATE_EXTENSION_NAMESPACE}.skills`);
  const base = {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
  };
  const nativeBase = {
    ...base,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    license: plugin.license,
  };

  return {
    '.github/plugin/marketplace.json': {
      name: plugin.name,
      owner: { name: plugin.author.name },
      metadata: {
        description: 'Files-first product workflows inside your agent',
        version: plugin.version,
      },
      plugins: [{
        name: plugin.name,
        description: marketplaceDescription,
        version: plugin.version,
        author: { name: plugin.author.name },
        source: '.',
        category: extension.category,
        homepage: plugin.homepage,
      }],
    },
    '.claude-plugin/plugin.json': {
      ...nativeBase,
      skills: './skills/',
    },
    '.claude-plugin/marketplace.json': {
      name: plugin.name,
      owner: { name: plugin.author.name },
      version: plugin.version,
      description: 'Files-first product workflows inside your agent.',
      plugins: [{
        name: plugin.name,
        source: '.',
        version: plugin.version,
        description: marketplaceDescription,
        author: plugin.author,
        homepage: plugin.homepage,
        repository: plugin.repository,
      }],
    },
    '.codex-plugin/plugin.json': {
      ...nativeBase,
      skills: './skills/',
    },
    '.agents/plugins/marketplace.json': {
      name: plugin.name,
      interface: { displayName: 'Deliberate' },
      plugins: [{
        name: plugin.name,
        version: plugin.version,
        source: {
          source: 'local',
          path: './',
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: 'Productivity',
      }],
    },
    'gemini-extension.json': base,
    '.cursor-plugin/plugin.json': {
      ...base,
      author: { name: plugin.author.name },
      homepage: plugin.homepage,
      repository: plugin.repository,
      license: plugin.license,
    },
  };
}

export function generatePluginManifests(root) {
  const plugin = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'));
  const manifests = projectPluginManifests(plugin);
  for (const path of GENERATED_MANIFEST_PATHS) {
    writeFileSync(join(root, path), `${JSON.stringify(manifests[path], null, 2)}\n`);
  }
  return manifests;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  generatePluginManifests(root);
  process.stdout.write(`Generated ${GENERATED_MANIFEST_PATHS.length} native manifests from plugin.json.\n`);
}
