#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default;
const { canonicalJson } = require('./trace-crypto');

const ROOT = path.resolve(__dirname, '..');
const VECTORS = path.join(ROOT, 'conformance', 'vectors', 'prompts');
const SCHEMAS = path.join(ROOT, 'schemas', 'v0.4');
const MANIFEST = 'MANIFEST.json';
const SUITES = { render: 'R', template: 'T', digest: 'D', ref: 'F', secrets: 'S', 'prompts-file-yaml': 'Y' };
const RUST = ['rust-cloud', 'rust-cli'];
const MAX_SAFE = 9007199254740991;
const SCHEMA_BASE = 'https://agenomic.dev/spec/v0.4/';
const DOCUMENT_SCHEMAS = {
  'agenomic.prompt_content/v1': 'prompt-content.schema.json',
  'agenomic.prompt_version/v1': 'prompt-version.schema.json',
  'agenomic.prompt_manifest/v1': 'prompt-manifest.schema.json',
  'agenomic.rendered_prompt/v1': 'rendered-prompt.schema.json',
  'agenomic.prompt_artifact_set/v1': 'prompt-artifact-set.schema.json',
  'agenomic.prompt_bundle/v1': 'prompt-bundle.schema.json',
  'agenomic.execution_binding/v1': 'execution-binding.schema.json',
  'agenomic.prompt_import_plan/v1': 'prompt-import-plan.schema.json',
};

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
for (const name of fs.readdirSync(SCHEMAS).filter((n) => n.endsWith('.schema.json')).sort()) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS, name), 'utf8')));
}
const validator = (file) => ajv.getSchema(SCHEMA_BASE + file);

let failures = 0;
let passes = 0;

function fail(file, reason) {
  failures += 1;
  console.error(`FAIL  ${file}\n      ${reason}`);
}

function pass(file, note) {
  passes += 1;
  if (process.env.VERBOSE) console.log(`PASS  ${file}${note ? '  (' + note + ')' : ''}`);
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const pointer = (base, key) => base + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1');

function ajsError(v, at = '', depth = 0) {
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || !Number.isInteger(v)) return { code: 'float_not_allowed', value_path: at };
    if (Math.abs(v) > MAX_SAFE) return { code: 'integer_out_of_range', value_path: at };
    return null;
  }
  if (typeof v === 'string') {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v)) return { code: 'invalid_unicode', value_path: at };
    if (v.includes('\u0000')) return { code: 'nul_character', value_path: at };
    return null;
  }
  if (Array.isArray(v) || isPlainObject(v)) {
    if (depth + 1 > 64) return { code: 'json_too_deep', value_path: at };
    const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v).sort();
    for (const k of keys) {
      if (typeof k === 'string') {
        const keyError = ajsError(k, pointer(at, k), depth);
        if (keyError) return keyError;
      }
      const inner = ajsError(v[k], pointer(at, k), depth + 1);
      if (inner) return inner;
    }
    return null;
  }
  return { code: 'invalid_field_type', value_path: at };
}

function canonical(v) {
  const error = ajsError(v);
  if (error) throw new Error('not in the Agenomic JSON Subset: ' + JSON.stringify(error));
  return canonicalJson(v);
}

const sha256 = (text) => 'sha256:' + crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const digest = (v) => sha256(canonical(v));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);

function schemaErrors(file, doc) {
  const validate = validator(file);
  return validate(doc) ? null : JSON.stringify(validate.errors);
}

function artifactSet(bundle) {
  return {
    schema: 'agenomic.prompt_artifact_set/v1',
    prompt_manifest_digest: bundle.prompt_manifest_digest,
    manifest: bundle.manifest,
    children: bundle.children,
    prompts: bundle.prompts,
  };
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const relPath = (full) => path.relative(VECTORS, full).split(path.sep).join('/');
const fileSha = (full) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');

function buildManifest() {
  const files = {};
  for (const full of walk(VECTORS).map(relPath).sort()) {
    if (full !== MANIFEST) files[full] = fileSha(path.join(VECTORS, full));
  }
  return { schema: 'agenomic.conformance_vector_manifest/v1', renderer_version: '1', secret_patterns: 'agenomic-secrets/1', files };
}

function checkManifest() {
  const manifestPath = path.join(VECTORS, MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    fail(MANIFEST, 'missing; run node scripts/vectors.js --write-manifest');
    return;
  }
  const actual = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const want = buildManifest();
  const keys = Object.keys(actual.files || {});
  if (keys.join('\n') !== [...keys].sort().join('\n')) fail(MANIFEST, 'file keys are not sorted');
  for (const member of ['schema', 'renderer_version', 'secret_patterns']) {
    if (actual[member] !== want[member]) fail(MANIFEST, `${member} must be ${JSON.stringify(want[member])}`);
  }
  for (const file of Object.keys(want.files)) {
    if (!(file in (actual.files || {}))) fail(MANIFEST, `missing entry for ${file}`);
    else if (actual.files[file] !== want.files[file]) fail(MANIFEST, `hash mismatch for ${file}`);
  }
  for (const file of keys) if (!(file in want.files)) fail(MANIFEST, `entry for a file that does not exist: ${file}`);
  pass(MANIFEST, `${Object.keys(want.files).length} files`);
}

function checkContentInputs(file, input) {
  const errors = schemaErrors('prompt-content.schema.json', input.content);
  if (errors) return `input.content fails prompt-content: ${errors}`;
  for (const key of Object.keys(input.fragments)) {
    const fragmentErrors = schemaErrors('prompt-content.schema.json', input.fragments[key].content);
    if (fragmentErrors) return `fragment ${key} fails prompt-content: ${fragmentErrors}`;
  }
  return null;
}

function checkRender(file, v) {
  const { input, expected } = v;
  if (!expected.ok) return null;
  const contentProblem = checkContentInputs(file, input);
  if (contentProblem) return contentProblem;
  const doc = expected.rendered_document;
  const docErrors = schemaErrors('rendered-prompt.schema.json', doc);
  if (docErrors) return `rendered_document fails rendered-prompt: ${docErrors}`;
  if (digest(doc) !== expected.rendered_hash) return 'rendered_hash is not the digest of rendered_document';
  if (doc.content_digest !== digest(input.content)) return 'rendered_document.content_digest is not the digest of input.content';
  if (doc.kind !== expected.kind || doc.kind !== input.content.kind) return 'kind disagrees between input, expected and rendered_document';
  if (doc.text !== expected.text) return 'rendered_document.text differs from expected.text';
  if (expected.kind === 'chat') {
    const history = input.options.history || [];
    if (doc.history_count !== history.length) return 'history_count differs from the history option';
    const counted = doc.messages.reduce((n, m) => n + ('count' in m ? m.count : 1), 0);
    if (counted + history.length !== expected.messages.length) return 'expected.messages length disagrees with rendered_document';
    let i = 0;
    for (const m of doc.messages) {
      if ('role' in m) {
        if (!same(expected.messages[i], m)) return `expected.messages[${i}] differs from the rendered template message`;
        i += 1;
      } else {
        i += m.count;
      }
    }
  }
  return null;
}

function checkTemplate(file, v) {
  const { input, expected } = v;
  if ('template' in input) {
    if (expected.ok && expected.source !== input.template) return 'source must re-serialize the input template exactly';
    return null;
  }
  if (!expected.ok) return null;
  const contentProblem = checkContentInputs(file, input);
  if (contentProblem) return contentProblem;
  if (expected.validation.content_digest !== digest(input.content)) return 'validation.content_digest is not the digest of input.content';
  const declared = Object.keys(input.content.variables).sort();
  if (!same(expected.validation.variables.declared, declared)) return 'validation.variables.declared differs from the declared variables';
  return null;
}

function checkDigestDocument(v) {
  const { input, expected } = v;
  const doc = input.document;
  if (!expected.ok) {
    const error = ajsError(doc);
    if (!error) return 'expected an AJS failure, but the document is in the subset';
    if (!same(error, expected.error.item)) return `AJS failure ${JSON.stringify(error)} differs from ${JSON.stringify(expected.error.item)}`;
    return null;
  }
  if (expected.document_type !== doc.schema) return 'document_type must equal document.schema';
  if (canonical(doc) !== expected.canonical) return 'canonical differs from the recomputed canonical JSON';
  if (sha256(expected.canonical) !== expected.digest) return 'digest differs from the recomputed sha256';
  const schemaFile = DOCUMENT_SCHEMAS[doc.schema];
  const withoutPlanDigest = input.projection && input.projection.rule === 'without_plan_digest';
  if (schemaFile && !withoutPlanDigest) {
    const errors = schemaErrors(schemaFile, doc);
    if (errors) return `document fails ${schemaFile}: ${errors}`;
  }
  if (input.projection) {
    const from = input.projection.from;
    if (input.projection.rule === 'content') {
      if (!same(from.content, doc)) return 'projection: document is not from.content';
      if (from.content_digest !== expected.digest) return 'projection: from.content_digest differs from the digest';
    } else {
      const rest = { ...from };
      delete rest.plan_digest;
      if (!same(rest, doc)) return 'projection: document is not from without plan_digest';
      if (from.plan_digest !== expected.digest) return 'projection: from.plan_digest differs from the digest';
    }
    const fromSchema = DOCUMENT_SCHEMAS[from.schema];
    if (fromSchema) {
      const errors = schemaErrors(fromSchema, from);
      if (errors) return `projection.from fails ${fromSchema}: ${errors}`;
    }
  }
  return null;
}

function checkBundleLoad(v) {
  const { input, expected } = v;
  const bundle = input.bundle;
  const errors = schemaErrors('prompt-bundle.schema.json', bundle);
  if (errors) return `bundle fails prompt-bundle: ${errors}`;
  if (bundle.signature !== undefined) return 'bundle_load vectors use unsigned bundles pinned by digest';
  for (const key of Object.keys(bundle.prompts)) {
    const entry = bundle.prompts[key];
    if (key !== `${entry.prompt_id}:${entry.version}`) return `prompts key ${key} disagrees with its entry`;
    if (digest(entry.content) !== entry.content_digest) return `prompts ${key} content_digest is not self-consistent`;
  }
  if (digest(bundle.manifest) !== bundle.prompt_manifest_digest) return 'root prompt_manifest_digest is not self-consistent';
  for (const id of Object.keys(bundle.children)) {
    if (digest(bundle.children[id].manifest) !== bundle.children[id].prompt_manifest_digest) return `child ${id} prompt_manifest_digest is not self-consistent`;
  }
  const actual = digest(artifactSet(bundle));
  if (actual !== bundle.prompt_bundle_digest) return 'prompt_bundle_digest is not self-consistent';
  const inScope = bundle.workspace_id === input.expected_workspace_id && bundle.agent_id === input.expected_agent_id && bundle.manifest.agent_id === input.expected_agent_id;
  if (expected.ok) {
    if (actual !== input.expected_bundle_digest) return 'a loading vector must be pinned to the recomputed artifact set digest';
    if (!inScope) return 'a loading vector must expect the workspace and agent of its bundle and root manifest';
    if (expected.prompt_bundle_digest !== actual) return 'expected.prompt_bundle_digest differs from the recomputed digest';
    if (expected.prompt_manifest_digest !== bundle.prompt_manifest_digest) return 'expected.prompt_manifest_digest differs from the bundle';
    if (!same(expected.prompt_refs, Object.keys(bundle.prompts).sort())) return 'expected.prompt_refs differs from the bundle prompts';
    if (!same(expected.managed_slots, Object.keys(bundle.manifest.slots).sort())) return 'expected.managed_slots differs from the root manifest slots';
    return null;
  }
  if (expected.error.code === 'bundle_scope_mismatch') {
    if (actual !== input.expected_bundle_digest) return 'a scope refusal must match its pin, so that only the scope check fails';
    if (bundle.manifest.agent_id !== bundle.agent_id) return 'a scope refusal must use a bundle whose root manifest names its agent';
    if (inScope) return 'a scope refusal must expect another workspace or agent than its bundle';
    if (!same(expected.error, { code: 'bundle_scope_mismatch' })) return 'a scope refusal asserts the code only';
    return null;
  }
  if (actual === input.expected_bundle_digest) return 'a refusing vector must not match its pin';
  const want = { document: 'artifact_set', expected: input.expected_bundle_digest, actual };
  if (expected.error.code !== 'prompt_digest_mismatch' || !same(expected.error.details, want)) return `expected error must be prompt_digest_mismatch with ${JSON.stringify(want)}`;
  return null;
}

function checkPromptsFileYaml(v) {
  if (!v.expected.ok) return null;
  const errors = schemaErrors('prompts-file.schema.json', v.expected.json);
  return errors ? `expected.json fails prompts-file: ${errors}` : null;
}

function checkVector(full, ids) {
  const rel = relPath(full);
  let v;
  try {
    v = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (e) {
    fail(rel, 'JSON parse error: ' + e.message);
    return;
  }
  const errors = schemaErrors('conformance-vector.schema.json', v);
  if (errors) {
    fail(rel, 'fails conformance-vector: ' + errors);
    return;
  }
  const [suiteDir, base] = rel.split('/');
  const noRust = base.endsWith('.no-rust.json');
  const match = /^([RTDFSY][0-9]{3})-[a-z0-9]+(?:-[a-z0-9]+)*(\.no-rust)?\.json$/.exec(base);
  if (!match) return fail(rel, 'file name must be <id>-<kebab-slug>.json');
  if (match[1] !== v.id) return fail(rel, `file prefix ${match[1]} differs from id ${v.id}`);
  if (suiteDir !== v.suite) return fail(rel, `directory ${suiteDir} differs from suite ${v.suite}`);
  if (SUITES[v.suite] !== v.id[0]) return fail(rel, `id ${v.id} does not belong to suite ${v.suite}`);
  if (ids.has(v.id)) return fail(rel, `duplicate id ${v.id} (also ${ids.get(v.id)})`);
  ids.set(v.id, rel);
  if (noRust && v.consumers.some((c) => RUST.includes(c))) return fail(rel, '.no-rust.json vectors cannot list a Rust consumer');
  let problem = null;
  try {
    if (v.suite === 'render') problem = checkRender(rel, v);
    else if (v.suite === 'template') problem = checkTemplate(rel, v);
    else if (v.suite === 'digest') problem = v.input.operation === 'bundle_load' ? checkBundleLoad(v) : checkDigestDocument(v);
    else if (v.suite === 'prompts-file-yaml') problem = checkPromptsFileYaml(v);
  } catch (e) {
    problem = e.message;
  }
  if (problem) return fail(rel, problem);
  pass(rel, v.suite);
}

function compute(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const members = [];
  if (doc && doc.schema === 'agenomic.conformance_vector/v1') {
    if (doc.input && doc.input.document !== undefined) members.push(['input.document', doc.input.document]);
    if (doc.input && isPlainObject(doc.input.content)) members.push(['input.content', doc.input.content]);
    if (doc.input && isPlainObject(doc.input.bundle)) members.push(['artifact_set(input.bundle)', artifactSet(doc.input.bundle)]);
    if (doc.expected && isPlainObject(doc.expected.rendered_document)) members.push(['expected.rendered_document', doc.expected.rendered_document]);
  } else {
    members.push(['document', doc]);
  }
  for (const [member, value] of members) {
    const error = ajsError(value);
    if (error) {
      console.log(JSON.stringify({ member, error }));
      continue;
    }
    const text = canonicalJson(value);
    console.log(JSON.stringify({ member, canonical: text, digest: sha256(text) }));
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--compute') {
    if (!args[1]) {
      console.error('usage: node scripts/vectors.js --compute <file>');
      process.exit(2);
    }
    compute(path.resolve(args[1]));
    return;
  }
  if (args[0] === '--write-manifest') {
    fs.writeFileSync(path.join(VECTORS, MANIFEST), JSON.stringify(buildManifest(), null, 2) + '\n');
  }
  const ids = new Map();
  const vectorFiles = walk(VECTORS).filter((f) => {
    const rel = relPath(f);
    return rel.includes('/') && rel.endsWith('.json');
  }).sort();
  for (const full of vectorFiles) {
    const suiteDir = relPath(full).split('/')[0];
    if (!(suiteDir in SUITES)) fail(relPath(full), `unknown suite directory ${suiteDir}`);
    else checkVector(full, ids);
  }
  checkManifest();
  if (failures > 0) {
    console.error(`\n${failures} failure(s), ${passes} pass(es).`);
    process.exit(1);
  }
  console.log(`OK, ${passes} prompt conformance check(s) passed.`);
}

main();
