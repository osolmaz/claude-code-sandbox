---
title: "Bedrock, Vertex, and proxies"
source: "https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex-proxies"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Configure Claude Code to work with Amazon Bedrock and Google Vertex AI, and connect through proxies."
tags:
  - "clippings"
---

## Model configuration

Claude Code uses the following defaults:

| Provider          | Default Model                                                                    |
| ----------------- | -------------------------------------------------------------------------------- |
| Anthropic Console | `claude-sonnet-4-20250514`                                                       |
| Claude Max        | `claude-opus-4-20250514` or `claude-sonnet-4-20250514` based on Max usage limits |
| Amazon Bedrock    | `claude-3-7-sonnet-20250219`                                                     |
| Google Vertex AI  | `claude-sonnet-4-20250514`                                                       |

The default values can be overridden in several ways based on the following precedence from top to bottom:

- `--model` CLI flag. Applies within the session only.
- `ANTHROPIC_MODEL` environment variable. Applies within the session only.
- User Settings `~/.claude/settings.json`: Persists across sessions.

You can supply a full model name, the alias `sonnet` for the latest Claude Sonnet model for your provider, or the alias `opus` for the latest Claude Opus model for your provider.

See our [model names reference](https://docs.anthropic.com/en/docs/about-claude/models/all-models#model-names) for all available models across different providers.

## Use with third-party APIs

Claude Code requires access to both Claude Sonnet 3.7 and Claude Haiku 3.5 models, regardless of which API provider you use.

### Connect to Amazon Bedrock

```bash
CLAUDE_CODE_USE_BEDROCK=1
```

If you don’t have prompt caching enabled, also set:

```bash
DISABLE_PROMPT_CACHING=1
```

Contact Amazon Bedrock for prompt caching for reduced costs and higher rate limits.

Requires standard AWS SDK credentials (e.g., `~/.aws/credentials` or relevant environment variables like `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). To set up AWS credentials, run:

If you’d like to access Claude Code via proxy, you can use the `ANTHROPIC_BEDROCK_BASE_URL` environment variable:

```bash
ANTHROPIC_BEDROCK_BASE_URL='https://your-proxy-url'
```

If your proxy maintains its own AWS credentials, you can use the `CLAUDE_CODE_SKIP_BEDROCK_AUTH` environment variable to remove Claude Code’s requirement for AWS credentials.

```bash
CLAUDE_CODE_SKIP_BEDROCK_AUTH=1
```

Users will need access to both Claude Sonnet 3.7 and Claude Haiku 3.5 models in their AWS account. If you have a model access role, you may need to request access to these models if they’re not already available. Access to Bedrock in each region is necessary because inference profiles require cross-region capability.

### Connect to Google Vertex AI

If you don’t have prompt caching enabled, also set:

```bash
DISABLE_PROMPT_CACHING=1
```

Claude Code on Vertex AI currently only supports the `us-east5` region. Make sure your project has quota allocated in this specific region.

Users will need access to both Claude Sonnet 3.7 and Claude Haiku 3.5 models in their Vertex AI project.

Requires standard GCP credentials configured through google-auth-library. To set up GCP credentials, run:

If you’d like to access Claude Code via proxy, you can use the `ANTHROPIC_VERTEX_BASE_URL` environment variable:

```bash
ANTHROPIC_VERTEX_BASE_URL='https://your-proxy-url'
```

If your proxy maintains its own GCP credentials, you can use the `CLAUDE_CODE_SKIP_VERTEX_AUTH` environment variable to remove Claude Code’s requirement for GCP credentials.

```bash
CLAUDE_CODE_SKIP_VERTEX_AUTH=1
```

For the best experience, contact Google for heightened rate limits.

## Connect through a proxy

When using Claude Code with an LLM proxy, you can control authentication behavior using the following environment variables and configs. Note that you can mix and match these with Bedrock and Vertex-specific settings.

### Settings

Claude Code supports a number of settings controlled via environment variables to configure usage with Bedrock and Vertex. See [Environment variables](https://docs.anthropic.com/en/docs/claude-code/settings#environment-variables) for a complete reference.

If you prefer to configure via a file instead of environment variables, you can add any of these settings to the `env` object in your [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings#available-settings) files.

You can also configure the `apiKeyHelper` setting, to set a custom shell script to get an API key (invoked once at startup, and cached for the duration of each session, or until `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` elapses).

### LiteLLM

LiteLLM is a third-party proxy service. Anthropic doesn’t endorse, maintain, or audit LiteLLM’s security or functionality. This guide is provided for informational purposes and may become outdated. Use at your own discretion.

This section shows configuration of Claude Code with LiteLLM Proxy Server, a third-party LLM proxy which offers usage and spend tracking, centralized authentication, per-user budgeting, and more.

#### Step 1: Prerequisites

- Claude Code updated to the latest version
- LiteLLM Proxy Server running and network-accessible to Claude Code
- Your LiteLLM proxy key

#### Step 2: Set up proxy authentication

Choose one of these authentication methods:

**Option A: Static proxy key** Set your proxy key as an environment variable:

```bash
ANTHROPIC_AUTH_TOKEN=your-proxy-key
```

**Option B: Dynamic proxy key** If your organization uses rotating keys or dynamic authentication:

1. Do not set the `ANTHROPIC_AUTH_TOKEN` environment variable
2. Author a key helper script to provide authentication tokens
3. Register the script under `apiKeyHelper` configuration in your Claude Code settings
4. Set the token lifetime to enable automatic refresh:
   ```bash
   CLAUDE_CODE_API_KEY_HELPER_TTL_MS=3600000
   ```
   Set this to the lifetime (in milliseconds) of tokens returned by your `apiKeyHelper`.

#### Step 3: Configure your deployment

Choose which Claude deployment you want to use through LiteLLM:

- **Anthropic API**: Direct connection to Anthropic’s API
- **Bedrock**: Amazon Bedrock with Claude models
- **Vertex AI**: Google Cloud Vertex AI with Claude models

##### Option A: Anthropic API through LiteLLM

1. Configure the LiteLLM endpoint:
   ```bash
   ANTHROPIC_BASE_URL=https://litellm-url:4000/anthropic
   ```

##### Option B: Bedrock through LiteLLM

1. Configure Bedrock settings:

##### Option C: Vertex AI through LiteLLM

**Recommended: Proxy-specified credentials**

1. Configure Vertex settings:

**Alternative: Client-specified credentials**

If you prefer to use local GCP credentials:

1. Authenticate with GCP locally:
2. Configure Vertex settings:
3. Update LiteLLM header configuration:
   Ensure your LiteLLM config has `general_settings.litellm_key_header_name` set to `Proxy-Authorization`, since the pass-through GCP token will be located on the `Authorization` header.

#### Step 4. Selecting a model

By default, the models will use those specified in [Model configuration](https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex-proxies#model-configuration).

If you have configured custom model names in LiteLLM, set the aforementioned environment variables to those custom names.

For more detailed information, refer to the [LiteLLM documentation](https://docs.litellm.ai/).
