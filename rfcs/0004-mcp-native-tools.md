# RFC 0004: MCP-Native Tools

| Field        | Value                                                       |
|--------------|-------------------------------------------------------------|
| Status       | Accepted                                                    |
| Created      | 2026-05-01                                                  |
| Author(s)    | Agenomic maintainers \<spec@agenomic.dev\>                |
| Spec version | v0.1                                                        |
| Supersedes   | —                                                           |
| Related      | RFC 0001, RFC 0002, RFC 0003                                |

## Summary

Agenomic treats the **Model Context Protocol (MCP)** as a first-class
tool reference protocol. Bundles MAY also reference `http`, `grpc`, and
`local` tools for cases MCP does not yet cover. This RFC specifies how
tool references are pinned, how their schemas are hashed, how
permissions are scoped, and how human-approval requirements are
declared.

## Motivation

Tool calls are the primary way agents act on the world. Their identity,
schema, and permission scope must be pinned at release time:

- different MCP server versions may expose different tools under the
  same name,
- a server upgrade can silently broaden a tool's input schema (e.g.
  adding a new optional argument that bypasses a guardrail),
- different deployments may grant different permission scopes,
- some tool calls require a human in the loop, and that requirement
  must be declarative and auditable.

The lockfile (`agent.lock.yaml`) is the place to pin these.

## Detailed design

### Tool reference shape

In `agent.lock.yaml`, each tool entry has:

```yaml
- name: get_claim_details
  protocol: mcp
  server: mcp://acme/claims-mcp
  version: 2.4.1
  schema_hash: blake3:9b0a4c…
  permissions:
    - claims.read
  requires_human_approval: false
```

Field semantics:

- **`name`**: the tool name as exposed by the server. Bundled prompts
  and skills reference this name verbatim.
- **`protocol`**: one of `mcp | http | grpc | local`. New protocols
  are added by future RFCs.
- **`server`**: an opaque URI identifying the server. For MCP, the
  scheme is `mcp://`. For `http`/`grpc`, a URL or stable endpoint id.
  For `local`, a binary path or package name.
- **`version`**: the resolved version of the server or local tool.
  Implementations SHOULD treat this as semver; the spec does not
  enforce the format.
- **`schema_hash`**: a BLAKE3 (preferred) or SHA-256 hash of the
  canonical-encoded tool schema retrieved at lock time. See "Schema
  hashing" below.
- **`permissions`**: an explicit allow-list of permission scopes. A
  tool not declared with a permission MUST NOT use it at runtime.
- **`requires_human_approval`**: when `true`, a runtime MUST gate
  every invocation behind a human approval step (see RFC 0008 for how
  approvals appear in attestations).

### Schema hashing

For MCP tools, the schema is the JSON object returned by the server's
`tools/list` reply for that tool: `{ name, description, inputSchema }`.
The canonical encoding for hashing is the **JSON Canonicalization
Scheme** (JCS, RFC 8785). The hash is then BLAKE3 of the canonical
bytes:

```text
schema_hash = "blake3:" || hex( BLAKE3( JCS(tool_schema_json) ) )
```

For `http` tools, the canonical schema is the OpenAPI operation object
for the bound operation.

For `grpc` tools, it is the FileDescriptorProto bytes for the bound
method.

For `local` tools, the canonical schema is implementation-defined but
MUST be a deterministic byte string.

### Why pinning matters

Without `schema_hash`, an MCP server upgrade could silently change a
tool's input schema between releases, and the agent would call it with
parameters that no longer match the producer's intent. By pinning the
hash, runtimes can detect schema drift at startup and refuse to invoke
mismatched tools.

### Permissions

`permissions` is an explicit allow-list. Runtimes MUST enforce that a
tool call's required scopes are a subset of the declared scopes;
otherwise the call MUST fail with a `permission_denied` error and emit
a `policy.violation` event in ATEP (RFC 0003).

The spec does not define a global permission ontology. Producers
choose scope identifiers that suit their domain (e.g. `claims.read`,
`payments.write_under_5000_eur`). Consistency across an organization
is a governance concern, not a spec concern.

### Human approval

`requires_human_approval: true` declares a tool as **gated**. A
conformant runtime MUST:

1. Pause execution at the call site.
2. Surface the request, the agent's reasoning context, and the
   proposed inputs to a human approver.
3. Record the approval (or rejection) as an ATEP event in the
   `governance` stream.
4. Proceed only after an `approved` outcome, or abort otherwise.

Producers SHOULD apply this flag liberally to tools that move money,
publish to customers, or modify production data.

### Forward compatibility

`protocol` is an enum so unknown protocols are rejected by validation.
Adding `webhook`, `grpc-web`, or other protocols is an additive minor
change requiring a new schema directory and an RFC.

## Alternatives considered

### Hash the entire MCP server endpoint state

Rejected. Servers expose many tools; hashing the whole list couples
unrelated tools' lifecycles.

### Use OpenAPI as the universal schema language

Rejected. MCP is the industry-aligned model context protocol with
broad SDK support; coercing MCP schemas into OpenAPI loses fidelity
and adds translation steps. We accept that the spec carries
multiple canonical encodings (one per protocol).

### Require every tool to be MCP

Rejected. v0.1 acknowledges that production stacks include legacy
HTTP/gRPC tools. Permitting `http`/`grpc`/`local` lets teams adopt
Agenomic incrementally without rewriting their integrations.

## Open questions

- Whether to standardize a permission scope grammar (e.g.
  `<resource>.<action>[:<qualifier>]`). Currently free-form.
- Whether to add a `requires_dual_approval` flag at v0.2 for
  high-criticality tools.

## Security considerations

- Failing closed on `schema_hash` mismatch is REQUIRED. Failing open
  reintroduces silent capability expansion.
- The `permissions` array MUST be evaluated at call time, not just at
  lock time, to catch runtime mis-routing.
- `requires_human_approval` is a runtime obligation. The spec defines
  the declarative shape; enforcement is the runtime's responsibility,
  recorded via ATEP for audit.

## Compatibility

This RFC is additive. Adding new `protocol` values requires a new
schema directory.

## References

- [Model Context Protocol](https://spec.modelcontextprotocol.io/) —
  the wire protocol for MCP.
- [RFC 8785 — JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785).
- RFC 0001 — Agent Bundle Format.
