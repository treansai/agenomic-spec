#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default;
const { canonicalJson } = require('./trace-crypto');

const ROOT = path.resolve(__dirname, '..');
const VECTORS = path.join(ROOT, 'conformance', 'vectors', 'knowledge');
const SCHEMAS = path.join(ROOT, 'schemas', 'v0.4');
const SCHEMA_BASE = 'https://agenomic.dev/spec/v0.4/';
const MANIFEST = 'MANIFEST.json';
const README = 'README.md';
const SUITES = { section: 'KS', digest: 'KD', ref: 'KR', tokens: 'KT', lexical: 'KL', bm25: 'KM' };
const CONSUMERS = ['rust-cloud', 'python', 'typescript'];
const MAX_SAFE = 9007199254740991;

const SECTION_SCHEMA = 'agenomic.knowledge_section/v1';
const DOCUMENT_CONTENT_SCHEMA = 'agenomic.knowledge_document_content/v1';
const CHUNKING_SCHEMA = 'agenomic.knowledge_chunking_config/v1';
const EMBEDDING_SCHEMA = 'agenomic.knowledge_embedding_config/v1';
const INDEX_SCHEMA = 'agenomic.knowledge_index_config/v1';
const VERSION_MANIFEST_SCHEMA = 'agenomic.knowledge_version_manifest/v1';
const AGENT_MANIFEST_SCHEMA = 'agenomic.agent_knowledge_manifest/v1';
const RETRIEVAL_PARAMS_SCHEMA = 'agenomic.knowledge_retrieval_params/v1';
const QUERY_SCHEMA = 'agenomic.knowledge_query/v1';
const TOKEN_COUNTER = 'approx-v1';
const MAX_REF_BYTES = 512;
const MAX_QUERY_CHARS = 2000;

const DOCUMENT_SCHEMAS = {
  [VERSION_MANIFEST_SCHEMA]: 'knowledge-version-manifest.schema.json',
  [AGENT_MANIFEST_SCHEMA]: 'agent-knowledge-manifest.schema.json',
  [CHUNKING_SCHEMA]: 'knowledge-index-config.schema.json#/$defs/chunkingConfig',
  [EMBEDDING_SCHEMA]: 'knowledge-index-config.schema.json#/$defs/embeddingSpace',
  [SECTION_SCHEMA]: 'knowledge-common.schema.json#/$defs/sectionContent',
  [DOCUMENT_CONTENT_SCHEMA]: 'knowledge-common.schema.json#/$defs/documentContent',
  [RETRIEVAL_PARAMS_SCHEMA]: 'knowledge-common.schema.json#/$defs/retrievalParams',
};
const INDEX_DOCUMENT = 'knowledge-index-config.schema.json';
const INDEX_IDENTITY = 'knowledge-index-config.schema.json#/$defs/indexIdentity';
const SEARCH_PARAMS = 'knowledge-common.schema.json#/$defs/searchParams';
const EMBEDDING_SETTINGS = 'knowledge-index-config.schema.json#/$defs/embeddingSettings';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
for (const name of fs.readdirSync(SCHEMAS).filter((n) => n.endsWith('.schema.json')).sort()) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMAS, name), 'utf8')));
}

function schemaErrors(ref, doc) {
  const validate = ajv.getSchema(SCHEMA_BASE + ref);
  if (!validate) return `unknown schema ${ref}`;
  return validate(doc) ? null : JSON.stringify(validate.errors);
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

const sha256Hex = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');
const sha256 = (text) => 'sha256:' + sha256Hex(text);
const digest = (v) => sha256(canonical(v));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
const byCodePoint = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const sortedUnique = (items) => [...new Set(items)].sort(byCodePoint);

const WHITE_SPACE = /^\p{White_Space}$/u;
const ALPHANUMERIC = /^[\p{Alphabetic}\p{Nd}\p{Nl}\p{No}]$/u;
const CONTROL = /^\p{Cc}$/u;
const isWhiteSpace = (ch) => WHITE_SPACE.test(ch);
const isAlphanumeric = (ch) => ALPHANUMERIC.test(ch);
const isControl = (ch) => CONTROL.test(ch);

function splitWhiteSpace(text) {
  const words = [];
  let word = '';
  for (const ch of text) {
    if (isWhiteSpace(ch)) {
      if (word) words.push(word);
      word = '';
    } else {
      word += ch;
    }
  }
  if (word) words.push(word);
  return words;
}

function trimWhiteSpace(text) {
  const chars = [...text];
  let start = 0;
  let end = chars.length;
  while (start < end && isWhiteSpace(chars[start])) start += 1;
  while (end > start && isWhiteSpace(chars[end - 1])) end -= 1;
  return chars.slice(start, end).join('');
}

const collapse = (text) => splitWhiteSpace(text).join(' ');
const cleanLine = (text) => collapse(text.split('\u0000').join(''));
const shortId = (prefix, parts) => prefix + '_' + sha256Hex(parts.join('\u0000')).slice(0, 16);

function countTokens(text) {
  let tokens = 0;
  let run = 0;
  for (const ch of text) {
    if (isAlphanumeric(ch)) {
      run += 1;
    } else {
      tokens += Math.ceil(run / 4);
      run = 0;
      if (!isWhiteSpace(ch)) tokens += 1;
    }
  }
  return tokens + Math.ceil(run / 4);
}

function normalizeHeading(text) {
  const kept = [...text].filter((ch) => !isControl(ch) || isWhiteSpace(ch)).join('');
  return collapse(kept.toLowerCase());
}

function slugify(heading) {
  let slug = '';
  for (const ch of trimWhiteSpace(heading).toLowerCase()) {
    if (isAlphanumeric(ch) || ch === '-' || ch === '_') slug += ch;
    else if (isWhiteSpace(ch)) slug += '-';
  }
  return slug;
}

function uniqueAnchor(base, used) {
  const stem = base === '' ? 'section' : base;
  if (!used.has(stem)) {
    used.add(stem);
    return stem;
  }
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${stem}-${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

function stringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? cleanLine(item) : typeof item === 'number' ? String(item) : ''))
      .filter((tag) => tag !== '');
  }
  if (typeof value === 'string') return value.split(',').map(cleanLine).filter((tag) => tag !== '');
  return [];
}

function sectionTagMap(value) {
  const map = new Map();
  if (isPlainObject(value)) {
    for (const [heading, tags] of Object.entries(value)) {
      const key = heading.split('/').map(normalizeHeading).join('/');
      map.set(key, (map.get(key) || []).concat(stringList(tags)));
    }
  }
  return map;
}

function buildSections(documentId, fallbackTitle, outline) {
  const fromParser = outline.title === null ? '' : cleanLine(outline.title);
  const fromFallback = cleanLine(fallbackTitle);
  const title = fromParser || fromFallback || 'Untitled';
  const nodes = [{ parent: null, level: 0, heading: title, anchor: null, tags: [], blocks: [] }];
  const stack = [];
  let current = 0;
  for (const block of outline.blocks) {
    if (block.heading) {
      const level = Math.max(block.heading.level, 1);
      while (stack.length && nodes[stack[stack.length - 1]].level >= level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1] : 0;
      const heading = cleanLine(block.heading.text) || 'Untitled';
      nodes.push({ parent, level, heading, anchor: block.heading.anchor, tags: block.heading.tags, blocks: [] });
      current = nodes.length - 1;
      stack.push(current);
    } else {
      nodes[current].blocks.push(block.text);
    }
  }
  const frontMatter = outline.front_matter;
  const documentTags = stringList(frontMatter.tags);
  const sectionTags = sectionTagMap(frontMatter.sections);
  const ids = [];
  const paths = [];
  const keys = [];
  const depths = [];
  const occurrences = new Map();
  const usedIds = new Set();
  const usedAnchors = new Set();
  const sections = [];
  nodes.forEach((node, index) => {
    let headingPath = [];
    let pathKey = '';
    let depth = 0;
    let occurrence = 0;
    if (node.parent !== null) {
      const normalized = normalizeHeading(node.heading);
      const counterKey = `${node.parent}\u0000${normalized}`;
      occurrence = occurrences.get(counterKey) || 0;
      occurrences.set(counterKey, occurrence + 1);
      headingPath = paths[node.parent].concat([node.heading]);
      pathKey = keys[node.parent] === '' ? normalized : `${keys[node.parent]}/${normalized}`;
      depth = depths[node.parent] + 1;
    }
    let bump = occurrence;
    let sectionId = shortId('sec', [SECTION_SCHEMA, documentId, pathKey, String(bump)]);
    while (usedIds.has(sectionId)) {
      bump += 1;
      sectionId = shortId('sec', [SECTION_SCHEMA, documentId, pathKey, String(bump)]);
    }
    usedIds.add(sectionId);
    const ownKey = occurrence === 0 ? pathKey : `${pathKey}#${occurrence}`;
    let anchor = '';
    if (node.parent !== null) {
      const explicit = node.anchor === null ? '' : trimWhiteSpace(node.anchor);
      if (explicit !== '') {
        usedAnchors.add(explicit);
        anchor = explicit;
      } else {
        anchor = uniqueAnchor(slugify(node.heading), usedAnchors);
      }
    }
    const content = node.blocks.filter((text) => trimWhiteSpace(text) !== '').join('\n\n').split('\u0000').join('');
    const contentDigest = digest({ schema: SECTION_SCHEMA, heading_path: headingPath, content });
    const tags = new Set(documentTags);
    for (const tag of node.tags) tags.add(cleanLine(tag));
    if (node.parent !== null) {
      const joined = headingPath.map(normalizeHeading).join('/');
      for (const key of [normalizeHeading(node.heading), joined]) {
        for (const tag of sectionTags.get(key) || []) tags.add(tag);
      }
    }
    tags.delete('');
    sections.push({
      ordinal: index,
      section_id: sectionId,
      parent_section_id: node.parent === null ? null : ids[node.parent],
      depth,
      heading: node.heading,
      heading_path: headingPath,
      anchor,
      content,
      content_digest: contentDigest,
      tags: [...tags].sort(byCodePoint),
      token_count: countTokens(content),
    });
    ids.push(sectionId);
    paths.push(headingPath);
    keys.push(ownKey);
    depths.push(depth);
  });
  const summary = sections.map((s) => ({
    section_id: s.section_id,
    parent: s.parent_section_id,
    heading_path: s.heading_path,
    content_digest: s.content_digest,
    tags: s.tags,
  }));
  const documentContent = { schema: DOCUMENT_CONTENT_SCHEMA, title, sections: summary };
  return {
    title,
    content_digest: digest(documentContent),
    token_count: sections.reduce((total, s) => total + s.token_count, 0),
    sections,
    document_content: documentContent,
  };
}

function chunkingDocument(config) {
  return {
    schema: CHUNKING_SCHEMA,
    strategy: config.strategy,
    max_tokens: config.max_tokens,
    overlap_tokens: config.overlap_tokens,
    min_tokens: config.min_tokens,
    parent_max_tokens: config.parent_max_tokens,
    child_max_tokens: config.child_max_tokens,
    token_counter: config.token_counter,
  };
}

function embeddingSpace(settings) {
  return {
    schema: EMBEDDING_SCHEMA,
    provider: settings.provider,
    model: settings.model,
    model_version: settings.model_version,
    dimensions: settings.dimensions,
    normalization: settings.normalization,
  };
}

function indexDocument(chunking, embedding, textSearchConfig) {
  const embeddingDocument = embeddingSpace(embedding);
  return {
    schema: INDEX_SCHEMA,
    chunking,
    chunking_digest: digest(chunkingDocument(chunking)),
    embedding: embeddingDocument,
    embedding_digest: digest(embeddingDocument),
    text_search_config: textSearchConfig,
  };
}

function indexIdentity(document) {
  return {
    schema: INDEX_SCHEMA,
    chunking_digest: document.chunking_digest,
    embedding_digest: document.embedding_digest,
    text_search_config: document.text_search_config,
  };
}

function retrievalParams(params) {
  const filters = params.filters;
  return {
    schema: RETRIEVAL_PARAMS_SCHEMA,
    mode: params.mode,
    top_k: params.top_k,
    rerank: params.rerank,
    max_context_tokens: params.max_context_tokens,
    expand: params.expand,
    include_context: params.include_context,
    filters: {
      collections: sortedUnique(filters.collections),
      document_ids: sortedUnique(filters.document_ids),
      path_prefix: filters.path_prefix,
      tags: sortedUnique(filters.tags),
      classification_max: filters.classification_max,
      metadata: filters.metadata,
    },
  };
}

function normalizeQuery(raw) {
  const collapsed = collapse(raw.normalize('NFKC'));
  if (collapsed === '') return { error: 'empty' };
  if ([...collapsed].some(isControl)) return { error: 'control_character' };
  if ([...collapsed].length > MAX_QUERY_CHARS) return { error: 'too_long' };
  return { normalized: collapsed };
}

const queryDigest = (normalized) => sha256(QUERY_SCHEMA + '\u0000' + normalized);

const UUID_LOWER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KB_ID = /^kb_[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
const DOCUMENT_ID = /^kdoc_[0-9a-hjkmnp-tv-z]{26}$/;

function versionTag(tag) {
  const match = /^v([1-9][0-9]{0,9})$/.exec(tag);
  if (!match) return null;
  const value = Number(match[1]);
  return value <= 2147483647 ? value : null;
}

function splitVersioned(segment) {
  const at = segment.indexOf('@');
  if (at < 0) return { id: segment, version: null };
  const version = versionTag(segment.slice(at + 1));
  if (version === null) return { error: 'invalid_version' };
  return { id: segment.slice(0, at), version };
}

function parseRef(text) {
  const invalid = (reason) => ({ ok: false, error: { code: 'knowledge_ref_invalid', reason } });
  if (text === '') return invalid('empty');
  if (Buffer.byteLength(text, 'utf8') > MAX_REF_BYTES) return invalid('too_long');
  if ([...text].some((ch) => isWhiteSpace(ch) || isControl(ch))) return invalid('whitespace');
  const separator = text.indexOf('://');
  if (separator < 0 || text.slice(0, separator) !== 'kb') return invalid('unsupported_scheme');
  const rest = text.slice(separator + 3);
  if (rest.endsWith('/')) return invalid('trailing_slash');
  if (rest.includes('?') || rest.includes('#')) return invalid('invalid_path');
  const segments = rest.split('/');
  if (segments.some((segment) => segment === '')) return invalid('invalid_path');
  if (!UUID_LOWER.test(segments[0])) return invalid('invalid_workspace');
  const workspace = segments[0];
  const validKb = (id) => id.length <= 64 && KB_ID.test(id);
  if (segments.length === 2) {
    const base = splitVersioned(segments[1]);
    if (base.error) return invalid(base.error);
    if (!validKb(base.id)) return invalid('invalid_kb_id');
    return { ok: true, form: 'base', workspace_id: workspace, kb_id: base.id, version: base.version, document_id: null, revision: null };
  }
  if (segments.length === 4 && segments[2] === 'documents') {
    if (segments[1].includes('@')) return invalid('invalid_path');
    if (!validKb(segments[1])) return invalid('invalid_kb_id');
    const document = splitVersioned(segments[3]);
    if (document.error) return invalid(document.error);
    if (!DOCUMENT_ID.test(document.id)) return invalid('invalid_document_id');
    return { ok: true, form: 'document', workspace_id: workspace, kb_id: segments[1], version: null, document_id: document.id, revision: document.version };
  }
  return invalid('invalid_path');
}

function formatRef(parsed) {
  const base = `kb://${parsed.workspace_id}/${parsed.kb_id}`;
  if (parsed.form === 'base') return parsed.version === null ? base : `${base}@v${parsed.version}`;
  const document = `${base}/documents/${parsed.document_id}`;
  return parsed.revision === null ? document : `${document}@v${parsed.revision}`;
}

function resolveRef(text, workspaceId) {
  const parsed = parseRef(text);
  if (!parsed.ok) return parsed;
  if (workspaceId !== null && parsed.workspace_id !== workspaceId) {
    return { ok: false, error: { code: 'knowledge_ref_cross_workspace' } };
  }
  return { ...parsed, canonical: formatRef(parsed) };
}

function tokenize(text) {
  const normalized = text.normalize('NFKC').toLowerCase();
  const tokens = [];
  let token = '';
  for (const ch of normalized) {
    if (isAlphanumeric(ch)) {
      token += ch;
    } else {
      if (token) tokens.push(token);
      token = '';
    }
  }
  if (token) tokens.push(token);
  return tokens;
}

function bm25Rank(query, candidates, k1, b, corpus) {
  const terms = new Set(tokenize(query));
  if (terms.size === 0 || candidates.length === 0) return [];
  const documents = candidates.map((candidate) => {
    const tokens = tokenize(candidate);
    const frequencies = new Map();
    for (const token of tokens) if (terms.has(token)) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    return { length: tokens.length, frequencies };
  });
  const documentFrequency = new Map();
  for (const document of documents) for (const term of document.frequencies.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
  let stats = corpus;
  if (stats === null) {
    const total = documents.reduce((sum, document) => sum + document.length, 0);
    stats = { documents: candidates.length, average_length: candidates.length === 0 ? 0 : total / candidates.length };
  }
  const n = Math.max(stats.documents, candidates.length);
  const averageLength = Number.isFinite(stats.average_length) && stats.average_length > 0
    ? stats.average_length
    : Math.max(documents.reduce((sum, document) => sum + document.length, 0) / candidates.length, 1);
  const idf = new Map();
  for (const [term, frequency] of documentFrequency) idf.set(term, Math.log(1 + (n - frequency + 0.5) / (frequency + 0.5)));
  const scored = [];
  documents.forEach((document, index) => {
    const ratio = document.length / averageLength;
    let score = 0;
    for (const term of [...document.frequencies.keys()].sort(byCodePoint)) {
      const tf = document.frequencies.get(term);
      const norm = k1 * (1 - b + b * ratio);
      score += idf.get(term) * tf * (k1 + 1) / (tf + norm);
    }
    if (Number.isFinite(score) && score > 0) scored.push({ index, score });
  });
  scored.sort((x, y) => (y.score - x.score) || (x.index - y.index));
  return scored;
}

function sixDecimals(score) {
  const scaled = score * 1e6;
  const fraction = scaled - Math.floor(scaled);
  if (Math.abs(fraction - 0.5) < 1e-6) throw new Error(`score ${score} is too close to a rounding tie at 6 decimals`);
  return score.toFixed(6);
}

function decimal(text) {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(text)) throw new Error(`not a decimal string: ${text}`);
  return Number(text);
}

function computeSection(input) {
  const result = buildSections(input.document_id, input.fallback_title, input.outline);
  return {
    ok: true,
    title: result.title,
    content_digest: result.content_digest,
    token_count: result.token_count,
    sections: result.sections,
  };
}

function computeDigest(input) {
  if (input.operation === 'digest') {
    const error = ajsError(input.document);
    if (error) return { ok: false, error: { item: error } };
    const text = canonicalJson(input.document);
    return { ok: true, document_type: input.document.schema, canonical: text, digest: sha256(text) };
  }
  if (input.operation === 'chunk_id') {
    return { ok: true, chunk_id: shortId('chk', [input.document_content_digest, input.chunking_digest, String(input.ordinal)]) };
  }
  if (input.operation === 'chunk_content_digest') {
    return { ok: true, content_digest: sha256(input.text) };
  }
  if (input.operation === 'query_digest') {
    const normalized = normalizeQuery(input.query);
    if (normalized.error) return { ok: false, error: { code: 'knowledge_query_invalid', reason: normalized.error } };
    return { ok: true, normalized: normalized.normalized, digest: queryDigest(normalized.normalized) };
  }
  throw new Error(`unknown digest operation ${input.operation}`);
}

function computeBm25(input) {
  const corpus = input.corpus === null ? null : { documents: input.corpus.documents, average_length: decimal(input.corpus.average_length) };
  const ranked = bm25Rank(input.query, input.candidates, decimal(input.k1), decimal(input.b), corpus);
  return { ok: true, ranked: ranked.map(({ index, score }) => ({ candidate: index, score: sixDecimals(score) })) };
}

function computeExpected(v) {
  const { input } = v;
  switch (v.suite) {
    case 'section': return computeSection(input);
    case 'digest': return computeDigest(input);
    case 'ref': return resolveRef(input.ref, input.workspace_id);
    case 'tokens': return { ok: true, token_count: countTokens(input.text) };
    case 'lexical': return { ok: true, tokens: tokenize(input.text) };
    case 'bm25': return computeBm25(input);
    default: throw new Error(`unknown suite ${v.suite}`);
  }
}

function documentSchemaFor(doc) {
  if (!isPlainObject(doc)) return null;
  if (doc.schema === INDEX_SCHEMA) return 'chunking' in doc ? INDEX_DOCUMENT : INDEX_IDENTITY;
  return DOCUMENT_SCHEMAS[doc.schema] || null;
}

function checkDigestInput(v) {
  const { input, expected } = v;
  if (input.operation !== 'digest' || !expected.ok) return null;
  const doc = input.document;
  const schemaRef = documentSchemaFor(doc);
  if (!schemaRef) return `no schema is known for ${doc.schema}`;
  const errors = schemaErrors(schemaRef, doc);
  if (errors) return `document fails ${schemaRef}: ${errors}`;
  if (!input.projection) return null;
  const { rule, from } = input.projection;
  if (rule === 'index_identity') {
    const fromErrors = schemaErrors(INDEX_DOCUMENT, from);
    if (fromErrors) return `projection.from fails ${INDEX_DOCUMENT}: ${fromErrors}`;
    if (digest(chunkingDocument(from.chunking)) !== from.chunking_digest) return 'projection: from.chunking_digest is not the digest of from.chunking';
    if (digest(from.embedding) !== from.embedding_digest) return 'projection: from.embedding_digest is not the digest of from.embedding';
    if (!same(indexIdentity(from), doc)) return 'projection: document is not the index identity of from';
    return null;
  }
  if (rule === 'retrieval_params') {
    const fromErrors = schemaErrors(SEARCH_PARAMS, from);
    if (fromErrors) return `projection.from fails ${SEARCH_PARAMS}: ${fromErrors}`;
    if (!same(retrievalParams(from), doc)) return 'projection: document is not the retrieval parameters of from';
    return null;
  }
  if (rule === 'embedding_space') {
    const fromErrors = schemaErrors(EMBEDDING_SETTINGS, from);
    if (fromErrors) return `projection.from fails ${EMBEDDING_SETTINGS}: ${fromErrors}`;
    if (!same(embeddingSpace(from), doc)) return 'projection: document is not the embedding space of from';
    return null;
  }
  return `unknown projection rule ${rule}`;
}

function checkSectionInput(v) {
  const errors = schemaErrors('knowledge-common.schema.json#/$defs/documentContent', buildSections(v.input.document_id, v.input.fallback_title, v.input.outline).document_content);
  return errors ? `document content fails its schema: ${errors}` : null;
}

const LEXEMES = { KD030: '"version": 4.0,' };

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
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
  for (const rel of walk(VECTORS).map(relPath).sort()) {
    if (rel !== MANIFEST) files[rel] = fileSha(path.join(VECTORS, rel));
  }
  return { schema: 'agenomic.conformance_vector_manifest/v1', token_counter: TOKEN_COUNTER, files };
}

const W = '0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f';
const OTHER = '5a5a5a5a-1111-4222-8333-444455556666';
const AGENT = '2b1e5c3a-8d4f-4e6a-9b0c-1d2e3f4a5b6c';
const SUPPORT_AGENT = '7f3c9a1e-0b2d-4c5e-8f6a-9b0c1d2e3f4a';
const DOC_A = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxa';
const DOC_B = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxb';
const DOC_C = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxc';
const DOC_D = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxd';
const DOC_E = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxe';
const DOC_F = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxf';
const DOC_G = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxg';
const DOC_H = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxh';
const DOC_J = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxj';
const DOC_K = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxk';
const DOC_M = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxm';
const DOC_N = 'kdoc_01hzy8m6k2v9qf7c3n5t0r4wxn';

const h = (level, text, extra = {}) => ({ heading: { level, text, anchor: extra.anchor || null, tags: extra.tags || [] } });
const t = (text) => ({ text });

const BRIEF = '# Agent Security\n\nIntro text.\n\n## Authentication\n\nAgents authenticate with scoped keys.\n\n## Authorization\n\nRoles decide.\n\n### Tool Permissions\n\nTools need grants.\n\n## Audit\n\nEvery call is logged.\n';
const BRIEF_BLOCKS = [
  h(1, 'Agent Security'), t('Intro text.'),
  h(2, 'Authentication'), t('Agents authenticate with scoped keys.'),
  h(2, 'Authorization'), t('Roles decide.'),
  h(3, 'Tool Permissions'), t('Tools need grants.'),
  h(2, 'Audit'), t('Every call is logged.'),
];
const DUPLICATES = '# Guide\n\n## FAQ\n\nOne.\n\n### Linux\n\nA.\n\n## FAQ\n\nTwo.\n\n### Linux\n\nB.\n';
const DUPLICATE_BLOCKS = [
  h(1, 'Guide'),
  h(2, 'FAQ'), t('One.'), h(3, 'Linux'), t('A.'),
  h(2, 'FAQ'), t('Two.'), h(3, 'Linux'), t('B.'),
];
const FRONT_MATTER = '---\ntitle: Key Handling Guide\ntags: [security, agents]\nsections:\n  Audit: [compliance]\n  Guide/Keys: [secrets]\n---\n# Guide\n\nOverview of key handling.\n\n## Keys {#key-rotation .ops}\n\nRotate every 90 days.\n\n## Audit\n\nLog every rotation.\n';
const PREAMBLE = '---\ntags: billing, refunds\nowner: finance\n---\nPreamble paragraph before any heading.\n\n## Refunds\n\nCustomers receive refunds within 14 days.\n\n## Exceptions\n\n- Digital goods\n- Gift cards\n  - Promotional cards\n';
const LEVELS = '# Handbook\n\n### Deep Detail\n\nDeep text.\n\n## Middle\n\nMiddle text.\n\n#### Deeper\n\nDeeper text.\n\n# Appendix\n\nAppendix text.\n';
const UNICODE = '# Résumé Guide\n\n## Élève  Notes\n\nPremière note.\n\n## élève notes\n\nSeconde note.\n\n## Straße\n\nStraßenverkehr.\n';
const COLLISION = '# Root\n\n## A\n\n### B\n\nUnder A.\n\n## A/B\n\nSlash heading.\n';
const FORMATS = '# Formats\n\nText with `inline code`, a [link](./other.md#setup) and *emphasis*.\n\n1. first\n2. second\n\n```python\nprint("hi")\n```\n\n| Plan | Price |\n| --- | --- |\n| Basic | 10 |\n| Pro | 20 |\n';

const SECTION_CASES = [
  {
    slug: 'nested-headings', intent: 'a nested Markdown document: the title is the first level-1 heading, which is also the first child of the root section',
    document_id: DOC_A, fallback_title: 'security.md', markdown: BRIEF,
    outline: { title: 'Agent Security', front_matter: {}, blocks: BRIEF_BLOCKS },
  },
  {
    slug: 'duplicate-headings', intent: 'repeated sibling headings and nested duplicates get distinct ids through the occurrence counter and the ancestor occurrence suffix',
    document_id: DOC_B, fallback_title: 'guide.md', markdown: DUPLICATES,
    outline: { title: 'Guide', front_matter: {}, blocks: DUPLICATE_BLOCKS },
  },
  {
    slug: 'duplicate-headings-appended', intent: 'appending a third FAQ keeps the ids of the first two FAQ sections and of their children',
    document_id: DOC_B, fallback_title: 'guide.md', markdown: DUPLICATES + '\n## FAQ\n\nThree.\n',
    outline: { title: 'Guide', front_matter: {}, blocks: DUPLICATE_BLOCKS.concat([h(2, 'FAQ'), t('Three.')]) },
  },
  {
    slug: 'front-matter-tags', intent: 'front matter title and tags, section tags matched by heading and by heading path, heading classes and an explicit anchor',
    document_id: DOC_C, fallback_title: 'keys.md', markdown: FRONT_MATTER,
    outline: {
      title: 'Key Handling Guide',
      front_matter: { sections: { Audit: ['compliance'], 'Guide/Keys': ['secrets'] }, tags: ['security', 'agents'], title: 'Key Handling Guide' },
      blocks: [h(1, 'Guide'), t('Overview of key handling.'), h(2, 'Keys', { anchor: 'key-rotation', tags: ['ops'] }), t('Rotate every 90 days.'), h(2, 'Audit'), t('Log every rotation.')],
    },
  },
  {
    slug: 'preamble-and-fallback-title', intent: 'text before the first heading belongs to the root section, comma separated front matter tags, and the fallback title when no level-1 heading exists',
    document_id: DOC_D, fallback_title: 'refund-policy.md', markdown: PREAMBLE,
    outline: {
      title: null,
      front_matter: { owner: 'finance', tags: 'billing, refunds' },
      blocks: [t('Preamble paragraph before any heading.'), h(2, 'Refunds'), t('Customers receive refunds within 14 days.'), h(2, 'Exceptions'), t('- Digital goods\n- Gift cards\n  - Promotional cards')],
    },
  },
  {
    slug: 'skipped-levels', intent: 'skipped heading levels nest under the nearest shallower heading and a new level-1 heading returns to the root',
    document_id: DOC_E, fallback_title: 'handbook.md', markdown: LEVELS,
    outline: {
      title: 'Handbook', front_matter: {},
      blocks: [h(1, 'Handbook'), h(3, 'Deep Detail'), t('Deep text.'), h(2, 'Middle'), t('Middle text.'), h(4, 'Deeper'), t('Deeper text.'), h(1, 'Appendix'), t('Appendix text.')],
    },
  },
  {
    slug: 'unicode-headings', intent: 'headings that differ only by case and white space normalize to the same key; non-ASCII letters are kept in keys and anchors',
    document_id: DOC_F, fallback_title: 'notes.md', markdown: UNICODE,
    outline: {
      title: 'Résumé Guide', front_matter: {},
      blocks: [h(1, 'Résumé Guide'), h(2, 'Élève Notes'), t('Première note.'), h(2, 'élève notes'), t('Seconde note.'), h(2, 'Straße'), t('Straßenverkehr.')],
    },
  },
  {
    slug: 'id-collision-bump', intent: 'a heading containing a slash produces the same path key as a nested heading; the later section takes the next occurrence number',
    document_id: DOC_G, fallback_title: 'root.md', markdown: COLLISION,
    outline: {
      title: 'Root', front_matter: {},
      blocks: [h(1, 'Root'), h(2, 'A'), h(3, 'B'), t('Under A.'), h(2, 'A/B'), t('Slash heading.')],
    },
  },
  {
    slug: 'rendered-blocks', intent: 'inline code, links, emphasis, ordered lists, fenced code and tables render into the section content joined by blank lines',
    document_id: DOC_H, fallback_title: 'formats.md', markdown: FORMATS,
    outline: {
      title: 'Formats', front_matter: {},
      blocks: [h(1, 'Formats'), t('Text with `inline code`, a link and emphasis.'), t('1. first\n2. second'), t('```python\nprint("hi")\n```'), t('| Plan | Price |\n| --- | --- |\n| Basic | 10 |\n| Pro | 20 |')],
    },
  },
  {
    slug: 'empty-document', intent: 'an empty document has only its root section, titled from the fallback',
    document_id: DOC_J, fallback_title: 'empty.md', markdown: '',
    outline: { title: null, front_matter: {}, blocks: [] },
  },
  {
    slug: 'untitled-document', intent: 'without a parsed title and with an empty fallback the title is Untitled',
    document_id: DOC_K, fallback_title: '', markdown: 'Just text.\n',
    outline: { title: null, front_matter: {}, blocks: [t('Just text.')] },
  },
  {
    slug: 'outline-edge-cases', intent: 'outline only: a blank heading becomes Untitled, a heading of control characters collides with the root key, integer tags, mixed-case section tag keys and repeated explicit anchors',
    document_id: DOC_M, fallback_title: 'edge.md',
    outline: {
      title: '  Edge   Cases  ',
      front_matter: { tags: [7, 'seven', ' padded  tag '], sections: { ' Mixed   CASE ': ['matched'] } },
      blocks: [
        h(1, '   '), t('Blank heading body.'),
        h(1, '\u0007'), t('Bell heading body.'),
        h(1, 'mixed case', { anchor: 'dup' }), t('First.'),
        h(1, 'Other', { anchor: ' dup ' }), t('Second.'),
        h(1, 'dup'), t('Third.'),
        h(2, 'Tagged', { tags: [' spaced  class ', ''] }), t('   '),
      ],
    },
  },
];

const DEFAULT_CHUNKING = { strategy: 'heading_aware', max_tokens: 512, overlap_tokens: 64, min_tokens: 32, parent_max_tokens: 1024, child_max_tokens: 256, token_counter: TOKEN_COUNTER };
const FIXED_CHUNKING = { ...DEFAULT_CHUNKING, strategy: 'fixed_tokens', max_tokens: 256, overlap_tokens: 32 };
const PARENT_CHUNKING = { ...DEFAULT_CHUNKING, strategy: 'parent_child', min_tokens: 16, parent_max_tokens: 2048, child_max_tokens: 384 };
const LOCAL_HASH = { provider: 'local-hash', model: 'agenomic-local-hash', model_version: '1', dimensions: 384, normalization: 'l2', connection_id: null, base_url: null };
const OPENAI = { provider: 'openai-compatible', model: 'bge-m3', model_version: null, dimensions: 1024, normalization: 'l2', connection_id: '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a', base_url: 'https://embeddings.example.com/v1' };
const OPENAI_VERSIONED = { ...OPENAI, model: 'text-embedding-3-small', model_version: '2024-06', dimensions: 1536, normalization: 'none', connection_id: null };
const DEFAULT_INDEX = indexDocument(DEFAULT_CHUNKING, LOCAL_HASH, 'simple');
const OPENAI_INDEX = indexDocument(FIXED_CHUNKING, OPENAI, 'english');
const PARENT_INDEX = indexDocument(PARENT_CHUNKING, OPENAI_VERSIONED, 'french');
const DEFAULT_INDEX_DIGEST = digest(indexIdentity(DEFAULT_INDEX));
const OPENAI_INDEX_DIGEST = digest(indexIdentity(OPENAI_INDEX));
const DEFAULT_RETRIEVAL = { strategy: 'hybrid', top_k: 5, rerank: true, max_context_tokens: 4000, require_citations: true, insufficient_evidence: 'abstain', injection_policy: 'annotate', min_evidence_score_ppm: 0 };
const fake = (seed) => 'sha256:' + seed.repeat(64);

const BRIEF_SECTIONS = buildSections(DOC_A, 'security.md', SECTION_CASES[0].outline);
const PREAMBLE_SECTIONS = buildSections(DOC_D, 'refund-policy.md', SECTION_CASES[4].outline);
const KEYS_SECTIONS = buildSections(DOC_C, 'keys.md', SECTION_CASES[3].outline);

const REFERENCE_VERSION_MANIFEST = {
  schema: VERSION_MANIFEST_SCHEMA, workspace_id: W, kb_id: 'kb_customer_support', version: 4, parent_version: 3, index_config_digest: fake('1'),
  documents: {
    [DOC_B]: { path: 'guides/verification.md', revision: 1, content_digest: fake('4'), blob_digest: fake('5'), collection: null, classification: 'confidential', tags: [] },
    [DOC_A]: { path: 'policies/refund.md', revision: 7, content_digest: fake('2'), blob_digest: fake('3'), collection: 'faq', classification: 'internal', tags: ['refunds'] },
  },
};
const FIRST_VERSION_MANIFEST = {
  schema: VERSION_MANIFEST_SCHEMA, workspace_id: W, kb_id: 'kb_customer_support', version: 1, parent_version: null, index_config_digest: DEFAULT_INDEX_DIGEST,
  documents: {
    [DOC_D]: { path: 'policies/refund-policy.md', revision: 1, content_digest: PREAMBLE_SECTIONS.content_digest, blob_digest: sha256(PREAMBLE), collection: 'faq', classification: 'public', tags: ['billing', 'refunds'] },
  },
};
const FOURTH_VERSION_MANIFEST = {
  schema: VERSION_MANIFEST_SCHEMA, workspace_id: W, kb_id: 'kb_customer_support', version: 4, parent_version: 3, index_config_digest: DEFAULT_INDEX_DIGEST,
  documents: {
    [DOC_A]: { path: 'guides/security.md', revision: 3, content_digest: BRIEF_SECTIONS.content_digest, blob_digest: sha256(BRIEF), collection: 'product_documentation', classification: 'internal', tags: ['agents', 'security'] },
    [DOC_C]: { path: 'guides/keys.md', revision: 2, content_digest: KEYS_SECTIONS.content_digest, blob_digest: sha256(FRONT_MATTER), collection: null, classification: 'confidential', tags: [] },
    [DOC_D]: { path: 'policies/refund-policy.md', revision: 1, content_digest: PREAMBLE_SECTIONS.content_digest, blob_digest: sha256(PREAMBLE), collection: 'faq', classification: 'public', tags: ['billing', 'refunds'] },
  },
};
const EMPTY_VERSION_MANIFEST = { schema: VERSION_MANIFEST_SCHEMA, workspace_id: W, kb_id: 'kb_runbooks', version: 1, parent_version: null, index_config_digest: OPENAI_INDEX_DIGEST, documents: {} };
const FOURTH_VERSION_DIGEST = digest(FOURTH_VERSION_MANIFEST);
const RUNBOOKS_DIGEST = digest(EMPTY_VERSION_MANIFEST);
const REFERENCE_AGENT_MANIFEST = {
  schema: AGENT_MANIFEST_SCHEMA, workspace_id: W, agent_id: AGENT, enabled: true,
  bases: { kb_customer_support: { version: 4, version_manifest_digest: fake('6'), index_config_digest: fake('1'), collections: ['faq', 'product_documentation'], max_classification: 'internal' } },
  retrieval: DEFAULT_RETRIEVAL,
};
const SUPPORT_AGENT_MANIFEST = {
  schema: AGENT_MANIFEST_SCHEMA, workspace_id: W, agent_id: SUPPORT_AGENT, enabled: true,
  bases: {
    kb_customer_support: { version: 4, version_manifest_digest: FOURTH_VERSION_DIGEST, index_config_digest: DEFAULT_INDEX_DIGEST, collections: ['faq', 'product_documentation'], max_classification: 'internal' },
    kb_runbooks: { version: 1, version_manifest_digest: RUNBOOKS_DIGEST, index_config_digest: OPENAI_INDEX_DIGEST, collections: [], max_classification: 'public' },
  },
  retrieval: { strategy: 'keyword', top_k: 8, rerank: false, max_context_tokens: 2000, require_citations: false, insufficient_evidence: 'answer', injection_policy: 'exclude_high', min_evidence_score_ppm: 250000 },
};
const EMPTY_AGENT_MANIFEST = { schema: AGENT_MANIFEST_SCHEMA, workspace_id: W, agent_id: AGENT, enabled: false, bases: {}, retrieval: DEFAULT_RETRIEVAL };
const DEFAULT_SEARCH = { mode: 'hybrid', top_k: 5, rerank: 'none', max_context_tokens: null, expand: 'none', filters: { collections: [], document_ids: [], path_prefix: null, tags: [], classification_max: null, metadata: {} }, include_context: false, debug: false };
const FILTERED_SEARCH = {
  mode: 'section', top_k: 12, rerank: 'lexical', max_context_tokens: 1500, expand: 'parent',
  filters: { collections: ['product_documentation', 'faq', 'faq'], document_ids: [DOC_D, DOC_A], path_prefix: 'policies/', tags: ['refunds', 'billing', 'refunds'], classification_max: 'confidential', metadata: { region: 'eu', 'owner.team': 'support' } },
  include_context: true, debug: true,
};

function digestCase(slug, intent, document, projection) {
  return { slug, intent, input: projection ? { operation: 'digest', document, projection } : { operation: 'digest', document } };
}

const DIGEST_CASES = [
  digestCase('default-chunking-config', 'the default chunking configuration: heading aware, 512 tokens, 64 overlap, approx-v1 counter', chunkingDocument(DEFAULT_CHUNKING)),
  digestCase('fixed-tokens-chunking-config', 'a fixed token chunking variant: any member change moves the chunking digest', chunkingDocument(FIXED_CHUNKING)),
  digestCase('parent-child-chunking-config', 'a parent and child chunking variant with its own parent and child budgets', chunkingDocument(PARENT_CHUNKING)),
  digestCase('local-hash-embedding-space', 'the default local-hash embedding space: 384 dimensions, L2 normalized, model version 1', embeddingSpace(LOCAL_HASH), { rule: 'embedding_space', from: LOCAL_HASH }),
  digestCase('openai-compatible-embedding-space', 'an openai-compatible embedding space: the connection id and the endpoint never enter the digest', embeddingSpace(OPENAI), { rule: 'embedding_space', from: OPENAI }),
  digestCase('versioned-embedding-space', 'a pinned model version and normalization none give another embedding space', embeddingSpace(OPENAI_VERSIONED), { rule: 'embedding_space', from: OPENAI_VERSIONED }),
  digestCase('default-index-config', 'the default index configuration identity: default chunking, local-hash embeddings, simple text search', indexIdentity(DEFAULT_INDEX), { rule: 'index_identity', from: DEFAULT_INDEX }),
  digestCase('openai-index-config', 'an index identity with fixed token chunking, openai-compatible embeddings and english text search', indexIdentity(OPENAI_INDEX), { rule: 'index_identity', from: OPENAI_INDEX }),
  digestCase('parent-child-index-config', 'an index identity with parent and child chunking, a versioned embedding model and french text search', indexIdentity(PARENT_INDEX), { rule: 'index_identity', from: PARENT_INDEX }),
  digestCase('reference-version-manifest', 'the version manifest of the design example with placeholder digests; documents are keyed by document id', REFERENCE_VERSION_MANIFEST),
  digestCase('first-version-manifest', 'the first version of a knowledge base: parent_version is null', FIRST_VERSION_MANIFEST),
  digestCase('fourth-version-manifest', 'a version manifest whose digests come from the section vectors and the default index configuration', FOURTH_VERSION_MANIFEST),
  digestCase('empty-version-manifest', 'a version without documents still has a well-defined digest', EMPTY_VERSION_MANIFEST),
  digestCase('reference-agent-manifest', 'the agent knowledge manifest of the design example with placeholder digests and the default retrieval block', REFERENCE_AGENT_MANIFEST),
  digestCase('two-base-agent-manifest', 'an agent bound to two knowledge bases with a non-default retrieval block', SUPPORT_AGENT_MANIFEST),
  digestCase('empty-agent-manifest', 'the empty agent knowledge manifest: disabled, no bases, default retrieval', EMPTY_AGENT_MANIFEST),
  digestCase('default-retrieval-params', 'the retrieval parameters of a default search: debug never enters the digest', retrievalParams(DEFAULT_SEARCH), { rule: 'retrieval_params', from: DEFAULT_SEARCH }),
  digestCase('filtered-retrieval-params', 'filter lists are sorted and deduplicated before hashing', retrievalParams(FILTERED_SEARCH), { rule: 'retrieval_params', from: FILTERED_SEARCH }),
  digestCase('section-content', 'the section digest input of the Tool Permissions section of KS001', { schema: SECTION_SCHEMA, heading_path: ['Agent Security', 'Authorization', 'Tool Permissions'], content: 'Tools need grants.' }),
  digestCase('document-content', 'the document content digest input of KS010 (an empty document with only its root section)', buildSections(DOC_J, 'empty.md', SECTION_CASES[9].outline).document_content),
  { slug: 'chunk-id-first', intent: 'the first chunk id of the KS001 document under the default chunking configuration', input: { operation: 'chunk_id', document_content_digest: BRIEF_SECTIONS.content_digest, chunking_digest: digest(chunkingDocument(DEFAULT_CHUNKING)), ordinal: 0 } },
  { slug: 'chunk-id-later-ordinal', intent: 'the ordinal is written in decimal without padding', input: { operation: 'chunk_id', document_content_digest: BRIEF_SECTIONS.content_digest, chunking_digest: digest(chunkingDocument(DEFAULT_CHUNKING)), ordinal: 12 } },
  { slug: 'chunk-id-other-config', intent: 'the same ordinal under another chunking configuration is another chunk', input: { operation: 'chunk_id', document_content_digest: BRIEF_SECTIONS.content_digest, chunking_digest: digest(chunkingDocument(FIXED_CHUNKING)), ordinal: 0 } },
  { slug: 'chunk-content-digest', intent: 'a chunk content digest is sha256 over the UTF-8 bytes of the chunk text, not over canonical JSON', input: { operation: 'chunk_content_digest', text: 'Tools need grants.' } },
  { slug: 'chunk-content-digest-unicode', intent: 'chunk text is hashed without Unicode normalization', input: { operation: 'chunk_content_digest', text: 'Résumé: élève' } },
  { slug: 'query-digest', intent: 'a query is NFKC normalized and white space collapsed before hashing', input: { operation: 'query_digest', query: '  Refund\t\npolicy   ｆｏｒ  ﬁnal ' } },
  { slug: 'query-digest-unicode-space', intent: 'NEL and NO-BREAK SPACE are white space; case is preserved', input: { operation: 'query_digest', query: 'Gift\u0085Cards EU' } },
  { slug: 'query-empty', intent: 'a query of white space only is refused', input: { operation: 'query_digest', query: ' \n\t ' } },
  { slug: 'query-control-character', intent: 'a control character that is not white space is refused', input: { operation: 'query_digest', query: 'a\u0007b' } },
  { slug: 'integral-lexeme', intent: 'an integral number written 4.0 is the integer 4 in the Agenomic JSON Subset, so this document hashes like KD012', input: { operation: 'digest', document: FOURTH_VERSION_MANIFEST }, lexemes: [['"version": 4,', '"version": 4.0,']] },
  { slug: 'float-in-version-manifest', intent: 'a non-integral version number is outside the Agenomic JSON Subset', input: { operation: 'digest', document: { ...FIRST_VERSION_MANIFEST, version: 1.5 } } },
  { slug: 'float-threshold', intent: 'thresholds are parts per million integers, never fractions', input: { operation: 'digest', document: { ...EMPTY_AGENT_MANIFEST, retrieval: { ...DEFAULT_RETRIEVAL, min_evidence_score_ppm: 0.25 } } } },
  { slug: 'integer-out-of-range', intent: 'integers beyond 2^53 - 1 are outside the subset', input: { operation: 'digest', document: { ...EMPTY_VERSION_MANIFEST, version: 9007199254740993 } } },
  { slug: 'nul-in-tag', intent: 'a NUL character in a string is outside the subset', input: { operation: 'digest', document: { ...FIRST_VERSION_MANIFEST, documents: { [DOC_D]: { ...FIRST_VERSION_MANIFEST.documents[DOC_D], tags: ['bill\u0000ing'] } } } } },
  { slug: 'query-too-long', intent: 'a normalized query holds at most 2000 code points', input: { operation: 'query_digest', query: 'é'.repeat(2001) } },
  { slug: 'query-at-limit', intent: 'a normalized query of exactly 2000 code points is accepted', input: { operation: 'query_digest', query: 'é'.repeat(2000) } },
];

const REF_CASES = [
  ['base', 'a knowledge base reference', `kb://${W}/kb_customer_support`, W],
  ['base-version', 'a pinned knowledge base version', `kb://${W}/kb_customer_support@v4`, W],
  ['base-max-version', 'the largest version number', `kb://${W}/kb_customer_support@v2147483647`, W],
  ['document', 'a document of the working set', `kb://${W}/kb_customer_support/documents/${DOC_A}`, W],
  ['document-revision', 'a document revision', `kb://${W}/kb_customer_support/documents/${DOC_A}@v7`, W],
  ['kb-id-separators', 'kb ids may use underscores and hyphens between segments', `kb://${W}/kb_a-b_c9@v1`, W],
  ['offline-other-workspace', 'without a current workspace the workspace check is deferred', `kb://${OTHER}/kb_x@v2`, null],
  ['empty', 'the empty string', '', W],
  ['too-long', 'more than 512 bytes', `kb://${W}/kb_${'a'.repeat(600)}`, W],
  ['too-long-in-bytes', '285 code points but 525 UTF-8 bytes: the limit counts bytes', `kb://${W}/kb_${'é'.repeat(240)}`, W],
  ['space', 'a space inside the reference', `kb://${W}/kb_x y`, W],
  ['trailing-tab', 'a trailing tab', `kb://${W}/kb_x\t`, W],
  ['no-break-space', 'U+00A0 is white space', `kb://${W}/kb_x `, W],
  ['control-character', 'a control character', `kb://${W}/kb_x\u0007`, W],
  ['no-scheme', 'a bare kb id', 'kb_x', W],
  ['other-scheme', 'the agenomic scheme is not a knowledge reference', `agenomic://${W}/kb_x`, W],
  ['uppercase-scheme', 'the scheme is case sensitive', `KB://${W}/kb_x`, W],
  ['trailing-slash', 'a trailing slash', `kb://${W}/kb_x/`, W],
  ['query', 'a query string', `kb://${W}/kb_x?v=1`, W],
  ['fragment', 'a fragment', `kb://${W}/kb_x#intro`, W],
  ['empty-segment', 'an empty path segment', `kb://${W}//kb_x`, W],
  ['workspace-only', 'a workspace without a knowledge base', `kb://${W}`, W],
  ['nothing-after-scheme', 'nothing after the scheme', 'kb://', W],
  ['unknown-segment', 'a segment other than documents', `kb://${W}/kb_x/files/${DOC_A}`, W],
  ['version-before-documents', 'a document reference never pins the base version', `kb://${W}/kb_x@v1/documents/${DOC_A}`, W],
  ['bad-workspace', 'the workspace is not a uuid', 'kb://not-a-uuid/kb_x', W],
  ['uppercase-workspace', 'the workspace uuid is lowercase', `kb://${W.toUpperCase()}/kb_x`, W],
  ['prompt-id', 'a prompt id is not a kb id', `kb://${W}/prm_x`, W],
  ['double-separator', 'kb id segments are never empty', `kb://${W}/kb__x`, W],
  ['kb-id-too-long', 'kb ids hold at most 64 characters', `kb://${W}/kb_${'a'.repeat(62)}`, W],
  ['version-without-v', 'a version tag starts with v', `kb://${W}/kb_x@4`, W],
  ['version-zero', 'versions start at 1', `kb://${W}/kb_x@v0`, W],
  ['version-leading-zero', 'no leading zero', `kb://${W}/kb_x@v04`, W],
  ['version-too-large', 'versions fit a signed 32-bit integer', `kb://${W}/kb_x@v2147483648`, W],
  ['version-checked-before-kb-id', 'in the base form the version tag is checked before the kb id', `kb://${W}/kb_X@4`, W],
  ['two-version-tags', 'everything after the first @ is the version tag', `kb://${W}/kb_x@v1@v2`, W],
  ['short-document-id', 'document ids are kdoc_ plus 26 Crockford characters', `kb://${W}/kb_x/documents/kdoc_short`, W],
  ['uppercase-document-id', 'document ids are lowercase', `kb://${W}/kb_x/documents/${DOC_A.toUpperCase().replace('KDOC_', 'kdoc_')}`, W],
  ['revision-without-v', 'a revision tag starts with v', `kb://${W}/kb_x/documents/${DOC_A}@7`, W],
  ['kb-id-checked-before-document', 'in the document form the kb id is checked before the document', `kb://${W}/kb_X/documents/kdoc_short`, W],
  ['cross-workspace', 'a reference to another workspace is refused after parsing', `kb://${OTHER}/kb_x@v2`, W],
  ['cross-workspace-document', 'a document of another workspace is refused', `kb://${OTHER}/kb_x/documents/${DOC_A}@v1`, W],
];

const TOKEN_CASES = [
  ['empty', 'the empty text has no token', ''],
  ['one-word', 'a six letter word is two pieces of at most four characters', 'refund'],
  ['single-letters', 'white space separates and never counts', 'a b c'],
  ['punctuation', 'punctuation counts one token per character', 'refund policy.'],
  ['white-space-only', 'white space only', '  \n\t '],
  ['nine-letters', 'nine letters are three pieces', 'rembourse'],
  ['accented-letters', 'non-ASCII letters are word characters', 'élève'],
  ['date', 'digits are word characters and hyphens are punctuation', '2026-10-09'],
  ['cjk-run', 'CJK ideographs are alphabetic: five ideographs are two pieces', '知识库检索'],
  ['emoji', 'an emoji is neither alphanumeric nor white space', '👍 ok'],
  ['combining-mark', 'a combining acute accent is not alphabetic and counts as punctuation', 'é'],
  ['no-break-space', 'U+00A0 is white space', 'a b'],
  ['next-line', 'U+0085 is white space', 'a\u0085b'],
  ['byte-order-mark', 'U+FEFF is not white space and counts as one token', 'a﻿b'],
  ['sentence', 'a sentence with a comma', 'Customers receive refunds within fourteen days, élève.'],
  ['other-number', 'superscript two is a number (No) and joins the run', 'x²'],
  ['letter-number', 'a Roman numeral is a letter number (Nl)', 'Ⅻ'],
];

const LEXICAL_CASES = [
  ['mixed', 'lowercase alphanumeric runs', 'Refund Policy: 14-day window!'],
  ['underscore-and-dot', 'underscores and dots separate tokens', 'snake_case and dots.v2'],
  ['nfkc-ligature', 'NFKC expands ligatures and lowercase keeps accents', 'ÉLÈVE ﬁnal'],
  ['fullwidth-and-circled', 'fullwidth letters and circled digits normalize', 'ｒｅｆｕｎｄ ①'],
  ['punctuation-only', 'no token', '  ... !!'],
  ['no-stemming', 'no stemming', 'refunds refunding'],
  ['numbers-and-urls', 'decimal numbers, hyphenated words and URLs split into runs', '3.14 foo-bar https://example.com/a?b=c'],
  ['sharp-s', 'lowercase never folds ß', 'Straße STRASSE'],
  ['superscripts', 'NFKC maps superscript and subscript digits', 'x² H₂O'],
  ['final-sigma', 'lowercasing applies the final sigma rule', 'ΟΔΟΣ ΣΟΦΙΑ'],
  ['decomposed', 'NFKC composes decomposed accents', 'école naı̈ve'],
  ['dotted-capital-i', 'İ lowercases to i plus a combining dot, which is not alphanumeric', 'İstanbul'],
  ['cjk', 'CJK runs are tokens', '知识库 检索'],
];

const BM25_CASES = [
  ['single-term', 'one query term over three candidates with explicit corpus statistics', 'Refund', ['refund policy', 'refund refund window', 'shipping'], '1.2', '0.75', { documents: 3, average_length: '2.0' }],
  ['multi-term', 'duplicate query terms count once; per term contributions add up', 'refund window refund', ['refund policy', 'refund refund window', 'shipping'], '1.2', '0.75', { documents: 3, average_length: '2.0' }],
  ['corpus-statistics', 'corpus statistics larger than the candidate set change idf and length normalization', 'refund', ['refund policy', 'refund refund window'], '1.2', '0.75', { documents: 100, average_length: '10.0' }],
  ['ties', 'equal scores keep candidate order; candidates without a match are dropped', 'alpha', ['alpha beta', 'gamma', 'beta alpha', 'alpha beta'], '1.2', '0.75', null],
  ['no-match', 'no candidate matches', 'delta', ['alpha beta', 'gamma'], '1.2', '0.75', null],
  ['empty-query', 'a query without tokens ranks nothing', '... !!', ['alpha beta', 'gamma'], '1.2', '0.75', null],
  ['inconsistent-statistics', 'a zero average length falls back to the candidates and a small corpus count to the candidate count', 'refund', ['refund', 'refund', 'refund'], '1.2', '0.75', { documents: 1, average_length: '0' }],
  ['custom-parameters', 'k1 2.0 and b 0.5 over a five candidate corpus with Unicode tokens', 'élève ﬁnal policy', ['Final policy for every ÉLÈVE', 'policy policy policy', 'élève notes and final grades', 'unrelated shipping text', 'FINAL final final policy élève'], '2.0', '0.5', null],
  ['no-candidates', 'no candidate', 'refund', [], '1.2', '0.75', null],
];

function envelope(suite, index, slug, intent, input) {
  const id = SUITES[suite] + String(index + 1).padStart(3, '0');
  return { schema: 'agenomic.conformance_vector/v1', suite, id, intent, consumers: CONSUMERS, input, slug };
}

function generate() {
  const out = [];
  SECTION_CASES.forEach((c, i) => {
    const input = { operation: 'sections', document_id: c.document_id, fallback_title: c.fallback_title };
    if (c.markdown !== undefined) input.source = { format: 'markdown', text: c.markdown };
    input.outline = c.outline;
    out.push(envelope('section', i, c.slug, c.intent, input));
  });
  DIGEST_CASES.forEach((c, i) => out.push({ ...envelope('digest', i, c.slug, c.intent, c.input), lexemes: c.lexemes }));
  REF_CASES.forEach(([slug, intent, ref, workspace], i) => out.push(envelope('ref', i, slug, intent, { ref, workspace_id: workspace })));
  TOKEN_CASES.forEach(([slug, intent, text], i) => out.push(envelope('tokens', i, slug, intent, { text })));
  LEXICAL_CASES.forEach(([slug, intent, text], i) => out.push(envelope('lexical', i, slug, intent, { text })));
  BM25_CASES.forEach(([slug, intent, query, candidates, k1, b, corpus], i) => out.push(envelope('bm25', i, slug, intent, { query, candidates, k1, b, corpus })));
  return out.map((v) => {
    const { slug, lexemes, ...vector } = v;
    vector.expected = computeExpected(vector);
    let text = JSON.stringify(vector, null, 2) + '\n';
    for (const [from, to] of lexemes || []) {
      if (!text.includes(from)) throw new Error(`${vector.id}: lexeme ${from} not found`);
      text = text.replace(from, to);
    }
    return { rel: `${vector.suite}/${vector.id}-${slug}.json`, text };
  });
}

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

function checkVector(full, ids) {
  const rel = relPath(full);
  const raw = fs.readFileSync(full, 'utf8');
  let v;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    return fail(rel, 'JSON parse error: ' + e.message);
  }
  const errors = schemaErrors('knowledge-conformance-vector.schema.json', v);
  if (errors) return fail(rel, 'fails knowledge-conformance-vector: ' + errors);
  const [suiteDir, base] = rel.split('/');
  const match = /^(K[SDRTLM][0-9]{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.exec(base);
  if (!match) return fail(rel, 'file name must be <id>-<kebab-slug>.json');
  if (match[1] !== v.id) return fail(rel, `file prefix ${match[1]} differs from id ${v.id}`);
  if (suiteDir !== v.suite) return fail(rel, `directory ${suiteDir} differs from suite ${v.suite}`);
  if (!v.id.startsWith(SUITES[v.suite])) return fail(rel, `id ${v.id} does not belong to suite ${v.suite}`);
  if (ids.has(v.id)) return fail(rel, `duplicate id ${v.id} (also ${ids.get(v.id)})`);
  ids.set(v.id, rel);
  if (LEXEMES[v.id] && !raw.includes(LEXEMES[v.id])) return fail(rel, `must keep the lexeme ${LEXEMES[v.id]}`);
  let problem = null;
  try {
    const want = computeExpected(v);
    if (!same(want, v.expected)) problem = `expected differs from the recomputed value ${JSON.stringify(want)}`;
    else if (v.suite === 'digest') problem = checkDigestInput(v);
    else if (v.suite === 'section') problem = checkSectionInput(v);
  } catch (e) {
    problem = e.message;
  }
  if (problem) return fail(rel, problem);
  pass(rel, v.suite);
}

function checkManifest() {
  const manifestPath = path.join(VECTORS, MANIFEST);
  if (!fs.existsSync(manifestPath)) return fail(MANIFEST, 'missing; run node scripts/knowledge-vectors.js --write-manifest');
  const actual = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const want = buildManifest();
  const keys = Object.keys(actual.files || {});
  if (keys.join('\n') !== [...keys].sort().join('\n')) fail(MANIFEST, 'file keys are not sorted');
  for (const member of ['schema', 'token_counter']) {
    if (actual[member] !== want[member]) fail(MANIFEST, `${member} must be ${JSON.stringify(want[member])}`);
  }
  for (const file of Object.keys(want.files)) {
    if (!(file in (actual.files || {}))) fail(MANIFEST, `missing entry for ${file}`);
    else if (actual.files[file] !== want.files[file]) fail(MANIFEST, `hash mismatch for ${file}`);
  }
  for (const file of keys) if (!(file in want.files)) fail(MANIFEST, `entry for a file that does not exist: ${file}`);
  pass(MANIFEST, `${Object.keys(want.files).length} files`);
}

function checkGenerated() {
  const generated = generate();
  const expectedFiles = new Set(generated.map((g) => g.rel));
  for (const { rel, text } of generated) {
    const full = path.join(VECTORS, rel);
    if (!fs.existsSync(full)) fail(rel, 'missing; run node scripts/knowledge-vectors.js --write');
    else if (fs.readFileSync(full, 'utf8') !== text) fail(rel, 'differs from the generator output; vectors change only through scripts/knowledge-vectors.js --write');
  }
  for (const full of walk(VECTORS)) {
    const rel = relPath(full);
    if (rel.includes('/') && !expectedFiles.has(rel)) fail(rel, 'not produced by the generator');
  }
}

function writeVectors() {
  for (const suite of Object.keys(SUITES)) {
    const dir = path.join(VECTORS, suite);
    if (fs.existsSync(dir)) for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name));
  }
  for (const { rel, text } of generate()) {
    const full = path.join(VECTORS, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
}

function compute(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (doc && doc.schema === 'agenomic.conformance_vector/v1') {
    console.log(JSON.stringify(computeExpected(doc), null, 2));
    return;
  }
  const error = ajsError(doc);
  if (error) {
    console.log(JSON.stringify({ error }));
    return;
  }
  const text = canonicalJson(doc);
  console.log(JSON.stringify({ canonical: text, digest: sha256(text) }));
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--compute') {
    if (!args[1]) {
      console.error('usage: node scripts/knowledge-vectors.js --compute <file>');
      process.exit(2);
    }
    compute(path.resolve(args[1]));
    return;
  }
  if (args[0] === '--write') writeVectors();
  if (args[0] === '--write' || args[0] === '--write-manifest') {
    fs.writeFileSync(path.join(VECTORS, MANIFEST), JSON.stringify(buildManifest(), null, 2) + '\n');
  }
  if (!fs.existsSync(path.join(VECTORS, README))) fail(README, 'missing');
  const ids = new Map();
  const vectorFiles = walk(VECTORS).filter((f) => relPath(f).includes('/')).sort();
  for (const full of vectorFiles) {
    const rel = relPath(full);
    const suiteDir = rel.split('/')[0];
    if (!(suiteDir in SUITES)) fail(rel, `unknown suite directory ${suiteDir}`);
    else if (!rel.endsWith('.json')) fail(rel, 'vector files are JSON');
    else checkVector(full, ids);
  }
  checkGenerated();
  checkManifest();
  if (failures > 0) {
    console.error(`\n${failures} failure(s), ${passes} pass(es).`);
    process.exit(1);
  }
  console.log(`OK, ${passes} knowledge conformance check(s) passed.`);
}

main();
