# Security Policy

## Scope

This repository contains the AgentLock specification: schemas, RFCs,
documentation, examples, and a conformance suite. It contains **no
runtime code**.

Security-relevant issues in this repository typically fall into one of
these categories:

1. **Specification flaws** — a clause in an RFC or schema permits an unsafe
   construction, allows a forgery, or enables a downgrade attack.
2. **Conformance suite gaps** — a fixture incorrectly accepts a malformed
   bundle, or fails to flag a known unsafe pattern.
3. **Example bundle leaks** — an example accidentally contains real
   credentials, real PII, or hashes derived from non-public material.
4. **Supply-chain concerns** in the tooling devDependencies declared in
   `package.json`.

If you believe you have found a runtime vulnerability in a specific
**implementation** of AgentLock, please report it to the maintainers of
that implementation, not here.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security reports.

Email: `security@agentlock.dev` *(placeholder address — to be replaced
before v1.0; until then, send a private security advisory via GitHub:
`https://github.com/treansai/agentlock-spec/security/advisories/new`).*

Include, where possible:

- A description of the issue and the affected file(s) or RFC section.
- A minimal reproduction (e.g. a JSON document that exhibits the flaw).
- The impact you believe it has (forgery, downgrade, replay-bypass, etc.).
- Whether you wish to be credited in the disclosure.

## Triage timeline

- **Acknowledgement:** within 5 business days.
- **Initial assessment:** within 14 calendar days.
- **Public disclosure:** coordinated with the reporter; default 90 days
  from acknowledgement.

## Scope of fixes

For specification flaws, the fix is typically a new RFC that supersedes
the affected one, plus a `schemas/v0.X+1/` bump if the change is breaking.
The CHANGELOG will record the security-relevant nature of the change.

For example or fixture issues, fixes are merged via pull request with a
`fix(security):` Conventional Commit prefix.

## Out of scope

- Vulnerabilities in third-party MCP servers, models, or runtimes
  referenced by example bundles.
- Theoretical attacks against cryptographic primitives (BLAKE3, Ed25519)
  in the abstract — please report those upstream.
- Issues in implementations not maintained by this repository.

## Hall of fame

Acknowledged researchers will be listed here once the project receives
its first valid disclosure.
