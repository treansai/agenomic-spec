# Managed prompts

This guide explains how managed prompts are written, referenced, rendered and
verified. The normative text is [RFC 0012](../rfcs/0012-managed-prompts.md);
the schemas are in [`schemas/v0.4/`](../schemas/v0.4/) and the cross-language
conformance vectors in
[`conformance/vectors/prompts/`](../conformance/vectors/prompts/README.md).

## The documents at a glance

| Document | Schema | Hashed | Role |
|---|---|---|---|
| `agenomic.prompt_content/v1` | `prompt-content.schema.json` | yes, whole | the behavior-relevant prompt: template, variables, partials, output contract, fragment pins |
| `agenomic.prompt_version/v1` | `prompt-version.schema.json` | only `content` | one immutable version with its metadata |
| `agenomic.prompt_manifest/v1` | `prompt-manifest.schema.json` | yes, whole | the prompt pins of one agent version, plus child agent pins |
| `agenomic.rendered_prompt/v1` | `rendered-prompt.schema.json` | yes, whole | the input of `rendered_hash` |
| `agenomic.prompt_artifact_set/v1` | `prompt-artifact-set.schema.json` | yes, whole | the input of `prompt_bundle_digest` |
| `agenomic.prompt_bundle/v1` | `prompt-bundle.schema.json` | no (signed when exported) | the exact prompt closure of an agent version, for offline use |
| `agenomic.execution_binding/v1` | `execution-binding.schema.json` | no | the pin of one thread or execution to an agent version |
| `agenomic.prompt_discovery_report/v1` | `prompt-discovery-report.schema.json` | yes, whole | what a static scan found in a code base, without the code |
| `agenomic.prompt_import_plan/v1` | `prompt-import-plan.schema.json` | yes, without `plan_digest` | the reviewable plan computed from a report or a prompts file |
| `agenomic.prompts_file/v1` | `prompts-file.schema.json` | no (authoring form) | a declarative family of prompts plus the slot mapping of one agent |
| `agenomic.prompt_file/v1` | `prompt-file.schema.json` | no | one prompt as a local file, for push, pull, render and digest |
| `agenomic.experiment_case/v1` | `experiment-case.schema.json` | by the server only, always with `schema` (cases may hold floats) | one dataset entry of a prompt experiment; dataset upload lines omit `schema` |
| `agenomic.experiment_spec/v1` | `experiment-spec.schema.json` | yes, without `identity` | the frozen spec of one experiment: arms, dataset, tool mode, evaluators, metrics, analysis and budgets |

Every hashed member is always present: absence is `null`, `{}` or `[]`, never a
missing key, and unknown members are refused.

Timestamps are RFC 3339 instants in UTC with a `Z` suffix and whole seconds,
such as `2026-10-04T21:02:11Z`; a string of that shape that names no real date
or time, such as `2026-02-30T00:00:00Z`, is refused. Wherever a document
carries both a prompt-level kind and the content, including the prompt entries
of an artifact set or bundle, the two agree: `chat` with chat content, `text`
and `fragment` with text content.

## Referencing a prompt

| You write | Meaning | Where |
|---|---|---|
| `prm_support_planner` | the logical prompt | management only (listing, editing); never in execution, because there is no implicit latest |
| `prm_support_planner:7` | immutable version 7 | everywhere |
| `prm_support_planner@staging` | a mutable alias, resolved once to a version that is recorded | everywhere except documents |
| `agenomic://0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f/prompts/prm_support_planner/versions/7` | version 7 in that workspace | everywhere; refused when it names another workspace |

References are case sensitive and are never trimmed, case-folded or
percent-decoded. `prm_x:7@staging`, `prm_x:07`, `PRM_x:1` and
`agenomic://.../versions/7/` are all refused, each with a precise reason
(`mixed_form`, `invalid_version`, `uppercase`, `trailing_slash`).

## Writing templates

Templates use `agenomic-fstring/v1`, a strict subset of Python `str.format`:

```text
Hello {name}                 a variable
{{ and }}                    literal braces
{>safety}                    the fragment declared under "safety" in the fragments map
```

Everything else inside braces is a syntax error: format specs (`{x:>10}`),
conversions (`{x!r}`), attribute or index access (`{x.y}`, `{x[0]}`),
positional fields (`{0}`), whitespace in a field and nested fields. Write
`{{"a": 1}}` for literal JSON in a template. Errors report the reason and the
position in Unicode code points, with a line and a column.

A chat prompt is an ordered list of `{ "role", "content" }` messages (roles
`system`, `user`, `assistant`) and `{ "placeholder", "optional" }` entries. A
placeholder names a variable of type `messages`, through which conversation
history enters the prompt.

## Variables and partials

| Type | Accepted values | Rendered as |
|---|---|---|
| `string` | a string | the string, verbatim |
| `integer` | an integer within plus or minus 2^53 - 1 | decimal digits |
| `boolean` | `true` or `false` | `true` or `false` |
| `json` | any value of the Agenomic JSON Subset | canonical JSON (a string renders with its quotes) |
| `messages` | a list of messages | spliced at the placeholder, unchanged |

Non-integral numbers are refused everywhere (`float_not_allowed`), because
languages format them differently. A partial is a stored default for an
optional scalar variable; a value passed by the caller overrides it. Variable
descriptions are version metadata and do not change the digest.

## Rendering

The renderer validates the content, binds the values, then expands fragments
and substitutes in a single pass. A value that looks like `{other}` or
`{>safety}` is printed as is. Rendering never trims or normalizes anything:
CRLF, tabs, trailing newlines and Unicode forms are kept exactly. Every failure
(missing or unknown variable, wrong type, invalid template) is a
`prompt_render_error` raised before any model call, and no error ever contains
a variable value.

History reaches a chat prompt through exactly one channel: its placeholder, or,
when it has none, the `history` option appended after the template messages.
Passing both is refused, and a history system message equal to the rendered
system message is refused by default, which catches a system prompt that was
written back into conversation state.

## Digests

```text
digest = "sha256:" + lowercase hex of sha256(canonical JSON of the document)
```

The canonical JSON sorts object keys by UTF-16 code units, writes no
whitespace, prints integers in plain decimal and escapes only `"`, `\` and the
control characters below U+0020. Every hashed document names its own type in
its `schema` member, so equal bytes can never mean two things.

- `content_digest` identifies prompt content: two prompts with identical
  content share it, whatever their ids, versions or authors.
- `prompt_manifest_digest` identifies the prompt pins of an agent version. A
  legacy release without a manifest uses the digest of its empty manifest.
- `rendered_hash` identifies one rendering, excluding conversation history, so
  it stays stable across turns.
- `prompt_bundle_digest` identifies the whole artifact closure (root manifest,
  child manifests, every prompt). Pin it when you deploy an offline bundle:
  `expected_bundle_digest` catches a swapped child prompt that a root manifest
  digest alone would miss. A load also names the workspace and agent it
  expects, and a bundle of another workspace or agent is refused
  (`bundle_scope_mismatch`, vectors D029 and D030).

Verify before use: recompute the digest of every downloaded or bundled
artifact and refuse it on mismatch.

## Secrets

Prompt templates must not contain credentials. Content that matches one of the
`agenomic-secrets/1` patterns (bearer tokens, private key blocks, OpenAI,
Stripe, AWS, GitHub, Hugging Face, Slack, Google and Agenomic keys, JWTs) is
refused when it is published, saved as a draft or imported, with the pattern
id and position only. A variable whose name looks like a secret (`api_key`,
`clientSecret`) produces a warning, and its values are redacted wherever they
are stored or exported.

## Discovering and importing prompts

Importing existing prompts takes four steps:

1. A static scanner reads the source files without importing or executing
   them and writes an `agenomic.prompt_discovery_report/v1`.
2. The report, never the source code, is uploaded. The server answers with an
   `agenomic.prompt_import_plan/v1` that proposes one action per candidate.
3. A person reviews the plan and decides each item.
4. The apply call cites the plan's `plan_digest`, so it writes exactly the
   plan that was reviewed.

Neither the scanner nor the import ever modifies a source file. Replacing a
string constant by a managed reference stays a change the developer makes.

The excerpts below come from the conformance fixtures
[`valid/prompt-discovery-report/mixed-statuses.json`](../conformance/valid/prompt-discovery-report/mixed-statuses.json)
and
[`valid/prompt-import-plan/from-discovery-report.json`](../conformance/valid/prompt-import-plan/from-discovery-report.json).
The plan is the one a server computes from that report.

### The discovery report

The report is the only thing that leaves the developer's machine: paths are
repository-relative, the scanned files appear only as sha256 hashes, and
source text appears only as the extracted templates. One supported candidate,
with the report header and one file entry:

```json
{
  "schema": "agenomic.prompt_discovery_report/v1",
  "scanner": { "name": "agenomic-python", "version": "0.4.0", "python_grammar": "3.10", "secret_patterns": "agenomic-secrets/1" },
  "root": { "label": "support-agent", "vcs": { "kind": "git", "commit": "fda6e0b1853563d3aa6593712c0d4a1ae85cb069" } },
  "generated_at": "2026-10-04T21:30:00Z",
  "limits": { "max_files": 4000, "max_file_bytes": 524288 },
  "files": [
    { "path": "app/prompts.py", "sha256": "sha256:82daeaa56356c06c8c08180a907acca0f2212cc5197f50b2512a8efd6ee86279", "status": "scanned", "skip_reason": null }
  ],
  "candidates": [
    {
      "candidate_id": "cand_f094f4c2e661f8ba",
      "status": "supported",
      "construct": "python.string_constant",
      "source": { "path": "app/prompts.py", "line": 12, "column": 17, "end_line": 15, "end_column": 4, "symbol": "WRITER_PROMPT", "enclosing_function": null },
      "proposal": { "prompt_id": "prm_support_writer", "prompt_kind": "text", "slot_path": "writer.instructions", "node_path": "writer", "usage": "instructions" },
      "content": {
        "schema": "agenomic.prompt_content/v1",
        "template_format": "agenomic-fstring/v1",
        "renderer_version": "1",
        "kind": "text",
        "body": "Write a short answer to {question}.\nKeep it under 120 words.",
        "variables": { "question": { "type": "string", "required": true } },
        "partials": {},
        "output_contract": null,
        "fragments": {}
      },
      "content_digest": "sha256:66cbaaecfb9b9a20c4f8feb1e3a679f7f1c216995e15672b553b8aaf80f919f3",
      "issues": [],
      "secret_findings": []
    }
  ]
}
```

| Member | Rule |
|---|---|
| `scanner` | the scanner name and version, the Python grammar it parsed, and the secret pattern set it applied |
| `root.label` | free text of at most 128 code points, never an absolute path (a leading `/`, `\`, `~` or drive letter is refused) |
| `root.vcs` | `null` or `{ "kind": "git", "commit": <40 hex> }` |
| `files[].path`, `source.path` | repository-relative POSIX path: no leading `/`, no `..` segment, no backslash |
| `files[].sha256` | the sha256 of the file bytes, which lets a server detect that a plan went stale |
| `files[].status`, `skip_reason` | `scanned` with `null`, or `skipped` with `too_large`, `syntax_error`, `not_utf8`, `excluded` or `limit_reached` |
| `source.line`, `source.column` | 1-based; columns count code points |
| `proposal` | the proposed prompt id, prompt kind, slot path, node path and slot usage (`system`, `instructions`, `user`, `chat`, `tool_description` or `other`); `node_path` comes only from the graph node rules, never from a guess |
| `issues[]` | `{ code, severity, line, column, message }` with severity `error`, `warning` or `info`; the message never quotes source text |
| `secret_findings[]` | `{ pattern, line, column, length }`: the pattern id and a location, never the matched text |

| Candidate status | Meaning | `content` |
|---|---|---|
| `supported` | a template the scanner could port exactly | set |
| `unsupported` | a recognized construct with a refused feature (for example a mustache template) | `null` |
| `unresolved` | a dynamic construct: an f-string, `.format`, a remote prompt, a call result, a subgraph node | `null` |
| `blocked_secret` | the template contains a credential; only the pattern id and location are reported | `null` |

The `construct` names what the scanner recognized: a LangChain prompt,
message or message template, the prompt of a LangGraph or LangChain agent
constructor, a module string constant, a graph node that runs a subgraph, or
`dynamic`. A `dynamic` construct is always `unresolved`. A graph node backed by
a compiled subgraph or an agent constructor is a `langgraph.subagent_node`
candidate: always `unresolved`, with a `node_path` and the issue
`subagent_unmapped`, until someone maps it to a child agent. Issue codes are
lowercase identifiers, for example `python_fstring`, `dynamic_template`,
`remote_prompt`, `unsupported_template_format`, `node_unresolved`,
`secret_detected` or a template syntax reason such as `format_spec`.

`candidate_id` is `cand_` plus the first 16 hex digits of the sha256 of the
canonical JSON of `{ path, line, column, construct }`, so it is stable across
rescans of an unchanged file. For the planner candidate of the fixture, the
canonical JSON is
`{"column":18,"construct":"langchain.chat_prompt_template","line":42,"path":"app/graph.py"}`
and its id is `cand_2a913ea2ec842236`.

The report is hashed whole. Its digest is the `source.digest` of every plan
computed from it.

### The import plan

The server answers with one item per candidate, each with a proposed action
and a proposed slot. The item that the fixture plan computes for the candidate
above:

```json
{
  "item_id": "cand_f094f4c2e661f8ba",
  "action": "create_prompt",
  "prompt_id": "prm_support_writer",
  "prompt_kind": "text",
  "base_version": null,
  "content": { "schema": "agenomic.prompt_content/v1", "...": "the candidate content, unchanged" },
  "content_digest": "sha256:66cbaaecfb9b9a20c4f8feb1e3a679f7f1c216995e15672b553b8aaf80f919f3",
  "existing_version_with_same_digest": null,
  "slot": { "slot_path": "writer.instructions", "node_path": "writer", "subagent_id": null, "usage": "instructions", "status": "discovered" },
  "issues": [],
  "secret_findings": [],
  "provenance": { "source_file": "app/prompts.py", "source_line": 12 }
}
```

| Action | Meaning | Members it requires |
|---|---|---|
| `create_prompt` | a new prompt, version 1 | `prompt_id`, `prompt_kind`, `content`; `base_version` is `null` |
| `create_version` | a new version of an existing prompt | `prompt_id`, `prompt_kind`, `content`, and `base_version`, the latest version when the plan was computed |
| `reuse_version` | a version with the same `content_digest` is already published; nothing is created | `prompt_id`, `content_digest`, `existing_version_with_same_digest` |
| `map_slot_only` | the slot is mapped, no prompt is written | |
| `skip` | nothing is written | |
| `blocked` | a secret, a refused construct or invalid content; nothing can be written | `content` is `null` |

- `content` and `content_digest` are `null` together, and `prompt_kind`
  agrees with `content.kind` (`chat` for a chat prompt, `text` or `fragment`
  for text content).
- `slot` is `{ slot_path, node_path, subagent_id, usage, status }`, with status
  `managed`, `discovered`, `unresolved`, `observed_only` or `unused`.
- Unresolved candidates are always listed with slot status `unresolved` and
  action `skip`: an import never marks a prompt as managed that it could not
  port, and a plan never claims complete coverage.
- `summary` counts the items per action, plus `unresolved`, the number of items
  whose slot status is `unresolved`. It is hashed and must equal the counts
  recomputed from `items`. The fixture plan counts one `create_prompt`, one
  `create_version`, one `reuse_version`, two `skip` (both unresolved) and two
  `blocked` (the secret and the mustache template).

`plan_digest` is the digest of the plan without its `plan_digest` member
(vector D025). To check it, drop the member and hash the rest:

```sh
node -e 'const fs = require("fs"); const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); delete p.plan_digest; fs.writeFileSync(process.argv[2], JSON.stringify(p))' \
  conformance/valid/prompt-import-plan/from-discovery-report.json /tmp/plan-body.json
node scripts/vectors.js --compute /tmp/plan-body.json
```

The printed digest equals the fixture's `plan_digest`
(`sha256:13d9302f58ce3b2aaf9b6cd13e6f5c2c33f39bcf544232b99633f13ff0672ada`).

### Applying a plan

An apply call cites `plan_digest` and decides each item. A server applies
nothing when the cited digest differs from the plan it computed, when a
`create_version` item's `base_version` is no longer the latest version, or
when a prompts file's `expected_latest_version` no longer matches; each of
these is `prompt_import_plan_stale`. A stored plan is applied at most once.

`source.kind` says what the plan was computed from:

| `source.kind` | `plan_id`, `created_at` | `item_id` |
|---|---|---|
| `discovery_report` | set: the plan is stored until it is applied | the `candidate_id` |
| `prompts_file` | `null`: the plan is not stored, and the apply call recomputes it and compares the digest | `cand_` plus the first 16 hex digits of the sha256 of the UTF-8 bytes of the `prompt_id` |

The schema also reserves `langchain_runtime` for templates imported from a
running LangChain application.

The plan does not carry the revision of the agent's slot declarations.
Applying a prompts file that declares slots therefore also states the slot
revision it was planned against, as a separate precondition, and a moved
revision refuses the apply.

## Prompt files

An `agenomic.prompts_file/v1` declares a family of prompts and, optionally,
the slot mapping of one agent. It is an authoring format: `schema`,
`template_format`, `renderer_version`, `partials`, `output_contract` and
`fragments` may be omitted from each `content` and take their defaults. A
fragment entry names a prompt of the same file by `{ prompt_id }`, meaning the
version this file produces, or an existing version by `{ prompt_id, version }`,
optionally checked with `content_digest`. File-local fragment references must
not form a cycle. Servers accept the JSON form only and plan it like a report,
with `source.kind = "prompts_file"`; such a plan is not stored, so its
`plan_id` and `created_at` are `null`.

An `agenomic.prompt_file/v1` holds one prompt with its full content, for
command line tools that push, pull, render and digest a single prompt. Its
`version` and `content_digest` are written on pull and checked on push.

YAML files follow the `agenomic-yaml/1` profile, so that every YAML parser
reads them the same way:

| Rule | Result |
|---|---|
| documents | exactly one (`yaml_multiple_documents`) |
| anchors, aliases, merge keys | refused (`yaml_alias_unsupported`) |
| tags, even `!!str` | refused (`yaml_tag_unsupported`) |
| duplicate keys | refused (`yaml_duplicate_key`) |
| plain `true`, `false` | booleans; `yes`, `on`, `Off`, `True` stay strings |
| plain `null`, `~`, empty | null |
| plain `[-+]?[0-9]+` | an integer within plus or minus 2^53 - 1 |
| plain float form (`1.5`, `1e3`, `.inf`) | refused (`float_not_allowed`) |
| block scalars | YAML 1.2 chomping: the literal indicator keeps one final line feed, its strip form (`-`) none, its keep form (`+`) all |

The `prompts-file-yaml` vectors (Y001 to Y010) pin these rules.

## Release attestations, version 2

A release attestation of an agent version linked to a genome has
`schema_version: 2` and adds `genome_version`, the agent version digest, and
`prompt_manifest_digest`, both covered by the signature. Releases without a
genome keep `schema_version: 1`, and every version 1 attestation stays valid.
The schema is `schemas/v0.4/release-attestation.schema.json`, which accepts
both versions. [Reading and verifying attestations](attestations.md) shows a
version 2 document and the checks it adds.

## Consuming the conformance vectors

An implementation of RFC 0012 proves parity by running the vectors:

1. Copy `conformance/vectors/prompts/` into the implementation and record a
   `SPEC_VECTORS.lock` holding the spec commit and the sha256 of
   `MANIFEST.json`.
2. In the test harness, check the lock and every file hash against the
   manifest, then run every vector whose `consumers` names the implementation.
3. Compare only the members present in `expected`, as the
   [vector README](../conformance/vectors/prompts/README.md) describes.

In this repository, `npm run validate` checks the schemas, the fixtures and the
vectors; `node scripts/vectors.js --compute <file>` prints the canonical JSON
and digest of a vector's hashable members or of any JSON document.
