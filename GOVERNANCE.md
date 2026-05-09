# Governance

> Status of this document: **current as of v0.1**. The model is intentionally
> minimal at this stage and will evolve as the specification stabilizes.

## Goals

Agenomic aims to be a vendor-neutral, multi-stakeholder open standard. The
governance model is calibrated to that goal: light-touch while the spec is
experimental, formal once independent implementations exist.

## Current model: BDFL with a sunset clause

For v0.1 the project follows a Benevolent Dictator For Life (BDFL) model.

- **BDFL:** the original maintainer (currently the Treans AI team) holds
  final decision authority on RFCs, schema changes, and releases.
- **Maintainers:** a small group of trusted contributors with merge rights.
  Maintainers may approve PRs and shepherd RFCs.
- **Contributors:** anyone proposing changes via issues or pull requests.

The BDFL commits to:

1. Documenting every accepted change in an RFC or CHANGELOG entry.
2. Refusing changes that would compromise vendor neutrality, regardless of
   commercial pressure.
3. Stepping back into the role of an ordinary maintainer once the conditions
   for the next governance phase are met (see below).

## Triggers for the next phase

The project will transition to a **Technical Steering Committee (TSC)** model
when **all** of the following hold:

1. The conformance suite passes for **at least three independent
   implementations**, maintained by at least two distinct organizations.
2. The specification reaches `v1.0.0` (semver-stable schemas).
3. At least one organization other than the original maintainer has
   contributed a non-trivial RFC that has been Accepted.

When the triggers are met, the BDFL will publish a TSC charter via a new RFC.
The charter will, at minimum, define:

- TSC membership rules (organizational diversity requirements).
- Decision rules (lazy consensus by default; supermajority for breaking
  changes; unanimous for charter amendments).
- Term length and rotation.
- Conflict-of-interest disclosure.
- A procedure for transferring trademarks, domain names, and signing keys
  to a neutral foundation (Linux Foundation, Apache, OpenSSF, or similar).

## Decision-making while in BDFL mode

- **Editorial fixes** (typos, broken links, formatting): one maintainer
  approval.
- **Documentation, examples, conformance fixtures:** one maintainer approval.
- **Schema changes (additive):** RFC + one maintainer approval + 7-day
  comment window.
- **Schema changes (breaking):** RFC, BDFL approval, 14-day comment window,
  and an accompanying schema directory bump (`schemas/v0.X/`).
- **New RFC accepted:** maintainer approval + BDFL approval + 7-day comment
  window with no blocking objections.
- **Releases (tags):** BDFL only.

## Conflicts of interest

Any maintainer with a material commercial interest in a specific RFC must
disclose it in the PR description. The BDFL will recuse from approving RFCs
where they hold a conflict; in that case the change requires approval from
two unconflicted maintainers.

## Trademarks and the Agenomic name

The "Agenomic" name and any logo are currently held by the original
maintainer. They will be transferred to the foundation chosen at the TSC
transition. Until then, third parties may freely state that an
implementation is "Agenomic-compatible" if it passes the conformance suite,
without seeking permission, but may not imply endorsement by the project.

## Amendments to this document

This document may be amended by an RFC that supersedes it. Amendments
require BDFL approval while in BDFL mode and TSC supermajority once the
TSC is in place.
