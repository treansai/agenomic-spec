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
const SCHEMA_DIR = path.join(ROOT, 'schemas', 'v0.1');

const ARTIFACT_TO_SCHEMA = {
  'genome': 'genome.schema.json',
  'agent-lock': 'agent-lock.schema.json',
  'behavior-contract': 'behavior-contract.schema.json',
  'trace-event': 'trace-event.schema.json',
  'replay-report': 'replay-report.schema.json',
  'release-attestation': 'release-attestation.schema.json',
  'atep-event': 'atep-event.schema.json',
};

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const compiledByPath = new Map();
function getValidator(schemaFile) {
  if (!compiledByPath.has(schemaFile)) {
    const full = path.join(SCHEMA_DIR, schemaFile);
    const schema = JSON.parse(fs.readFileSync(full, 'utf8'));
    compiledByPath.set(schemaFile, ajv.compile(schema));
  }
  return compiledByPath.get(schemaFile);
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

function schemaForExampleFile(relPath) {
  // Map a few well-known filenames to their schema. Other files are not
  // schema-validated (only YAML-parse-checked).
  const base = path.basename(relPath);
  if (base === 'genome.yaml') return ARTIFACT_TO_SCHEMA['genome'];
  if (base === 'agent.lock.yaml') return ARTIFACT_TO_SCHEMA['agent-lock'];
  if (base === 'behavior.contract.yaml') return ARTIFACT_TO_SCHEMA['behavior-contract'];
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
  const schemaFile = schemaForExampleFile(file);
  if (!schemaFile) {
    pass(file, 'parsed only');
    continue;
  }
  const validate = getValidator(schemaFile);
  if (validate(doc)) {
    pass(file, schemaFile);
  } else {
    fail(file, 'schema ' + schemaFile + ' rejected: ' + JSON.stringify(validate.errors, null, 2));
  }
}

// --- conformance/valid/ ----------------------------------------------------

const validFiles = walk(path.join(ROOT, 'conformance', 'valid'))
  .filter(isFixtureFile);

for (const file of validFiles) {
  const r = path.relative(path.join(ROOT, 'conformance', 'valid'), file);
  const artifact = r.split(path.sep)[0];
  const schemaFile = ARTIFACT_TO_SCHEMA[artifact];
  if (!schemaFile) {
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
  const validate = getValidator(schemaFile);
  if (validate(doc)) {
    pass(file, schemaFile);
  } else {
    fail(file, 'expected PASS but schema ' + schemaFile + ' rejected: ' +
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
  const schemaFile = ARTIFACT_TO_SCHEMA[artifact];
  if (!schemaFile) {
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
  const validate = getValidator(schemaFile);
  if (validate(doc)) {
    fail(file, 'expected FAIL but schema ' + schemaFile + ' accepted the fixture.');
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
  pass(file, 'rejected as expected by ' + schemaFile);
}

// --- summary ---------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} failure(s), ${passes} pass(es).`);
  process.exit(1);
}
console.log(`OK — ${passes} fixture(s) validated.`);
