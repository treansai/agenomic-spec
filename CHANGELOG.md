# Changelog

All notable changes to this specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
once it reaches v1.0. While at v0.x, breaking changes are allowed and are
documented here.

## [Unreleased]

### Added

- **v0.3 (RFC 0012, Draft): coding sessions.** Portable artifacts for
  supervising coding agents (Claude Code, Codex) without replacing their
  loops: `schemas/v0.3/coding-event.schema.json` (closed
  `agenomic.coding.event/v1` envelope with ULID `event_id`, `source` and
  `trust`, per-source `(producer_epoch, producer_seq)` ordering and
  at-least-once deduplication), `coding-session.schema.json` (origin →
  control pairing, `mode_requested`/`mode_effective` with `blocked` and no
  silent downgrade, protection and capture settings),
  `coding-capability-manifest.schema.json` (announced vs validated
  capability states) and `coding-action.schema.json` (closed `coding.*`
  `tool_id` vocabulary, risk, flags, decision and observed outcome).
  Conformance fixtures under
  `conformance/{valid,invalid}/coding-{event,session,capability-manifest,action}/`.

- **v0.4 (RFC 0012): managed prompts.** New schema directory
  `schemas/v0.4/` with `prompt-common`, `prompt-content`, `prompt-version`,
  `prompt-manifest`, `rendered-prompt`, `prompt-artifact-set`,
  `prompt-bundle` (online and signed exported forms, with the signed
  `governance` member, `release.legacy` and a mandatory `expires_at` on
  signed bundles), `execution-binding` and `conformance-vector`. Conformance
  fixtures under `conformance/{valid,invalid}/` for the seven new artifact
  kinds. Cross-language conformance vectors under
  `conformance/vectors/prompts/` (render R001 to R066, template T001 to T069,
  digest D001 to D028, ref F001 to F054, secrets S001 to S014), pinned by a
  checksummed `MANIFEST.json` and checked by the new `scripts/vectors.js`,
  which `npm run validate` runs and which recomputes every digest with
  `node:crypto`. User guide in `docs/prompts.md`.

- **v0.4 (RFC 0012): prompt discovery, import and prompt files.** New
  schemas `prompt-discovery-report` (the static scanner output, which carries
  no source code, no absolute path and no secret), `prompt-import-plan`
  (applied by citing its `plan_digest`; unresolved candidates are always
  listed as `skip`, never as managed), `prompts-file` (the declarative
  registration of a prompt family and its slot mapping) and `prompt-file`
  (the local single-prompt file), with valid and invalid fixtures. New
  conformance suite `prompts-file-yaml` (Y001 to Y010, Python) pinning the
  `agenomic-yaml/1` profile for YAML authoring files. The D025 import plan
  vector is now also validated against its schema.

- **Release attestation version 2.** `schemas/v0.4/release-attestation.schema.json`
  accepts `schema_version` 1, unchanged, and 2, which adds the required
  `genome_version` and `prompt_manifest_digest` of agent versions linked to a
  genome. `scripts/validate.js` validates an attestation whose
  `schema_version` is 2 against v0.4 and every other attestation against
  v0.1, so existing attestations validate exactly as before.

- **Discovery, import and attestation version 2 documentation.**
  `docs/prompts.md` walks through the discovery report and the import plan
  with excerpts of the conformance fixtures (candidate and item ids, actions,
  `summary`, recomputing `plan_digest`, the preconditions of an apply).
  `docs/attestations.md` describes `schema_version: 2` and the checks it adds.
  RFC 0012 lists the discovery, import and attestation schemas under
  Compatibility and records the open questions they leave, and
  `conformance/README.md` maps the new fixture directories.

- **v0.4 (RFC 0012): experiment documents.** New schemas `experiment-case`
  (`agenomic.experiment_case/v1`, one dataset entry of a prompt experiment;
  its `input` and `expected` may hold floats, so case and dataset digests are
  computed by the server only) and `experiment-spec`
  (`agenomic.experiment_spec/v1`, the frozen spec of an experiment: two to six
  arms with exactly one baseline, every number an integer, rates,
  probabilities and margins as decimal strings, so any implementation
  recomputes `spec_digest`). Valid fixtures for an agent input case, a node
  state case and a prompt-only spec, and an invalid spec whose `alpha` is a
  JSON float.

- **RFC 0012, complete text for v0.4.** The Detailed design now condenses
  every v0.4 document: the discovery report, the import plan, prompts files
  and prompt files with the `agenomic-yaml/1` profile, the experiment case and
  frozen spec, and release attestation version 2. The identifier table gains
  the import plan, experiment, dataset and runner ids, the `cand_` candidate
  and item ids and the `arm_` arm keys; the digest table gains
  `discovery_report_digest`, `plan_digest` and `spec_digest`. Open questions
  record the limits of the first implementations: TypeScript loads offline
  bundles only under a bundle digest pin, organization signing keys have no
  revoked state (rotate, then remove the old `key_id` from every trust store),
  and member names are not matched against the secret patterns. Security
  considerations add key compromise, imports and experiments. The RFC stays
  `Draft` until it is accepted under `GOVERNANCE.md`. No schema, fixture or
  vector changed, so `MANIFEST.json` and every vendored vector lock stay
  valid.
- **RFC 0012 bundle scope, prompt kind and timestamp checks.** Bundle load
  vectors D029 and D030 refuse an intact bundle that matches its digest pin
  when the caller expects another workspace or another agent
  (`bundle_scope_mismatch`, offline load step 7), and `scripts/vectors.js`
  checks that every loading vector expects the workspace and agent of its
  bundle. The prompt entries of an artifact set or bundle must have a
  `prompt_kind` that agrees with `content.kind`, and every v0.4 timestamp must
  be a valid `date-time` as well as match its pattern; invalid fixtures cover
  both rules. The new vectors change `MANIFEST.json`, so implementations
  re-vendor the directory, record the new hash in `SPEC_VECTORS.lock` and
  update their vector counts.
- **Hermes Agent runtime artifacts.** Three v0.3 schemas for runtimes
  controlled through the Hermes Agent adapter: `hermes-event`
  (`agenomic.hermes.event/v1`, receiver assigned `source` and `trust`, an
  adapter event is always `declared`), `hermes-profile`
  (`agenomic.hermes.profile/v1`, model admission, delegation limits,
  persistence rules; no secret values) and `hermes-action`
  (`agenomic.hermes.action/v1`, the admitted action contract; decisions are
  distinct from commands). Conformance fixtures cover a plugin claiming
  `observed`, a secret in a profile and a command used as a decision. See
  `docs/hermes.md`.

- **CLI criticality vocabulary.** `agent.criticality` in `genome.yaml` now
  also accepts `low`, `medium`, `high` and `critical`, the values emitted by
  `agm init` and `agm enrich`. The existing `standard`, `sensitive`,
  `regulated_customer_facing` and `life_critical` values are unchanged.

- **Review · Monitor · Protect (RMP) artifacts.** Five new v0.3 schemas for
  the continuous safety loop: `rmp-test-scenario` (structured Review
  scenarios with provenance (`manual`, `generated`, `incident_derived`,
  `monitor_derived`, `protect_derived`, `user_provided`), expected
  outputs/tool calls/intent, forbidden behaviors, policy expectations, and
  evidence/dataset references), `rmp-risk-matrix` (typed risk items with
  likelihood × impact, impact drivers, associated risks, scenario coverage,
  and an agent-type assessment), `rmp-enrichment-proposal` (the
  Monitor/Protect → Review feedback artifact, with the
  `draft → pending_review → approved → rejected/applied` approval
  workflow and mandatory `human_approval_required` gating),
  `rmp-alert` (deduplicated, routed, throttled operator alerts), and
  `rmp-report` (the unified session report with release recommendation,
  ledger proof block, and `blake3:` report hash). Conformance fixtures
  under `conformance/{valid,invalid}/rmp-*`.

- **Hugging Face provider support.** Adds optional Hugging Face fields to
  the genome `runtime` block (`task`, `revision`, `endpoint_url`,
  `organization`, `parameters`) in `schemas/v0.1/genome.schema.json` and
  `schemas/v0.2/genome.schema.json`, and to the agent lockfile `model`
  block (`revision`, `resolved_commit`, `task`, `endpoint_ref`,
  `endpoint_hash`, `metadata_hash`, `parameter_hash`) in
  `schemas/v0.1/agent-lock.schema.json`. All fields are optional; provider
  names remain a free string. New example bundle
  `examples/huggingface-agent/`, conformance fixtures
  `conformance/valid/{genome,agent-lock}/huggingface.yaml`, and provider
  reference `docs/providers/huggingface.md` (provider name `huggingface`
  with aliases `hf`/`hugging_face`, env vars `HUGGINGFACE_API_TOKEN` /
  `HF_TOKEN`, security notes: tokens are never stored in artifacts and
  endpoint references are REDACTED `scheme://host[/path]`).
- **v0.3: online tracking.** Adds `schemas/v0.3/tracking-session.schema.json`, `schemas/v0.3/tracking-event.schema.json`, and `schemas/v0.3/tracking-report.schema.json` for real-time monitoring of production agents (drift, loops, intent shifts, runtime-harness / policy / behavior-contract violations). Tracking events are a production-time projection of the canonical run trace (RFC 0010) and ATEP (RFC 0003) event models: same dotted vocabulary, `sequence_number`, `parent_event_id`, content `*_hash` fields, a `prev_event_hash`/`event_hash` hash-link, and an optional detached signature. The tracking report is the tracking analogue of the replay report, content-addressed with a `report_hash`. See `docs/online-tracking.md`. Conformance fixtures under `conformance/{valid,invalid}/tracking-{session,event,report}/`.
- **v0.3 (RFC 0011): behavioral contracts / policy DSL.** Adds `schemas/v0.3/policy.schema.json` encoding an ABC contract `C=(P,I,G,R)`: `policy_id`, `type`, `scope`, `rules[]` with `modality ∈ {forbidden, obligation, permission, temporal_invariant}` and ABC `aspect ∈ {precondition, invariant, guarantee}`, `when`/`then` predicates, a past-time PLTL `formula`, an `enforce` action, a `recovery` block (R), and `(p,δ,k)` `satisfaction` with drift parameters `α,γ` (`D*=α/γ`). Conformance fixtures under `conformance/{valid,invalid}/policy/`.
- **v0.3 (RFC 0010): canonical run traces.** Adds intra-run event hash chaining, causal execution graph, evidence package, event registry, replay taxonomy, conformance fixtures, and a trace-chain verifier.

- **v0.2 (RFC 0009): workflows and multi-agent systems.** New schema
  overlay directory `schemas/v0.2/` with:
  - `workflow.schema.json`: declarative workflows: agent/tool/human/
    wait/sub-workflow/loop steps, `depends_on` DAG, `when` guards,
    retries, timeouts, signals, triggers, escalation rules;
  - `system.schema.json`: multi-agent systems: member roles with
    autonomy envelopes, orchestration styles (pipeline, graph,
    supervisor, swarm, custom) with engine hints, shared state, signals,
    owned workflows, communication guardrails, escalation rules,
    `forbidden_autonomy`;
  - `genome.schema.json` (v0.2): v0.1 genome plus optional `triggers`,
    `autonomy`, `guardrails`, `escalation_rules`, and `collaboration`.
- RFC 0009 (Draft): Workflows and Multi-Agent Systems.
- Example bundles `claims-orchestra` (multi-agent system) and
  `guest-claims-pipeline` (staged LLM workflow).
- Conformance fixtures for `workflow`, `system`, and the v0.2 genome;
  the runner now selects the schema directory from each document's
  `spec_version`.
- `docs/orchestration.md` tutorial.
- Initial public scaffolding of the Agenomic specification.
- JSON Schemas (Draft 2020-12) for `genome`, `agenomic`, `behavior-contract`,
  `trace-event`, `replay-report`, `release-attestation`, and `atep-event` under
  `schemas/v0.1/`.
- RFCs 0001 through 0008 covering bundle format, canonical Merkle hashing,
  the Agentic Trajectory Event Protocol (ATEP), MCP-native tool references,
  statistical vs deterministic replay, the design/runtime memory split,
  rollback safety, and release attestations.
- Synthetic example agent bundles: `claims-agent`, `support-agent`,
  `trading-risk-agent`.
- Conformance suite under `conformance/` with positive and negative fixtures.
- `scripts/validate.sh` and `scripts/lint-rfcs.sh` enforcement.
- GitHub Actions CI workflow.
- Documentation tutorials under `docs/`.
