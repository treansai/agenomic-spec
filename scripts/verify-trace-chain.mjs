#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// The normative trace spec uses BLAKE3/JCS. This dependency-free conformance
// helper mirrors the repository validator's deterministic fixture digest so CI
// can test chain wiring and Merkle-root plumbing without native extensions.
function digest(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function verify(file) {
  const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
  let prev = '0'.repeat(64);
  for (let i = 0; i < trace.events.length; i += 1) {
    const event = { ...trace.events[i] };
    const actual = event.event_hash;
    delete event.event_hash;
    const expected = digest(canonicalJson(event) + event.prev_event_hash);
    if (event.prev_event_hash !== prev) throw new Error(`event ${i} prev_event_hash mismatch`);
    if (actual !== expected) throw new Error(`event ${i} event_hash mismatch`);
    prev = actual;
  }
  const root = digest(trace.events.map((event) => event.event_hash).join(''));
  if (root !== trace.integrity.run_merkle_root) throw new Error('run_merkle_root mismatch');
  return { events: trace.events.length, run_merkle_root: root };
}

const file = process.argv[2] || 'conformance/valid/trace-event/rich.json';
const result = verify(file);
console.log(`OK ${file}: ${result.events} events, root ${result.run_merkle_root}`);
