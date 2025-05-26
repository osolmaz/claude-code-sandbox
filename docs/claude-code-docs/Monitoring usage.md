---
title: "Monitoring usage"
source: "https://docs.anthropic.com/en/docs/claude-code/monitoring-usage"
author:
  - "[[Anthropic]]"
published:
created: 2025-05-25
description: "Monitor Claude Code usage with OpenTelemetry metrics"
tags:
  - "clippings"
---

OpenTelemetry support is currently in beta and details are subject to change.

## OpenTelemetry in Claude Code

Claude Code supports OpenTelemetry (OTel) metrics for monitoring and observability. This document explains how to enable and configure OTel for Claude Code.

All metrics are time series data exported via OpenTelemetry’s standard metrics protocol. It is the user’s responsibility to ensure their metrics backend is properly configured and that the aggregation granularity meets their monitoring requirements.

## Quick Start

Configure OpenTelemetry using environment variables:

The default export interval is 10 minutes. During setup, you may want to use a shorter interval for debugging purposes. Remember to reset this for production use.

For full configuration options, see the [OpenTelemetry specification](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/exporter.md#configuration-options).

## Administrator Configuration

Administrators can configure OpenTelemetry settings for all users through the managed settings file. This allows for centralized control of telemetry settings across an organization. See the [configuration hierarchy](https://docs.anthropic.com/en/docs/claude-code/settings#configuration-hierarchy) for more information about how settings are applied.

The managed settings file is located at:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux: `/etc/claude-code/managed-settings.json`

Example managed settings configuration:

Managed settings can be distributed via MDM (Mobile Device Management) or other device management solutions. Environment variables defined in the managed settings file have high precedence and cannot be overridden by users.

## Configuration Details

### Common Configuration Variables

| Environment Variable                            | Description                                      | Example Values                       |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| `CLAUDE_CODE_ENABLE_TELEMETRY`                  | Enables telemetry collection (required)          | `1`                                  |
| `OTEL_METRICS_EXPORTER`                         | Exporter type(s) to use (comma-separated)        | `console`, `otlp`, `prometheus`      |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                   | Protocol for OTLP exporter                       | `grpc`, `http/json`, `http/protobuf` |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                   | OTLP collector endpoint                          | `http://localhost:4317`              |
| `OTEL_EXPORTER_OTLP_HEADERS`                    | Authentication headers for OTLP                  | `Authorization=Bearer token`         |
| `OTEL_EXPORTER_OTLP_METRICS_CLIENT_KEY`         | Client key for mTLS authentication               | Path to client key file              |
| `OTEL_EXPORTER_OTLP_METRICS_CLIENT_CERTIFICATE` | Client certificate for mTLS authentication       | Path to client cert file             |
| `OTEL_METRIC_EXPORT_INTERVAL`                   | Export interval in milliseconds (default: 10000) | `5000`, `60000`                      |

### Metrics Cardinality Control

The following environment variables control which attributes are included in metrics to manage cardinality:

| Environment Variable                | Description                                    | Default Value | Example to Disable |
| ----------------------------------- | ---------------------------------------------- | ------------- | ------------------ |
| `OTEL_METRICS_INCLUDE_SESSION_ID`   | Include session.id attribute in metrics        | `true`        | `false`            |
| `OTEL_METRICS_INCLUDE_VERSION`      | Include app.version attribute in metrics       | `false`       | `true`             |
| `OTEL_METRICS_INCLUDE_ACCOUNT_UUID` | Include user.account_uuid attribute in metrics | `true`        | `false`            |

These variables help control the cardinality of metrics, which affects storage requirements and query performance in your metrics backend. Lower cardinality generally means better performance and lower storage costs but less granular data for analysis.

### Example Configurations

## Available Metrics

Claude Code exports the following metrics:

| Metric Name                       | Description                     | Unit   |
| --------------------------------- | ------------------------------- | ------ |
| `claude_code.session.count`       | Count of CLI sessions started   | count  |
| `claude_code.lines_of_code.count` | Count of lines of code modified | count  |
| `claude_code.pull_request.count`  | Number of pull requests created | count  |
| `claude_code.commit.count`        | Number of git commits created   | count  |
| `claude_code.cost.usage`          | Cost of the Claude Code session | USD    |
| `claude_code.token.usage`         | Number of tokens used           | tokens |

### Metric Details

All metrics share these standard attributes:

- `session.id`: Unique session identifier (controlled by `OTEL_METRICS_INCLUDE_SESSION_ID`)
- `app.version`: Current Claude Code version (controlled by `OTEL_METRICS_INCLUDE_VERSION`)
- `organization.id`: Organization UUID (when authenticated)
- `user.account_uuid`: Account UUID (when authenticated, controlled by `OTEL_METRICS_INCLUDE_ACCOUNT_UUID`)

#### 1\. Session Counter

Emitted at the start of each session.

#### 2\. Lines of Code Counter

Emitted when code is added or removed.

- Additional attribute: `type` (`"added"` or `"removed"`)

#### 3\. Pull Request Counter

Emitted when creating pull requests via Claude Code.

#### 4\. Commit Counter

Emitted when creating git commits via Claude Code.

#### 5\. Cost Counter

Emitted after each API request.

- Additional attribute: `model`

#### 6\. Token Counter

Emitted after each API request.

- Additional attributes: `type` (`"input"`, `"output"`, `"cacheRead"`, `"cacheCreation"`) and `model`

## Interpreting Metrics Data

These metrics provide insights into usage patterns, productivity, and costs:

### Usage Monitoring

| Metric                                                        | Analysis Opportunity                                      |
| ------------------------------------------------------------- | --------------------------------------------------------- |
| `claude_code.token.usage`                                     | Break down by `type` (input/output), user, team, or model |
| `claude_code.session.count`                                   | Track adoption and engagement over time                   |
| `claude_code.lines_of_code.count`                             | Measure productivity by tracking code additions/removals  |
| `claude_code.commit.count` & `claude_code.pull_request.count` | Understand impact on development workflows                |

### Cost Monitoring

The `claude_code.cost.usage` metric helps with:

- Tracking usage trends across teams or individuals
- Identifying high-usage sessions for optimization

Cost metrics are approximations. For official billing data, refer to your API provider (Anthropic Console, AWS Bedrock, or Google Cloud Vertex).

### Alerting and Segmentation

Common alerts to consider:

- Cost spikes
- Unusual token consumption
- High session volume from specific users

All metrics can be segmented by `user.account_uuid`, `organization.id`, `session.id`, `model`, and `app.version`.

## Backend Considerations

| Backend Type                                 | Best For                                   |
| -------------------------------------------- | ------------------------------------------ |
| Time series databases (Prometheus)           | Rate calculations, aggregated metrics      |
| Columnar stores (ClickHouse)                 | Complex queries, unique user analysis      |
| Observability platforms (Honeycomb, Datadog) | Advanced querying, visualization, alerting |

For DAU/WAU/MAU metrics, choose backends that support efficient unique value queries.

## Service Information

All metrics are exported with:

- Service Name: `claude-code`
- Service Version: Current Claude Code version
- Meter Name: `com.anthropic.claude_code`

## Security Considerations

- Telemetry is opt-in and requires explicit configuration
- Sensitive information like API keys or file contents are never included in metrics
