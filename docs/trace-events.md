# Trace events: producing, redacting, selecting

Tutorial companion to
[`schemas/v0.1/trace-event.schema.json`](../schemas/v0.1/trace-event.schema.json).

A trace event is one **production run** envelope. Producers emit
trace events from runtime; replay systems read them and re-execute
under the bundle to evaluate the behavior contract.

## What a trace looks like

```yaml
trace_id: 01HZ8K8YNJ5T2ABCDEFGH1JKLM      # ULID or UUID
run_id: r-0001
agent_id: agent://example/min-bot
release: v3.2.0                            # strongly recommended
timestamp: "2026-05-01T12:00:00Z"
input:
  type: text
  payload_ref: blob://traces/0001/input    # OR payload_inline (avoid for PII)
model_calls:
  - provider, model, fingerprint, temperature
    prompt_hash, output_hash, latency_ms, cost_estimate
tool_calls:
  - tool, protocol, input_hash, output_hash, status
final_output:
  hash: blake3:…
  ref: blob://traces/0001/output
labels:
  tenant: example-tenant-a
  expected_category: property_damage
metadata:
  tags: [...]
```

## Hashes everywhere

Most "content" fields are referenced by hash, with the option to
attach a payload reference (blob URI, object id) for the full bytes.
This is how the trace stays small and PII-safe by default.

For input and final output, the schema enforces a `oneOf` between
`payload_ref` (out-of-band) and `payload_inline` (verbatim). Prefer
`payload_ref` for any content that may include PII.

## Redaction guidance

Producers SHOULD apply at minimum:

- **Tokenize** user identifiers (replace names, account numbers).
- **Redact** free-text fields that may carry PII before storing or
  transmitting trace events.
- Use `payload_ref` to point to a redacted blob in your retention-
  controlled object store.

The spec does not mandate a specific redaction algorithm. It does
require that `payload_inline` for `input` and `final_output` not
contain unredacted PII, by convention rather than schema (the schema
allows it; producers must enforce it).

## Labels and selection

`labels` is a free-form `string -> string` map. Replay systems use
labels to **select** which traces to replay:

- `tenant`, `region`, `severity`, `expected_category` are common.
- The `evals/replay_manifest.yaml` example in `claims-agent/` shows
  how a manifest expresses selection by labels.

Keep label values short and stable; don't use them for unique
identifiers (use `trace_id` instead).

## `metadata`

Free-form, additive. Producers SHOULD document the keys they emit so
downstream tooling can read them deterministically. Avoid putting
PII or large payloads in metadata; use `payload_ref` for that.

## Hash format

All hash fields use a `<algo>:<hex>` prefix:

- `blake3:<64+ hex>`
- `sha256:<64 hex>`

Mixing algorithms is permitted at v0.1; producers SHOULD pick one and
use it consistently.

## Producing traces from a runtime

A typical runtime produces:

1. A trace at the start of a run with `trace_id`, `agent_id`,
   `release`, `timestamp`, and `input`.
2. Per-step entries pushed into `model_calls` and `tool_calls` as
   they happen.
3. A `final_output` with a `hash` and a `ref`.
4. A flush to the trace sink at run end.

If traces stream live to ATEP (`stream: interaction`), they SHOULD
reference the `trace_id` in the ATEP event payload so cross-system
correlation is straightforward.

## Anti-patterns

- **Inlining the prompt as `payload_inline`.** Use `prompt_hash`.
  Store the prompt text once, reference it by hash.
- **Skipping `provider_fingerprint`.** Without it, statistical
  replay cannot detect silent provider drift.
- **Mixing units in `cost_estimate` across producers.** Document the
  unit in `metadata.cost_unit` if you emit one.
