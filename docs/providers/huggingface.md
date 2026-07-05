# Provider: Hugging Face

How the Agenomic genome and lockfile describe an agent whose model is
served by [Hugging Face](https://huggingface.co/) — either the hosted
Inference API or a dedicated Inference Endpoint.

This is a tutorial companion to
[`schemas/v0.1/genome.schema.json`](../../schemas/v0.1/genome.schema.json)
and
[`schemas/v0.1/agent-lock.schema.json`](../../schemas/v0.1/agent-lock.schema.json).
See the runnable bundle in
[`examples/huggingface-agent/`](../../examples/huggingface-agent/).

## Provider name and aliases

The canonical provider name is **`huggingface`**. Tooling SHOULD accept
the following aliases case-insensitively, treating `-` and `_` as
equivalent:

| Alias          | Notes                          |
|----------------|--------------------------------|
| `huggingface`  | Canonical.                     |
| `hf`           | Short form.                    |
| `hugging_face` | `hugging-face` is equivalent.  |

Artifacts SHOULD be written with the canonical `huggingface`. The schema
does not enumerate provider names (the field is a free string), so the
alias normalization is a producer/runtime concern, not a schema concern.

## Environment variables

Credentials are **never** stored in any artifact. The runtime reads them
from the environment:

| Variable                     | Required | Purpose                                                              |
|------------------------------|----------|---------------------------------------------------------------------|
| `HUGGINGFACE_API_TOKEN`      | yes\*    | Preferred API token.                                                 |
| `HF_TOKEN`                   | yes\*    | Fallback token if `HUGGINGFACE_API_TOKEN` is unset.                  |
| `HUGGINGFACE_ENDPOINT_URL`   | no       | Override the inference endpoint URL (dedicated Inference Endpoint).  |
| `HUGGINGFACE_ORG`            | no       | Organization/namespace for billing or scoping.                      |
| `HUGGINGFACE_DEFAULT_MODEL`  | no       | Default `model_id` when the genome does not pin one.                 |
| `HUGGINGFACE_TIMEOUT_SECONDS`| no       | Request timeout in seconds. Default `30`.                           |

\* Exactly one of `HUGGINGFACE_API_TOKEN` or `HF_TOKEN` must be present;
`HUGGINGFACE_API_TOKEN` wins when both are set.

## Genome `runtime` block

The genome carries the **declared** runtime. The Hugging Face fields are
all optional and additive on top of the required `model_provider` and
`model_id`.

```yaml
runtime:
  model_provider: huggingface
  model_id: mistralai/Mistral-7B-Instruct-v0.3
  task: text-generation        # optional: text-generation | embeddings | classification | …
  revision: main               # optional: branch, tag, or commit
  endpoint_url: https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3
  organization: example-org    # optional: HF org/namespace
  temperature: 0.3
  parameters:                  # optional: provider-specific generation params
    max_new_tokens: 512
    top_p: 0.9
    repetition_penalty: 1.1
```

| Field          | Meaning                                                                                 |
|----------------|-----------------------------------------------------------------------------------------|
| `model_id`     | Hugging Face repo id, e.g. `mistralai/Mistral-7B-Instruct-v0.3`.                         |
| `task`         | Inference task hint for task-aware routing.                                             |
| `revision`     | Repo revision (branch/tag/commit). A moving ref like `main` is pinned in the lockfile.  |
| `endpoint_url` | Dedicated/self-hosted endpoint. MUST NOT contain inline credentials.                    |
| `organization` | HF org/namespace the model is scoped or billed to.                                      |
| `parameters`   | Free-form generation parameters; recorded as a `parameter_hash` in the lockfile.        |

## Lockfile `model` block

The lockfile carries the **pinned** runtime. Beyond the existing
`provider`, `model_id`, `provider_fingerprint`, `temperature`, and
`top_p`, the Hugging Face fields below are added.

```yaml
model:
  provider: huggingface
  model_id: mistralai/Mistral-7B-Instruct-v0.3
  provider_fingerprint: hf_mistral_7b_instruct_v0_3_a1b2c3
  temperature: 0.3
  top_p: 0.9
  revision: main
  resolved_commit: e0bc86c23ce5aae1db576c8cca6f06f1f73af2db
  task: text-generation
  endpoint_ref: https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3
  endpoint_hash: blake3:a1b2c3…
  metadata_hash: blake3:b2c3d4…
  parameter_hash: blake3:c3d4e5…
```

| Field             | Meaning                                                                                          |
|-------------------|--------------------------------------------------------------------------------------------------|
| `revision`        | Requested revision copied from the genome.                                                       |
| `resolved_commit` | Immutable commit SHA the revision pointed to at lock time. Detects upstream model drift.          |
| `task`            | Resolved inference task.                                                                          |
| `endpoint_ref`    | REDACTED endpoint reference, `scheme://host[/path]`. **Never** credentials, query strings, or user-info. |
| `endpoint_hash`   | Hash over the canonicalized endpoint config (host, path, task).                                  |
| `metadata_hash`   | Hash over the provider model metadata snapshot (model card / config) at lock time.               |
| `parameter_hash`  | Hash over the canonicalized resolved generation `parameters`.                                    |

The hash fields use the same algorithm prefix convention as the rest of
the spec: `blake3:` (preferred) or `sha256:` followed by 32–128 hex
chars.

## Security notes

- **Tokens are never stored** in the genome, lockfile, or any other
  bundle artifact. They are supplied at runtime via the environment
  variables above.
- **Endpoint URLs must not contain inline credentials.** Neither
  `runtime.endpoint_url` (genome) nor `model.endpoint_ref` (lockfile)
  may include user-info (`user:pass@`) or token-bearing query strings.
  The lockfile `endpoint_ref` is the REDACTED form: `scheme://host[/path]`
  only.
- `resolved_commit`, `metadata_hash`, and `parameter_hash` let a
  lockfile diff expose silent upstream drift on a moving revision such as
  `main` without ever exposing secrets.
