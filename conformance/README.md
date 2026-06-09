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
| `release-attestation/`| `schemas/v0.1/release-attestation.schema.json` |
| `atep-event/`         | `schemas/v0.1/atep-event.schema.json`       |
| `workflow/`           | `schemas/v0.2/workflow.schema.json`         |
| `system/`             | `schemas/v0.2/system.schema.json`           |

For artifact kinds published in more than one schema version (currently
only `genome`), the fixture's own `spec_version` selects the directory:
`agenomic/v0.2` selects `schemas/v0.2/`, anything else falls back to
the artifact's first published version. v0.2 is an overlay (RFC 0009):
artifact kinds not redefined there keep validating against v0.1.

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
