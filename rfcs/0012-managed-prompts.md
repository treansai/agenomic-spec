# RFC 0012: Managed Prompts

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Draft                                                       |
| Created      | 2026-10-05                                                  |
| Author(s)    | Agenomic maintainers \<spec@agenomic.dev\>                  |
| Spec version | v0.4                                                        |
| Supersedes   | none                                                        |
| Related      | RFC 0002, RFC 0008                                          |

## Summary

RFC 0012 makes prompts first-class, immutable, content-addressed artifacts of
an agent version. It defines the prompt documents (content, version, manifest,
rendered prompt, artifact set, bundle, execution binding), one canonical JSON
form and the sha256 digests computed over it, the prompt reference grammar
(`prm_x:7`, `prm_x@alias`, `agenomic://<workspace>/prompts/<id>/versions/<n>`),
the strict template grammar `agenomic-fstring/v1` with its renderer version
`"1"`, and the portable secret pattern set `agenomic-secrets/1`. The schemas
live in `schemas/v0.4/`; cross-language parity is proven by the conformance
vectors under `conformance/vectors/prompts/`, which every implementation
(Rust, Python, TypeScript) runs.

## Motivation

Prompts decide most of an agent's behavior, yet they usually live as string
constants in application code: they change without a new agent version, nobody
can say which text produced a given answer, and two languages that render "the
same" template disagree on whitespace, booleans or JSON key order. Managed
prompts give each prompt version a digest that depends only on its
behavior-relevant content, pin every agent version to an exact set of prompt
versions through a manifest, and render deterministically, so that an
execution can be reproduced, compared and audited from digests alone.

## Detailed design

### Common rules

- Every document is a JSON object whose top-level `schema` member is a string
  `agenomic.<name>/v<major>`. The schema string is the domain separator of
  every digest. A reader that does not know the exact string refuses the
  document; it never guesses a compatible version.
- Field names are `snake_case` ASCII. Unknown members are refused at every
  level (`additionalProperties: false`), so a reader can never drop a member
  that the writer hashed.
- Presence rule for hashed documents: every listed member is always present.
  Absence is written `null` for scalars and objects, `{}` or `[]` for maps and
  lists, exactly as the member table says.
- Timestamps are RFC 3339 UTC with a `Z` suffix and whole seconds
  (`2026-10-04T21:02:11Z`). They appear only in documents or members that are
  not hashed.

### Identifier grammars

| Identifier | Grammar | Max |
|---|---|---|
| prompt id | `^prm_[a-z0-9]+(?:[_-][a-z0-9]+)*$` | 64 chars |
| prompt version | `^[1-9][0-9]{0,9}$`, value at most 2147483647 | |
| alias | `^[a-z][a-z0-9_-]{0,31}$` | 32 |
| workspace, agent, release ids | lowercase hyphenated uuid | |
| slot path | `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` | 128 |
| variable and fragment name | `^[A-Za-z_][A-Za-z0-9_]*$` | 64 |
| channel | `^[a-z][a-z0-9-]{0,31}$` | |
| digest | `^sha256:[0-9a-f]{64}$` | |
| runtime bundle hash | `^(blake3\|blake3-merkle-v1):[0-9a-f]{64}$` | |
| binding id | `bnd_` plus 26 lowercase Crockford base32 characters | |

### The Agenomic JSON Subset (AJS)

Every hashed document, every partial and every runtime value of type
`string`, `integer`, `boolean` or `json` must be in AJS. A value is in AJS when:

| Node | Rule | Reason on violation |
|---|---|---|
| number | an integer `n` with `-9007199254740991 <= n <= 9007199254740991`; the lexical form does not matter (`1.0`, `1e2`, `-0` are `1`, `100`, `0`) | `float_not_allowed` (non-integral, NaN, infinite), `integer_out_of_range` |
| string | Unicode scalar values only, no U+0000 | `invalid_unicode` (lone surrogate), `nul_character` |
| object | string keys satisfying the string rule | `invalid_field_type` |
| nesting | arrays and objects nest at most 64 levels | `json_too_deep` |

Violations carry a `value_path` (RFC 6901 JSON Pointer). Integers only, because
JSON number formatting of non-integral and very large values differs between
Rust, Python and JavaScript. No Unicode normalization and no line-ending
normalization is ever applied: `é` written as U+00E9 and as U+0065 U+0301 are
different prompts with different digests, and CRLF stays two characters.

### Canonical form and digests

The canonical form NCF(v) of an AJS value is the UTF-8 encoding (no BOM) of:

```text
null, true, false   -> null, true, false
integer             -> optional "-" then decimal digits, no leading zero, "0" for zero (never "-0")
string              -> '"' + escaped + '"'
                       escaped: " -> \"   \ -> \\   U+0008 -> \b   U+0009 -> \t   U+000A -> \n
                                U+000C -> \f   U+000D -> \r   other U+0000..U+001F -> \u00xx (lowercase hex)
                                every other character -> itself (U+007F, U+2028, "/" and non-ASCII raw)
array               -> "[" + items joined by "," + "]"
object              -> "{" + members sorted by key, comparing UTF-16 code units (a proper prefix first),
                       each member key + ":" + value, joined by "," + "}"
```

There is no insignificant whitespace. Keys sort by UTF-16 code units, the
order of JavaScript's default sort; a code-point sort differs for keys that mix
astral characters with U+E000 to U+FFFF characters.

Every digest is `"sha256:" + lowercase_hex(sha256(NCF(document)))` over a
document whose top-level `schema` names its type:

| Digest | Document hashed |
|---|---|
| `content_digest` | the `agenomic.prompt_content/v1` object |
| `prompt_manifest_digest` | the `agenomic.prompt_manifest/v1` object |
| `rendered_hash` | the `agenomic.rendered_prompt/v1` object |
| `prompt_bundle_digest` | the `agenomic.prompt_artifact_set/v1` projection of a bundle |

Clients verify the digest of every downloaded artifact before use; a mismatch
is never repaired or ignored, and the artifact is unusable.

### Prompt content (`agenomic.prompt_content/v1`)

The behavior-relevant artifact, hashed whole:

```json
{
  "schema": "agenomic.prompt_content/v1",
  "template_format": "agenomic-fstring/v1",
  "renderer_version": "1",
  "kind": "chat",
  "body": [
    { "role": "system", "content": "You plan support work for locale {locale}.\n{>safety}" },
    { "placeholder": "history", "optional": true },
    { "role": "user", "content": "{question}" }
  ],
  "variables": {
    "history": { "type": "messages", "required": false },
    "locale": { "type": "string", "required": false },
    "question": { "type": "string", "required": true }
  },
  "partials": { "locale": "en" },
  "output_contract": null,
  "fragments": {
    "safety": { "prompt_id": "prm_support_safety", "version": 2, "content_digest": "sha256:..." }
  }
}
```

- `kind` is `text` (body is one template string) or `chat` (body is 1 to 256
  entries, order significant). A chat entry is exactly
  `{ role, content }` with role `system`, `user` or `assistant` and a template
  string, or exactly `{ placeholder, optional }`.
- `variables` declares 0 to 128 variables, each exactly `{ type, required }`
  with type `string`, `integer`, `boolean`, `json` or `messages`.
- `partials` holds AJS scalar defaults; `output_contract` is `null` or exactly
  `{ "type": "json_schema", "json_schema": <AJS object> }`; `fragments` pins up
  to 32 fragment prompts by prompt id, version and content digest.
- A template string holds at most 65 536 code points; the whole content at most
  262 144 NCF bytes.
- Prompt id, version number, author, change message, variable descriptions and
  timestamps are not in the content, so identical content shares a digest.
- A fragment is a prompt whose prompt-level kind is `fragment`; its contents
  have `kind: text`, no partials and no output contract.

### Prompt version (`agenomic.prompt_version/v1`)

The stored and exported form of one immutable version:
`{ schema, workspace_id, prompt_id, version, prompt_kind, content_digest,
content, metadata }`. Only `content` is hashed. `prompt_kind` (`text`, `chat`
or `fragment`) must agree with `content.kind`. `metadata` holds the parent
version, the change message, the author (exactly one of a user id and an API
key id), the creation time, variable descriptions and provenance.

### Prompt manifest (`agenomic.prompt_manifest/v1`)

The prompt pins of one agent version, hashed whole:
`{ schema, agent_id, slots, children }`. `slots` maps up to 256 slot paths to
`{ prompt_id, version, content_digest }`; aliases never appear and fragments
are pinned transitively through each content digest. `children` maps up to 64
child agent ids to `{ release_id, genome_version }`, where `genome_version` is
`null` for a legacy child release. The empty manifest
`{ schema, agent_id, slots: {}, children: {} }` has a well-defined digest: every
execution-side document (bindings, resolved artifacts, bundles) uses it for a
release that has no manifest of its own, so a manifest digest is never `null`
there.

### Rendered prompt (`agenomic.rendered_prompt/v1`)

`{ schema, content_digest, kind, text, messages, history_count }`. For a text
render, `text` is the rendered string and `messages` is `null`. For a chat
render, `text` is `null` and `messages` mirrors the body: a role entry becomes
the rendered `{ role, content }`, a placeholder becomes
`{ placeholder, count }`. `history_count` counts the items appended through the
`history` option. `rendered_hash` is the digest of this document. Placeholder
and history contents are excluded on purpose: they are conversation data, may
hold non-AJS values such as tool-call arguments, and the hash must stay stable
across turns.

### Prompt bundle (`agenomic.prompt_bundle/v1`) and artifact set

A bundle is the exact prompt closure of one agent version, used offline:

```json
{
  "schema": "agenomic.prompt_bundle/v1",
  "workspace_id": "0b6c2f1e-7a44-4c8e-9f1d-2a3b4c5d6e7f",
  "agent_id": "2b1e5c3a-8d4f-4e6a-9b0c-1d2e3f4a5b6c",
  "source": { "channel": "production", "channel_generation": 12 },
  "release": { "release_id": "...", "release_name": "av_0042", "genome_version": "sha256:...", "bundle_id": "...", "bundle_hash": "blake3:...", "legacy": false },
  "prompt_manifest_digest": "sha256:...",
  "manifest": { "schema": "agenomic.prompt_manifest/v1", "...": "..." },
  "children": { "<child agent id>": { "release_id": "...", "genome_version": "sha256:...", "prompt_manifest_digest": "sha256:...", "manifest": {} } },
  "prompts": { "prm_support_planner:7": { "prompt_id": "prm_support_planner", "version": 7, "prompt_kind": "chat", "content_digest": "sha256:...", "content": {} } },
  "prompt_bundle_digest": "sha256:...",
  "governance": { "release_status": "production", "channel": "production", "channel_protected": true, "approved": true },
  "exported_at": "2026-10-04T21:10:00Z",
  "expires_at": "2026-11-03T21:10:00Z",
  "issuer": { "key_id": "orgkey_2026_09", "algorithm": "ed25519" },
  "signature": { "algorithm": "ed25519", "value": "<base64>", "public_key_pem": "-----BEGIN PUBLIC KEY-----\n..." }
}
```

- `prompts` is the exact closure: every slot pin of every manifest in the
  bundle plus every fragment pin, transitively, keyed `prompt_id:version`.
  Entries carry no author identity.
- `prompt_bundle_digest` is the digest of
  `{ "schema": "agenomic.prompt_artifact_set/v1", prompt_manifest_digest,
  manifest, children, prompts }`, the four members copied verbatim. It
  identifies the artifact closure independently of export time and signer.
- The online resolution answer is the same document unsigned: no `governance`,
  `issuer` or `signature`, and `expires_at: null`.
- An exported bundle carries the signed `governance` member (`approved` is true
  when the root release and every pinned child release are approved or in
  production), an `issuer`, a `signature` and a non-null `expires_at` (default
  30 days, at most 365). The signature reuses the release attestation scheme of
  RFC 0008: ed25519 over BLAKE3(NCF(document without `signature`)), with the
  `issuer` block in place before signing.

Load procedure (offline). Failures are client-side integrity errors:

1. The whole document is in AJS, and `schema` is `agenomic.prompt_bundle/v1`.
2. Authenticity: either the signature verifies against a trusted key looked up
   by `issuer.key_id` (an embedded public key is never trusted), or the caller
   pins `expected_bundle_digest` and the recomputed `prompt_bundle_digest`
   equals it. A bundle that is neither signed by a trusted key nor pinned is
   refused (`bundle_untrusted_key`). Pinning only the root manifest digest is
   not enough, because the root manifest pins children by release and genome
   only.
3. Expiry (`bundle_expired`).
4. Every prompt entry passes digest verification (`prompt_digest_mismatch`
   with the ref); the artifact set digest is recomputed
   (`prompt_digest_mismatch` with `document: "artifact_set"`).
5. The root and every child manifest digest (`manifest_digest_mismatch`).
6. Completeness and exactness (`bundle_incomplete` with `missing` or `extra`).
7. Scope: `workspace_id` and `agent_id` equal the expected values, which every
   load API requires (`bundle_scope_mismatch`).
8. Governance, for signed bundles: `approved: false` is refused unless the
   caller opts in (`bundle_ungoverned`). A digest-pinned bundle skips this
   step: the operator's pin is the approval.

After a successful load the bundle is the only source of prompts for that
execution; a missing artifact never falls back to the network or a local
string.

### Execution binding (`agenomic.execution_binding/v1`)

The durable pin of one thread (`scope: thread`) or execution
(`scope: execution`) to an agent version: binding id, workspace, agent,
thread key, release id and name, `genome_version` (or `null` for a legacy
release), `prompt_manifest_digest` (never `null`), the runtime bundle, where
the release was resolved from (a channel and its generation, or an explicit
release id), pinned children, an optional parent binding for counterfactual
forks, an optional experiment trial reference, the runtime client and the
creator. It carries no secret and no prompt text.

### Reference grammar

| Form | Syntax | Contexts |
|---|---|---|
| `prompt_id` | `prm_planner` | management only; in execution it is `prompt_ref_unversioned` (no implicit latest) |
| `version` | `prm_planner:7` | all |
| `alias` | `prm_planner@staging` | all except documents, which carry only `{ prompt_id, version }` pins; resolved once to a version, which is recorded |
| `uri` | `agenomic://<workspace uuid>/prompts/prm_planner/versions/7` | all; a URI naming another workspace is refused (`prompt_ref_cross_workspace`) and never resolved |

Parse algorithm; the first failing check gives the reason, and lengths and
positions count code points:

```text
P1  s is empty                                           -> empty_segment
P2  more than 256 code points                            -> too_long
P3  first character outside U+0021..U+007E:
      U+0009..U+000D or U+0020                           -> whitespace
      anything else                                      -> invalid_character
P4  any character A..Z                                   -> uppercase
P5  "%" anywhere                                         -> percent_encoded_separator
P6  contains "://"                                       -> parse as a URI (U1 to U9)
P7  ":" and "@" both present                             -> mixed_form
    ":" present: split at the first ":"; an empty side   -> empty_segment
                 invalid prompt id                       -> invalid_prompt_id
                 version not ^[1-9][0-9]{0,9}$ or too big -> invalid_version
    "@" present: split at the first "@"; an empty side   -> empty_segment
                 invalid prompt id                       -> invalid_prompt_id
                 invalid alias                           -> invalid_alias
    otherwise an invalid prompt id                       -> invalid_prompt_id
U1  scheme is not "agenomic"                             -> unsupported_scheme
U2  "?" or "#" after the scheme                          -> query_or_fragment
U3  nothing after the scheme                             -> empty_segment
U4  ends with "/"                                        -> trailing_slash
U5  an empty path segment                                -> empty_segment
U6  not <ws>/prompts/<id>/versions/<n>                   -> invalid_uri_path
U7  <ws> is not a lowercase uuid                         -> invalid_workspace
U8  <id> is not a prompt id                              -> invalid_prompt_id
U9  <n> is not a version                                 -> invalid_version
```

After a successful parse, the context check refuses a URI of another workspace
(`prompt_ref_cross_workspace`, 403) and a bare prompt id in an execution
context (`prompt_ref_unversioned`, 400). A server always knows the workspace;
an offline client may not, and then defers the workspace check to the
resolver. Malformed refs are `prompt_ref_invalid` (400) with the reason above.
Formatting is the inverse of parsing (`parse(format(r)) == r`); there is no
case folding, trimming or percent-decoding.

### Template grammar `agenomic-fstring/v1`

```text
template     = { literal_char | "{{" | "}}" | placeholder | include }
placeholder  = "{" name "}"
include      = "{>" name "}"
name         = ( "A".."Z" | "a".."z" | "_" ) { "A".."Z" | "a".."z" | "0".."9" | "_" }   (1 to 64 chars)
literal_char = any Unicode scalar value except "{" and "}"
```

The grammar is a strict subset of Python `str.format`. The tokenizer reads the
template once, left to right, and fails fast. Inside braces it reports, in this
order: `empty_placeholder`, `nested_placeholder`, then for the first
character outside `[A-Za-z0-9_]`: `conversion` (`!`), `format_spec` (`:`),
`attribute_access` (`.`), `index_access` (`[`), `whitespace_in_placeholder`,
otherwise `invalid_placeholder_name`; then `positional_placeholder` (all
digits), `invalid_placeholder_name` (leading digit) and
`placeholder_name_too_long`. Outside braces: `unclosed_brace` and
`unmatched_closing_brace`. An include with a bad name is
`invalid_fragment_name`. Offsets are 0-based code points of the opening brace
(or of the lone `}`), with 1-based `line` and `column` derived from LF only.
Re-serializing the tokens (literal braces doubled) gives back the template.

### Content validation

Rules run in order C1 to C10; the full error list is returned and the first
error decides the reported reason:

| Rule | Checks |
|---|---|
| C1 shape | members, presence, unknown members, AJS, limits |
| C2 chat entries | exact entry shapes, roles, string content (content block lists are refused) |
| C3 syntax | every template string tokenizes |
| C4 fragments | includes are declared; pins are well formed, found, digest-equal, of a text fragment without partials or output contract; depth at most 8, no cycle, at most 256 expansions per content (one counter shared by all template strings), each expanded template at most 1 048 576 code points |
| C5 variable use | every referenced name is declared; `messages` only as placeholders; placeholder variables are `messages`; one placeholder per variable; a variable used in a fragment has the same type in the fragment and the parent; unused variables warn |
| C6 required | `required == !optional` for placeholders; a scalar with a partial is optional; an optional scalar has a partial |
| C7 partials | declared, not `messages`, scalar, of the declared type |
| C8 output contract | shape and size |
| C9 secrets | the `agenomic-secrets/1` patterns over templates, string partials and the output contract; secret-shaped variable names warn |
| C10 version | `prompt_kind` agrees with `content.kind` |

Publish, draft save and import answer 400 `prompt_template_invalid` with the
reason and the error list, or 400 `prompt_secret_detected` (pattern ids and
positions only, never the value) when any secret is found. The conformance
vector README fixes the order inside each rule.

### Renderer (`renderer_version: "1"`)

Options: `strict` (default true: an undeclared input variable is refused),
`history` (default null), `allow_duplicate_system` (default false) and
`secret_policy` (`off` by default; `error` scans string values and the string
leaves of `json` values).

1. Validate the content (C1 to C10).
2. Bind values. Unknown input variables are reported first, in UTF-16 name
   order. Then, for each declared variable in UTF-16 order, the caller value
   wins, else the partial, else `[]` for an optional `messages` variable;
   otherwise `missing_variable`. Each value is checked: a string, an AJS
   integer, a boolean, any AJS value for `json`, a list of message values for
   `messages`. `null` is accepted only by `json`.
3. History composition. History reaches a prompt through exactly one channel:
   a `messages` placeholder, or, for a chat prompt without placeholder, the
   `history` option appended after the template messages. Both together are
   `history_conflict`; `history` on a text prompt is
   `history_not_supported`. A placeholder or history item with role `system`
   whose content equals a rendered system message is
   `duplicate_system_message` unless explicitly allowed.
4. Expand fragments at token level (lexical fragment scope, global variables),
   then substitute once. Substituted values are data and are never scanned
   again.
5. Typed rendering: strings verbatim, integers in decimal, booleans `true` or
   `false`, `json` values as NCF. Message values (role `system`, `user`,
   `assistant` or `tool` and a `content` that is a string, a list or `null`;
   other members such as `tool_calls` pass through) are spliced unchanged.
6. Compute `rendered_hash` over the rendered prompt document.

Every failure is `prompt_render_error` with a machine-readable reason and is
raised before any model call. Errors never contain a variable value. Nothing is
trimmed or normalized, and the renderer never mutates its inputs.

`renderer_version` names these output-defining rules. A change that alters the
output for an input that version `"1"` accepts needs version `"2"`; a renderer
refuses versions it does not implement (`unsupported_renderer_version`), and
old versions keep rendering under their own rules forever.

A LangChain conversion builds a `PromptTemplate` or a `ChatPromptTemplate` of
message templates and `MessagesPlaceholder` entries, with `f-string` format,
from the fully expanded template. It refuses prompts with `integer`,
`boolean` or `json` variables, which LangChain would print differently. For
every other valid content it renders the same text or messages as the
authoritative renderer.

### Secrets (`agenomic-secrets/1`)

`B` is an ASCII word boundary and `WS` is `[\t\n\x0B\x0C\r ]`:

| Pattern id | Pattern |
|---|---|
| `bearer_token` | `B` `bearer` (ASCII case-insensitive) `WS+` `[A-Za-z0-9\-_.=+/]{20,}` |
| `private_key_block` | `-----BEGIN [A-Z ]*PRIVATE KEY-----` |
| `openai_key` | `B` `sk-[A-Za-z0-9\-_]{20,}` |
| `stripe_key` | `B` `[sr]k_(?:live\|test)_[A-Za-z0-9]{16,}` |
| `aws_access_key` | `B` `AKIA[0-9A-Z]{16}` `B` |
| `github_token` | `B` `gh[pousr]_[A-Za-z0-9]{36,}` |
| `huggingface_token` | `B` `hf_[A-Za-z0-9]{20,}` |
| `slack_token` | `B` `xox[baprs]-[A-Za-z0-9\-]{10,}` |
| `google_api_key` | `B` `AIza[0-9A-Za-z\-_]{35}` |
| `jwt` | `B` `eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}` |
| `agenomic_api_key` | `B` `agm_[A-Za-z0-9]{24,}` |

Matching is leftmost-first and non-overlapping per pattern; findings report the
pattern id, the offset and the length in code points, never the matched text.
`scrub(text)` merges overlapping or touching spans across patterns and replaces
each with `[REDACTED:<pattern id>]`, named after the earliest-starting match
(ties go to the earlier pattern in the table). `scrub_json(value)` scrubs
string leaves and replaces the value under a secret-shaped key with
`"[REDACTED]"`.

A key is secret-shaped (`agenomic-secret-keys/1`) when, after lowercasing ASCII
alphanumerics and turning every other character into `_`, one of its
`_`-separated tokens is `secret`, `password`, `passwd`, `token`, `credential`,
`credentials`, `authorization` or `cookie`; or the tokens joined together equal
or end with `apikey`, `secret`, `password`, `passwd`, `token`, `credential`,
`credentials`, `authorization`, `cookie`, `privatekey`, `accesskey` or
`clientsecret`; or the normalized key is `apikey` or ends with `_api_key`,
`_private_key`, `_access_key` or `_client_secret`.

Template text containing a secret is refused at publish, draft save and
import. Runtime values are the application's data: they are scanned only under
`secret_policy: "error"`, which surfaces that persist or forward values on the
application's behalf force on. Adding or changing a pattern requires a new set
id.

### Conformance vectors

`conformance/vectors/prompts/` holds six suites (render R001 to R066,
template T001 to T069, digest D001 to D028, ref F001 to F054, secrets S001 to
S014, and prompts-file-yaml Y001 to Y010, which pins the `agenomic-yaml/1`
profile of YAML authoring files for Python), pinned by a checksummed
`MANIFEST.json` and checked by `scripts/vectors.js`, which recomputes every
digest. Implementations vendor the
directory with a lock file and run every vector that names them. The vector
README defines the file format and the matching rules.

## Alternatives considered

### Hash the version document instead of a nested content object

Hashing the stored version would make the digest depend on the prompt id,
version number, author and timestamps, so identical content published twice
would get two digests and every metadata fix would change behavior identity.
Hashing a nested content object whose `schema` names its type keeps the digest
a pure function of behavior.

### Python f-strings, Jinja2 or Mustache as the template language

Full `str.format` accepts format specs, conversions, attribute and index
access, which render differently across languages. Jinja2 and Mustache are
programming languages with their own escaping (Mustache HTML-escapes values).
The strict subset keeps one meaning per template, maps exactly onto LangChain
f-string templates and can be implemented identically in three languages.

### JSON with floats in prompt documents

Allowing non-integral numbers would make the canonical form depend on each
language's float formatting, which differs (`1e-7` against `1e-07`, `1e21`
against `1e+21`). Integers only (AJS) keep digests portable; a later renderer
version may add a dedicated number formatter.

### A shared core library instead of vectors

One shared library would force every SDK to embed a native dependency.
Independent implementations proven by one set of byte-level vectors keep each
SDK idiomatic and dependency-free, at the cost of maintaining the vectors.

## Open questions

- TypeScript lacks BLAKE3 in its standard library, so it loads bundles by
  digest pinning until a BLAKE3 dependency is accepted.
- Secret-shaped variable names are a warning, not a refusal, because of false
  positives such as `token_count`.
- There is no override for a secret false positive in template text in this
  version.
- The duplicate system message guard is on by default and may surface latent
  application bugs at adoption.
- The numeric limits (65 536 template code points, 262 144 content bytes,
  256 expansions, 256 slots, 4096 bundle prompts) were chosen without
  production data.
- Experiment documents build on these documents; their schemas follow in a
  later revision of v0.4. The discovery report, import plan, prompts file and
  prompt file schemas are part of v0.4 (see Compatibility).
- An import plan computed from a prompts file has no member for the revision
  of the agent's slot declarations, although applying it may rewrite them.
  Servers check that revision as a separate precondition of the apply call; a
  later plan version may carry it, which would change the hashed member set
  that vector D025 pins.
- Only Python consumes the `prompts-file-yaml` vectors. Other implementations
  accept the JSON form of a prompts file until they have a YAML parser that
  works at the event level, which the `agenomic-yaml/1` profile needs to refuse
  aliases, tags and duplicate keys.
- Discovery covers Python sources (`scanner.python_grammar` is required), and
  neither the scanner nor the import rewrites source code: replacing a
  discovered string by a managed reference is left to the developer.
- A declared subagent selected by an explicit release cannot yet be pinned in
  an execution binding: `children[*].source` admits `manifest` and `channel`
  only. Pinning it needs a `release` source.

## Security considerations

- Tamper evidence: every artifact is addressed by a sha256 digest that clients
  recompute before use. The artifact set digest covers child manifests and
  child prompts, so a swapped child prompt is caught even when every unkeyed
  digest inside the file was recomputed (vector D028).
- Authenticity: exported bundles are signed with the release attestation
  scheme of RFC 0008. An embedded public key is never trusted; only keys from
  the caller's trust store or an explicit digest pin authenticate a bundle.
- Freshness: exported bundles always carry an expiry, which bounds availability
  but cannot revoke a bundle on a disconnected runner.
- Governance: the signed `governance` member lets an offline runner refuse an
  unapproved bundle by default.
- Secrets: template text with secret-shaped content is refused, discovery and
  error output never carry matched text, and runtime values are redacted
  wherever they are persisted or forwarded.
- Cross-workspace isolation: a canonical URI naming another workspace is
  refused in every context and never resolved.
- Injection through values: rendering is a single pass, so a value that looks
  like a placeholder or an include is emitted verbatim.

## Compatibility

The change is additive. It adds a new schema directory, `schemas/v0.4/`, with
`prompt-common`, `prompt-content`, `prompt-version`, `prompt-manifest`,
`rendered-prompt`, `prompt-artifact-set`, `prompt-bundle`,
`execution-binding` and `conformance-vector` schemas; the discovery and import
schemas `prompt-discovery-report`, `prompt-import-plan`, `prompts-file` and
`prompt-file`; and a v0.4 `release-attestation` schema. It adds conformance
fixtures for the eleven new artifact kinds and for version 2 attestations, and
the six vector suites. No schema of an earlier version, no other RFC and no
existing fixture changes. Readers of earlier versions ignore the new
documents, but refuse a version 2 attestation (see below). Renderer version `"1"` and the secret pattern set
`agenomic-secrets/1` are frozen by the vectors: any output change requires new
identifiers.

Release attestations keep the RFC 0008 format and signature. The v0.4 schema
accepts `schema_version` 1, unchanged, and 2, which adds the required
`genome_version` and `prompt_manifest_digest` of an agent version linked to a
genome. Validators pick the schema from `schema_version`, since attestations
carry no `spec_version`: 2 selects v0.4, anything else v0.1, so every version 1
attestation validates exactly as before. A verifier that knows only the v0.1
schema refuses a version 2 attestation, whose `schema_version` is not the
constant 1 there, so verifiers adopt v0.4 before an issuer emits version 2.
Releases without a genome keep version 1.

Implementations that vendor the vectors must know the `prompts-file-yaml`
suite, even to skip it by `consumers`, and record the new `MANIFEST.json` hash
in their lock file.

## References

- [RFC 8259, The JavaScript Object Notation (JSON) Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259).
- [RFC 6901, JavaScript Object Notation (JSON) Pointer](https://www.rfc-editor.org/rfc/rfc6901).
- [RFC 3339, Date and Time on the Internet: Timestamps](https://www.rfc-editor.org/rfc/rfc3339).
- [Python format string syntax](https://docs.python.org/3/library/string.html#format-string-syntax).
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12).
- RFC 0002, RFC 0008.
- [`conformance/vectors/prompts/README.md`](../conformance/vectors/prompts/README.md), [`docs/prompts.md`](../docs/prompts.md).
