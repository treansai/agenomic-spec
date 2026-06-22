#!/usr/bin/env node
import fs from 'node:fs';
import crypto from './trace-crypto.js';

function verify(file) {
  const trace = JSON.parse(fs.readFileSync(file, 'utf8'));
  let prev = `blake3:${'0'.repeat(64)}`;
  for (let i = 0; i < trace.events.length; i += 1) {
    const event = { ...trace.events[i] };
    const actual = event.event_hash;
    delete event.event_hash;
    const expected = crypto.eventHash(event);
    if (event.prev_event_hash !== prev) throw new Error(`event ${i} prev_event_hash mismatch`);
    if (actual !== expected) throw new Error(`event ${i} event_hash mismatch`);
    prev = actual;
  }
  const root = crypto.merkleRoot(trace.events.map((event) => event.event_hash));
  if (root !== trace.integrity.run_merkle_root) throw new Error('run_merkle_root mismatch');
  return { events: trace.events.length, run_merkle_root: root };
}

const file = process.argv[2] || 'conformance/valid/trace-event/rich.json';
const result = verify(file);
console.log(`OK ${file}: ${result.events} events, root ${result.run_merkle_root}`);
