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

Every hashed member is always present: absence is `null`, `{}` or `[]`, never a
missing key, and unknown members are refused.

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
  digest alone would miss.

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
