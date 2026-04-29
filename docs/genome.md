# Genome

The genome is the authored specification for an agent release candidate.

## What It Captures

The genome should capture the agent's intended behavior surface:

- identity and version
- purpose, objectives, and non-objectives
- model provider, model identifier, and inference settings
- prompts and operating principles
- MCP-native tool declarations
- approval, data-handling, and tool-use policies
- design-memory and runtime-memory references
- knowledge references
- replay profile and behavior contract reference

## What It Does Not Capture

The genome does not by itself prove what was actually released. It is complemented by the lockfile and attestation.

## Prompt References

Prompt content is part of the agent version. A prompt reference may point to:

- a file path within the bundle
- a content-addressed identifier
- a registry or URN understood by the implementation

If prompt content changes, the bundle version should change.

## MCP Tool Declarations

Each declared tool should record:

- stable tool id
- MCP server reference
- server version
- contract or schema hash
- permission scopes

These are behavioral dependencies, not implementation noise.

## Memory

The genome is where authors declare the memory boundary:

- design memory is versioned content
- runtime memory is schema plus access policy only

This distinction is central to safe packaging and rollback.
