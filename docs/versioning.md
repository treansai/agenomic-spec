# Versioning policy

## Phases

### v0.x — Experimental

The current phase. Any change is allowed. Breaking changes are
documented in `CHANGELOG.md` and called out in PR descriptions. We
do **not** promise schema stability between v0.x minor versions.

Schemas live under `schemas/v0.1/`. A future v0.2 schema set lives
under `schemas/v0.2/`; the v0.1 directory continues to exist
unmodified, so existing bundles validate forever.

Producers SHOULD treat v0.x as a moving target and pin their
implementations to a specific tag.

### v1.x — Stable, semver

When the spec reaches `v1.0.0` (see "When v1.0 happens" below), it
follows [semver](https://semver.org/spec/v2.0.0.html):

- **MAJOR** — breaking schema changes (e.g. removing a required
  field, narrowing an enum). New schemas live under
  `schemas/vX.0/`.
- **MINOR** — additive schema changes that do not invalidate
  existing valid bundles (e.g. adding a new optional field).
  Schemas remain under the current `vX.Y/` directory; existing
  bundles continue to validate.
- **PATCH** — documentation, RFC editorial fixes, CHANGELOG
  corrections. No schema changes.

## When v1.0 happens

The maintainers commit to v1.0.0 only when:

1. The conformance suite passes for **at least three independent
   implementations**, maintained by **at least two distinct
   organizations**.
2. At least one organization other than the original maintainer has
   contributed a non-trivial RFC that has been Accepted.
3. There has been no breaking schema change in the trailing 90 days.

This is a deliberately conservative gate. v1.0 means the spec is
prepared to live unchanged for a long time.

## Schema directory rules

- A schema directory (e.g. `schemas/v0.1/`) is **immutable** once
  the corresponding tag is published.
- New versions get new directories, never modifications to old
  ones.
- The `$id` of every schema embeds the version
  (`https://agenomic.dev/spec/v0.1/<name>.schema.json`).
- Tooling MAY support multiple versions simultaneously; a bundle's
  `spec_version` selects.

## RFC rules

- Once an RFC is `Accepted`, its substantive content is **frozen**.
- Editorial corrections (typos, broken links) are permitted with a
  `docs(rfc-NNNN):` commit and explicit note in the PR.
- Substantive change requires a **new** RFC that supersedes the
  prior one. The old RFC is updated to set `Status: Superseded`
  and a `Supersedes:` link to the new RFC.

## Tag and release naming

Tags follow the schema version they document:

- `v0.1.0` is the first experimental release of the v0.1 schemas.
- `v0.1.1`, `v0.1.2` are documentation/RFC editorial bumps within
  v0.1.
- `v0.2.0` introduces the next experimental schema directory.
- `v1.0.0` marks the stable freeze.

## What "stable" will mean

When v1.0.0 ships:

- A bundle that validates against `schemas/v1.0/` MUST validate
  against every `v1.x` validator.
- An `attestation` issued under v1.0 MUST verify under any future
  `v1.x` verifier (key directory permitting).
- Adding a `v2.0` schema does not retire v1; v1 keeps working.

## Backward compatibility within a major version

Within `vX.Y`, additive minor changes are introduced via:

- adding optional fields to existing objects whose schemas declare
  `additionalProperties: true`;
- adding new top-level optional fields with conservative defaults.

The RFC introducing the additive change MUST include a fixture
under `conformance/valid/` exercising the new field, and MUST NOT
break existing fixtures.
