# Conformance suite

The conformance suite is the standardization heart of this repository.
Any implementation that claims **Agenomic v0.1 compatibility** for the
artifact shapes defined here must accept every fixture in
`conformance/valid/` and reject every fixture in
`conformance/invalid/` with an error that matches the sibling
`.expected.json` description.

## Layout

```text
conformance/
├── README.md
├── valid/
│   ├── genome/                    minimal.yaml + …
│   ├── agent-lock/
│   ├── behavior-contract/
│   ├── trace-event/
│   ├── replay-report/
│   ├── release-attestation/
│   ├── atep-event/
│   ├── workflow/
│   └── system/
└── invalid/
    ├── genome/                    NAME.yaml + NAME.expected.json
    ├── agent-lock/
    ├── behavior-contract/
    ├── trace-event/
    ├── release-attestation/
    ├── atep-event/
    ├── workflow/
    └── system/
```

The first path component under `valid/` and `invalid/` selects the
schema:

| Directory             | Schema                                      |
|-----------------------|---------------------------------------------|
| `genome/`             | `schemas/v0.1/genome.schema.json` or `schemas/v0.2/genome.schema.json` (see below) |
| `agent-lock/`         | `schemas/v0.1/agent-lock.schema.json`       |
| `behavior-contract/`  | `schemas/v0.1/behavior-contract.schema.json`|
| `trace-event/`        | `schemas/v0.1/trace-event.schema.json`      |
| `replay-report/`      | `schemas/v0.1/replay-report.schema.json`    |
| `release-attestation/`| `schemas/v0.1/release-attestation.schema.json` or `schemas/v0.4/release-attestation.schema.json` (see below) |
| `atep-event/`         | `schemas/v0.1/atep-event.schema.json`       |
| `workflow/`           | `schemas/v0.2/workflow.schema.json`         |
| `system/`             | `schemas/v0.2/system.schema.json`           |
| `prompt-content/`     | `schemas/v0.4/prompt-content.schema.json`   |
| `prompt-version/`     | `schemas/v0.4/prompt-version.schema.json`   |
| `prompt-manifest/`    | `schemas/v0.4/prompt-manifest.schema.json`  |
| `rendered-prompt/`    | `schemas/v0.4/rendered-prompt.schema.json`  |
| `prompt-artifact-set/`| `schemas/v0.4/prompt-artifact-set.schema.json` |
| `prompt-bundle/`      | `schemas/v0.4/prompt-bundle.schema.json`    |
| `execution-binding/`  | `schemas/v0.4/execution-binding.schema.json` |
| `prompt-discovery-report/` | `schemas/v0.4/prompt-discovery-report.schema.json` |
| `prompt-import-plan/` | `schemas/v0.4/prompt-import-plan.schema.json` |
| `prompts-file/`       | `schemas/v0.4/prompts-file.schema.json`     |
| `prompt-file/`        | `schemas/v0.4/prompt-file.schema.json`      |
| `experiment-case/`    | `schemas/v0.4/experiment-case.schema.json`  |
| `experiment-spec/`    | `schemas/v0.4/experiment-spec.schema.json`  |
| `coding-event/`       | `schemas/v0.3/coding-event.schema.json` (RFC 0013) |
| `coding-session/`     | `schemas/v0.3/coding-session.schema.json` (RFC 0013) |
| `coding-capability-manifest/` | `schemas/v0.3/coding-capability-manifest.schema.json` (RFC 0013) |
| `coding-action/`      | `schemas/v0.3/coding-action.schema.json` (RFC 0013) |

For artifact kinds published in more than one schema version, the
fixture's own `spec_version` selects the directory: for `genome`,
`agenomic/v0.2` selects `schemas/v0.2/`, anything else falls back to
the artifact's first published version. v0.2 is an overlay (RFC 0009):
artifact kinds not redefined there keep validating against v0.1.
Release attestations carry no `spec_version`, so `schema_version`
selects instead: 2 selects `schemas/v0.4/`, anything else
`schemas/v0.1/`.

The managed prompt documents of RFC 0012 (`schemas/v0.4/`) are validated
here for shape only. Their semantics (canonical JSON and digests, the prompt
reference grammar, template syntax, rendering and secret detection) are pinned
by the cross-language vectors under `conformance/vectors/prompts/`, which
`scripts/validate.js` does not walk. `scripts/vectors.js`, run by
`npm run validate`, checks them: schema, names, the checksummed
`MANIFEST.json` and every digest. See
[`vectors/prompts/README.md`](vectors/prompts/README.md) for the file format
and the matching rules that every implementation applies.

The coding-session documents of RFC 0013 (`schemas/v0.3/coding-*.schema.json`)
are validated for shape and for the rules their schemas encode:

- every `coding-event` and every `coding-action` names its session in
  `coding_session_id`;
- every `tool.requested`, `tool.started`, `tool.completed` and
  `tool.failed` event carries `attempt_id` (the decimal attempt number)
  and `payload.native_request_id`, and `tool.requested` also carries
  `action_id`;
- a `shadow` `coding-action` decides `defer`, records what `enforce` would
  have returned in `would_have_been` and references no approval;
- a `coding-session`'s `protection.protected` and `protection.not_covered`
  hold unique ids from the coding action `tool_id` vocabulary, and
  `protection.notes` holds at most 32 strings of at most 300 characters.

`coding-session.schema.json` references that vocabulary at
`coding-action.schema.json#/$defs/toolId`, so a validator that loads the
session schema must also load the coding action schema; `scripts/validate.js`
registers it before compiling any v0.3 schema.

The runner asserts `format` keywords through `ajv-formats`, so a v0.4
timestamp must match its pattern and also be a valid `date-time`:
`invalid/prompt-version/impossible-created-at.json` has the timestamp shape but
names February 30.

## `.expected.json` format

Every file under `invalid/` has a sibling `<NAME>.expected.json`
describing why the fixture must fail. The runner accepts a fixture as
"correctly rejected" if the AJV error array contains at least one
error matching **all** of the constraints declared in the
`.expected.json` file.

```json
{
  "description": "human-readable reason this fixture must fail",
  "match": {
    "keyword": "required",
    "instancePath": "",
    "missingProperty": "spec_version"
  }
}
```

`match` keys are matched against AJV's error object fields. Any of
`keyword`, `instancePath`, `schemaPath`, `params.<key>`, or top-level
`message` (substring match) MAY be specified. Constraints under
`params` are matched as substrings against the AJV error's `params`
object.

## Running the suite

```bash
npm ci
npm run validate
```

The script `scripts/validate.sh` validates:

- every YAML file under `examples/` (must pass),
- every YAML file under `conformance/valid/` (must pass),
- every YAML file under `conformance/invalid/` (must fail, and the
  failure must match the sibling `.expected.json`).

Exit status is non-zero on any deviation.

## Adding a fixture

1. Decide whether the fixture demonstrates a valid or invalid pattern.
2. Place it under the right schema sub-directory.
3. For invalid fixtures, write the sibling `.expected.json` describing
   the failure precisely.
4. Run `npm run validate` locally before opening a PR.

The conformance suite is part of the public spec contract. Adding or
modifying a fixture is a substantive change that should be reflected
in the CHANGELOG.
