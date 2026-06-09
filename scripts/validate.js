#!/usr/bin/env node
/* eslint-disable */
//
// Companion to scripts/validate.sh. See that file for behavior.
//

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default;
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIRS = {
  'v0.1': path.join(ROOT, 'schemas', 'v0.1'),
  'v0.2': path.join(ROOT, 'schemas', 'v0.2'),
};

// Artifact kinds and the schema versions in which they are published.
// v0.2 is an overlay (RFC 0009): artifacts not redefined there keep
// validating against v0.1. For multi-version artifacts the document's
// `spec_version` selects; the first listed version is the default.
const ARTIFACT_TO_SCHEMA = {
  'genome': { file: 'genome.schema.json', versions: ['v0.1', 'v0.2'] },
  'agent-lock': { file: 'agent-lock.schema.json', versions: ['v0.1'] },
  'behavior-contract': { file: 'behavior-contract.schema.json', versions: ['v0.1'] },
  'trace-event': { file: 'trace-event.schema.json', versions: ['v0.1'] },
  'replay-report': { file: 'replay-report.schema.json', versions: ['v0.1'] },
  'release-attestation': { file: 'release-attestation.schema.json', versions: ['v0.1'] },
  'atep-event': { file: 'atep-event.schema.json', versions: ['v0.1'] },
  'workflow': { file: 'workflow.schema.json', versions: ['v0.2'] },
  'system': { file: 'system.schema.json', versions: ['v0.2'] },
};

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function schemaRefFor(artifact, doc) {
  const entry = ARTIFACT_TO_SCHEMA[artifact];
  if (!entry) return null;
  const declared = doc && typeof doc.spec_version === 'string'
    ? doc.spec_version.replace(/^agenomic\//, '')
    : null;
  const version = declared && entry.versions.includes(declared)
    ? declared
    : entry.versions[0];
  return { version, file: entry.file, label: version + '/' + entry.file };
}

const compiledByPath = new Map();
function getValidator(ref) {
  if (!compiledByPath.has(ref.label)) {
    const full = path.join(SCHEMA_DIRS[ref.version], ref.file);
    const schema = JSON.parse(fs.readFileSync(full, 'utf8'));
    compiledByPath.set(ref.label, ajv.compile(schema));
  }
  return compiledByPath.get(ref.label);
}

function loadDoc(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.json') return JSON.parse(text);
  return yaml.load(text);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function isFixtureFile(p) {
  if (p.endsWith('.expected.json')) return false;
  return /\.(ya?ml|json)$/i.test(p);
}

function rel(p) {
  return path.relative(ROOT, p);
}

let failures = 0;
let passes = 0;

function fail(file, reason) {
  failures += 1;
  console.error(`FAIL  ${rel(file)}\n      ${reason}`);
}

function pass(file, note) {
  passes += 1;
  if (process.env.VERBOSE) {
    console.log(`PASS  ${rel(file)}${note ? '  ('+note+')' : ''}`);
  }
}

// --- examples/ -------------------------------------------------------------

function artifactForExampleFile(absPath) {
  // Map a few well-known filenames to their artifact kind. Other files are
  // not schema-validated (only YAML-parse-checked).
  const base = path.basename(absPath);
  const parent = path.basename(path.dirname(absPath));
  if (base === 'genome.yaml') return 'genome';
  if (base === 'agent.lock.yaml') return 'agent-lock';
  if (base === 'behavior.contract.yaml') return 'behavior-contract';
  if (base === 'system.yaml') return 'system';
  if (base === 'workflow.yaml' || parent === 'workflows') return 'workflow';
  return null;
}

const exampleFiles = walk(path.join(ROOT, 'examples'))
  .filter(p => /\.(ya?ml|json)$/i.test(p));

for (const file of exampleFiles) {
  let doc;
  try {
    doc = loadDoc(file);
  } catch (e) {
    fail(file, 'YAML/JSON parse error: ' + e.message);
    continue;
  }
  const artifact = artifactForExampleFile(file);
  if (!artifact) {
    pass(file, 'parsed only');
    continue;
  }
  const ref = schemaRefFor(artifact, doc);
  const validate = getValidator(ref);
  if (validate(doc)) {
    pass(file, ref.label);
  } else {
    fail(file, 'schema ' + ref.label + ' rejected: ' + JSON.stringify(validate.errors, null, 2));
  }
}

// --- conformance/valid/ ----------------------------------------------------

const validFiles = walk(path.join(ROOT, 'conformance', 'valid'))
  .filter(isFixtureFile);

for (const file of validFiles) {
  const r = path.relative(path.join(ROOT, 'conformance', 'valid'), file);
  const artifact = r.split(path.sep)[0];
  if (!ARTIFACT_TO_SCHEMA[artifact]) {
    fail(file, 'unknown artifact directory "' + artifact + '" under conformance/valid/');
    continue;
  }
  let doc;
  try {
    doc = loadDoc(file);
  } catch (e) {
    fail(file, 'YAML/JSON parse error: ' + e.message);
    continue;
  }
  const ref = schemaRefFor(artifact, doc);
  const validate = getValidator(ref);
  if (validate(doc)) {
    pass(file, ref.label);
  } else {
    fail(file, 'expected PASS but schema ' + ref.label + ' rejected: ' +
      JSON.stringify(validate.errors, null, 2));
  }
}

// --- conformance/invalid/ --------------------------------------------------

function expectedFileFor(fixtureFile) {
  // foo/bar/name.yaml -> foo/bar/name.expected.json
  const dir = path.dirname(fixtureFile);
  const base = path.basename(fixtureFile).replace(/\.(ya?ml|json)$/i, '');
  return path.join(dir, base + '.expected.json');
}

function errorMatches(err, expected) {
  if (!expected || !expected.match) return true;
  const m = expected.match;
  if (m.keyword !== undefined && err.keyword !== m.keyword) return false;
  if (m.instancePath !== undefined && err.instancePath !== m.instancePath) return false;
  if (m.schemaPath !== undefined && err.schemaPath !== m.schemaPath) return false;
  if (m.message !== undefined && (!err.message || !err.message.includes(m.message))) return false;
  if (m.params) {
    for (const [k, v] of Object.entries(m.params)) {
      if (!err.params || err.params[k] !== v) return false;
    }
  }
  return true;
}

const invalidFiles = walk(path.join(ROOT, 'conformance', 'invalid'))
  .filter(isFixtureFile);

for (const file of invalidFiles) {
  const r = path.relative(path.join(ROOT, 'conformance', 'invalid'), file);
  const artifact = r.split(path.sep)[0];
  if (!ARTIFACT_TO_SCHEMA[artifact]) {
    fail(file, 'unknown artifact directory "' + artifact + '" under conformance/invalid/');
    continue;
  }
  const expectedPath = expectedFileFor(file);
  if (!fs.existsSync(expectedPath)) {
    fail(file, 'missing sibling .expected.json: ' + rel(expectedPath));
    continue;
  }
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

  let doc;
  try {
    doc = loadDoc(file);
  } catch (e) {
    fail(file, 'YAML/JSON parse error in invalid fixture: ' + e.message);
    continue;
  }
  const ref = schemaRefFor(artifact, doc);
  const validate = getValidator(ref);
  if (validate(doc)) {
    fail(file, 'expected FAIL but schema ' + ref.label + ' accepted the fixture.');
    continue;
  }
  const matched = (validate.errors || []).some(err => errorMatches(err, expected));
  if (!matched) {
    fail(file,
      'fixture failed validation, but no error matched the expected constraints.\n' +
      '      expected: ' + JSON.stringify(expected.match) + '\n' +
      '      actual:   ' + JSON.stringify(validate.errors, null, 2));
    continue;
  }
  pass(file, 'rejected as expected by ' + ref.label);
}

// --- summary ---------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} failure(s), ${passes} pass(es).`);
  process.exit(1);
}
console.log(`OK — ${passes} fixture(s) validated.`);
