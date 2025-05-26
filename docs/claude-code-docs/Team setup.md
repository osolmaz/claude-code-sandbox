---
title: "Team setup"
source: "https://docs.anthropic.com/en/docs/claude-code/team"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Learn how to onboard your team to Claude Code, including user management, security, and best practices."
tags:
  - "clippings"
---

## User management

Setting up Claude Code requires access to Anthropic models. For teams, you can set up Claude Code access in one of three ways:

- Anthropic API via the Anthropic Console
- Amazon Bedrock
- Google Vertex AI

**To set up Claude Code access for your team via Anthropic API:**

1. Use your existing Anthropic Console account or create a new Anthropic Console account
2. You can add users through either method below:
   - Bulk invite users from within the Console (Console -> Settings -> Members -> Invite)
   - [Set up SSO](https://support.anthropic.com/en/articles/10280258-setting-up-single-sign-on-on-the-api-console)
3. When inviting users, they need one of the following roles:
   - “Claude Code” role means users can only create Claude Code API keys
   - “Developer” role means users can create any kind of API key
4. Each invited user needs to complete these steps:
   - Accept the Console invite
   - [Check system requirements](https://docs.anthropic.com/en/docs/claude-code/getting-started#check-system-requirements)
   - [Install Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview#install-and-authenticate)
   - Login with Console account credentials

**To set up Claude Code access for your team via Bedrock or Vertex:**

1. Follow the [Bedrock docs](https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex-proxies#connect-to-amazon-bedrock) or [Vertex docs](https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex-proxies#connect-to-google-vertex-ai)
2. Distribute the environment variables and instructions for generating cloud credentials to your users. Read more about how to [manage configuration here](https://docs.anthropic.com/en/docs/claude-code/settings#configuration-hierarchy).
3. Users can [install Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview#install-and-authenticate)

## How we approach security

Your code’s security is paramount. Claude Code is built with security at its core. We’ve developed Claude Code, as we develop all of our applications and services, according to the requirements of Anthropic’s comprehensive security program. You can read more about our program and request access to resources (such as our SOC 2 Type 2 report, ISO 27001 certificate, etc.) at [Anthropic Trust Center](https://trust.anthropic.com/).

We’ve designed Claude Code to have strict read-only permissions by default, including reading files in the current working directory, and specific bash commands such as `date`, `pwd`, and `whoami`. As Claude Code requests to perform additional actions (such as to edit files, run tests, and execute bash commands), it will ask users for permission. When Claude Code requests permission, users can approve it just for that instance or allow it to run that command automatically going forward. We support fine-grained permissions so that you’re able to specify exactly what the agent is allowed to do (e.g. run tests, run linter) and what it is not allowed to do (e.g. update cloud infrastructure). These permission settings can be checked into version control and distributed to all developers in your organization, as well as customized by individual developers.

For enterprise deployments of Claude Code, we also support enterprise managed policy settings. These take precedence over user and project settings, allowing system administrators to enforce security policies that users cannot override. [Learn how to configure enterprise managed policy settings](https://docs.anthropic.com/en/docs/claude-code/settings#configuration-hierarchy).

We designed Claude Code to be transparent and secure. For example, we allow the model to suggest `git` commands before executing them, thus giving control to the user to grant or deny permission. This enables users and organizations to configure their own permissions directly rather than trying to monitor all possible workarounds.

Agentic systems are fundamentally different from AI chat experiences since agents are able to call tools that interact with the real world and act for longer periods of time. Agentic systems are non-deterministic and we have a number of built in protections to mitigate risks for users.

1. **Prompt injection** is when model inputs alter model behavior in an undesired way. To reduce the risk of this happening, we’ve added a few in-product mitigations:
   - Tools that make network requests require user approval by default
   - Web fetch uses a separate context window, to avoid injecting potentially malicious prompts into the main context window
   - The first time you run Claude Code in a new codebase, we will prompt you to verify that you trust the code
   - The first time you see new MCP servers (configured via `.mcp.json`), we will prompt you to verify that you trust the servers
   - When we detect a bash command with potential command injection (as a result of prompt injection), we will ask users to manually approve the command even if they have allowlisted it
   - If we cannot reliably match a bash command to an allowlisted permission, we fail closed and prompt users for manual approval
   - When the model generates complex bash commands, we generate natural language descriptions for users, so that they understand what the command does
2. **Prompt fatigue.** We support allowlisting frequently used safe commands per-user, per-codebase, or per-organization. We also let you switch into Accept Edits mode to accept many edits at a time, focusing permission prompts on tools that may have side effects (eg. bash)

Ultimately, Claude Code only has as many permissions as the user who is guiding it, and users are responsible for making sure the proposed code and commands are safe.

**MCP security**

Claude Code allows users to configure Model Control Protocol (MCP) servers. The list of allowed MCP servers is configured in your source code, as part of Claude Code settings engineers check into source control.

We encourage either writing your own MCP servers or using MCP servers from providers that you trust. You are able to configure Claude Code permissions for MCP servers. Anthropic does not manage or audit any MCP servers.

## Data flow and dependencies

![Claude Code data flow diagram](https://mintlify.s3.us-west-1.amazonaws.com/anthropic/images/claude-code-data-flow.png)

Claude Code data flow diagram

Claude Code is installed from [NPM](https://www.npmjs.com/package/@anthropic-ai/claude-code). Claude Code runs locally. In order to interact with the LLM, Claude Code sends data over the network. This data includes all user prompts and model outputs. The data is encrypted in transit via TLS and is not encrypted at rest. Claude Code is compatible with most popular VPNs and LLM proxies.

Claude Code is built on Anthropic’s APIs. For details regarding our API’s security controls, including our API logging procedures, please refer to compliance artifacts offered in the [Anthropic Trust Center](https://trust.anthropic.com/).

Claude Code supports authentication via Claude.ai credentials, Anthropic API credentials, Bedrock Auth, and Vertex Auth. On MacOS, the API keys, OAuth tokens, and other credentials are stored on encrypted macOS Keychain. We also support `apiKeyHelper` to read from an alternative keychain. By default, this helper is called after 5 minutes or on HTTP 401 response; specifying `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` allows for a custom refresh interval.

Claude Code connects from users’ machines to the Statsig service to log operational metrics such as latency, reliability, and usage patterns. This logging does not include any code or file paths. Data is encrypted in transit using TLS and at rest using 256-bit AES encryption. Read more in the [Statsig security documentation](https://www.statsig.com/trust/security). To opt out of Statsig telemetry, set the `DISABLE_TELEMETRY` environment variable.

Claude Code connects from users’ machines to Sentry for operational error logging. The data is encrypted in transit using TLS and at rest using 256-bit AES encryption. Read more in the [Sentry security documentation](https://sentry.io/security/). To opt out of error logging, set the `DISABLE_ERROR_REPORTING` environment variable.

When users run the `/bug` command, a copy of their full conversation history including code is sent to Anthropic. The data is encrypted in transit and at rest. Optionally, a Github issue is created in our public repository. To opt out of bug reporting, set the `DISABLE_BUG_COMMAND` environment variable.

By default, we disable all non-essential traffic (including error reporting, telemetry, and bug reporting functionality) when using Bedrock or Vertex. You can also opt out of all of these at once by setting the `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` environment variable. Here are the full default behaviors:

| Service                            | Anthropic API                                       | Vertex API                                       | Bedrock API                                       |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| **Statsig (Metrics)**              | Default on. `DISABLE_TELEMETRY=1` to disable.       | Default off. `CLAUDE_CODE_USE_VERTEX` must be 1. | Default off. `CLAUDE_CODE_USE_BEDROCK` must be 1. |
| **Sentry (Errors)**                | Default on. `DISABLE_ERROR_REPORTING=1` to disable. | Default off. `CLAUDE_CODE_USE_VERTEX` must be 1. | Default off. `CLAUDE_CODE_USE_BEDROCK` must be 1. |
| **Anthropic API (`/bug` reports)** | Default on. `DISABLE_BUG_COMMAND=1` to disable.     | Default off. `CLAUDE_CODE_USE_VERTEX` must be 1. | Default off. `CLAUDE_CODE_USE_BEDROCK` must be 1. |

All environment variables can be checked into `settings.json` ([read more](https://docs.anthropic.com/en/docs/claude-code/settings#configuration-hierarchy)).

Claude Code stores conversation history locally, in plain text, so that users can resume prior conversations. Conversations are retained for 30 days, and they can delete them earlier by running `rm -r ~/.claude/projects/*/`. The retention period can be customized using the `cleanupPeriodDays` setting; like other settings, you can check this setting into your repository, set it globally so that it applies across all repositories, or manage it for all employees using your enterprise policy. Uninstalling `claude` does not delete history.

## Managing costs

When using Anthropic API, you can limit the total Claude Code workspace spend. To configure, [follow these instructions](https://support.anthropic.com/en/articles/9796807-creating-and-managing-workspaces). Admins can view cost and usage reporting by [following these instructions](https://support.anthropic.com/en/articles/9534590-cost-and-usage-reporting-in-console).

On Bedrock and Vertex, Claude Code does not send metrics from your cloud. In order to get cost metrics, several large enterprises reported using [LiteLLM](https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex-proxies#litellm), which is an open-source tool that helps companies [track spend by key](https://docs.litellm.ai/docs/proxy/virtual_keys#tracking-spend). This project is unaffiliated with Anthropic and we have not audited its security.

For team usage, Claude Code charges by API token consumption. On average, Claude Code costs ~$50-60/developer per month with Sonnet 3.7 though there is large variance depending on how many instances users are running and whether they’re using it in automation.

## Best practices for organizations

1. We strongly recommend investing in documentation so that Claude Code understands your codebase. Many organizations make a `CLAUDE.md` file (which we also refer to as memory) in the root of the repository that contains the system architecture, how to run tests and other common commands, and best practices for contributing to the codebase. This file is typically checked into source control so that all users can benefit from it. [Learn more](https://docs.anthropic.com/en/docs/claude-code/memory).
2. If you have a custom development environment, we find that creating a “one click” way to install Claude Code is key to growing adoption across an organization.
3. Encourage new users to try Claude Code for codebase Q&A, or on smaller bug fixes or feature requests. Ask Claude Code to make a plan. Check Claude’s suggestions and give feedback if it’s off-track. Over time, as users understand this new paradigm better, then they’ll be more effective at letting Claude Code run more agentically.
4. Security teams can configure managed permissions for what Claude Code is and is not allowed to do, which cannot be overwritten by local configuration. [Learn more](https://docs.anthropic.com/en/docs/claude-code/overview#permission-rules).
5. MCP is a great way to give Claude Code more information, such as connecting to ticket management systems or error logs. We recommend that one central team configures MCP servers and checks a `.mcp.json` configuration into the codebase so that all users benefit. [Learn more](https://docs.anthropic.com/en/docs/claude-code/tutorials#set-up-model-context-protocol-mcp).

At Anthropic, we trust Claude Code to power development across every Anthropic codebase. We hope you enjoy using Claude Code as much as we do!

## FAQ

**Q: Does my existing commercial agreement apply?**

Whether you’re using Anthropic’s API directly (1P) or accessing it through AWS Bedrock or Google Vertex (3P), your existing commercial agreement will apply to Claude Code usage, unless we’ve mutually agreed otherwise.

**Q: Does Claude Code train on user content?**

By default, Anthropic does not train generative models using code or prompts that are sent to Claude Code.

If you explicitly opt in to methods to provide us with materials to train on, such as via the [Development Partner Program](https://support.anthropic.com/en/articles/11174108-about-the-development-partner-program), we may use those materials provided to train our models. An organization admin can expressly opt-in to the Development Partner Program for their organization. Note that this program is available only for Anthropic first-party API, and not for Bedrock or Vertex users.

More details can be found in our [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) and [Privacy Policy](https://www.anthropic.com/legal/privacy).

**Q: Can I use a zero data retention key?**

Yes, you can use an API key from a zero data retention organization. When doing so, Claude Code will not retain your chat transcripts on our servers. Users’ local Claude Code clients may store sessions locally for up to 30 days so that users can resume them. This behavior is configurable.

**Q: Where can I learn more about trust and safety at Anthropic?**

You can find more information in the [Anthropic Trust Center](https://trust.anthropic.com/) and [Transparency Hub](https://www.anthropic.com/transparency).

**Q: How can I report security vulnerabilities?**

Anthropic manages our security program through HackerOne. [Use this form to report vulnerabilities](https://hackerone.com/anthropic-vdp/reports/new?type=team&report_type=vulnerability). You can also email us at [security@anthropic.com](https://docs.anthropic.com/en/docs/claude-code/).
