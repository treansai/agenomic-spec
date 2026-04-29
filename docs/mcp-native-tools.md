# MCP-Native Tools

AgentLock treats MCP as the default tool integration model.

## Why MCP

MCP gives implementations a standard way to describe tool contracts and permission boundaries. That matters for versioned agents because tool behavior changes are release changes.

## What To Record

For each tool, a bundle should record:

- MCP server reference
- server version
- schema or contract hash
- transport
- permission scopes

These fields let a verifier tell the difference between:

- the same tool at a different version
- the same server with a changed contract
- the same contract with broader privileges

## Unknown Tools

Most high-trust bundles should set policy so unknown tools are rejected during replay and evaluation. If an implementation supports dynamic tool discovery, that behavior should be explicit and separately governed.

## Server References

The specification does not force one registry model. Implementations may use:

- `mcp://` references
- URNs
- internal registries

What matters is that the reference is stable enough to resolve during validation or replay.
