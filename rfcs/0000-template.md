# RFC 0000: <title>

| Field        | Value                                          |
|--------------|------------------------------------------------|
| Status       | Draft / Accepted / Rejected / Superseded       |
| Created      | YYYY-MM-DD                                     |
| Author(s)    | Name \<email\>                                 |
| Spec version | v0.1                                           |
| Supersedes   | (link to prior RFC if any, or "—")             |
| Related      | (other RFCs, comma-separated, or "—")          |

## Summary

One paragraph describing what this RFC proposes.

## Motivation

What problem does this solve? Who has it? What goes wrong without it?

## Detailed design

The technical proposal in full. Include:

- Concrete data shapes and field names.
- Worked examples (hex bytes where binary formats are involved).
- Backward and forward compatibility behavior.
- Error and edge cases.

## Alternatives considered

Other approaches and why they were rejected. Be concrete: name the
alternative, list its tradeoffs, explain why this proposal is better
for Agenomic's stated invariants (vendor-neutral, versioned,
reproducible).

## Open questions

What remains undecided. List each as a bullet so reviewers can pick
them up directly.

## Security considerations

Threats this introduces or mitigates. Touch on at minimum:

- Forgery and tamper-evidence.
- Downgrade attacks.
- Replay and freshness.
- Key compromise / rotation impact.
- Privacy / PII exposure.

## Compatibility

Forward and backward compatibility implications. State explicitly:

- Whether existing schemas, RFCs, or bundles need to change.
- Whether the change is additive, breaking, or editorial.
- Whether a new schema directory (`schemas/v0.X/`) is required.

## References

- Links to standards (RFCs, NIST publications, etc.).
- Links to prior art in adjacent ecosystems.
- Links to discussions on the issue tracker.
