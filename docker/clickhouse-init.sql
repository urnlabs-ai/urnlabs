-- ClickHouse initialization script for analytics platform
-- This script creates the necessary databases and tables for advanced analytics

-- Create analytics database
CREATE DATABASE IF NOT EXISTS analytics;

-- Use analytics database
USE analytics;

-- Performance metrics table (time-series data)
CREATE TABLE IF NOT EXISTS performance_metrics (
    id String,
    timestamp DateTime64(3),
    service String,
    metric_type Enum8('counter' = 1, 'timer' = 2, 'gauge' = 3, 'histogram' = 4),
    value Float64,
    unit String,
    tags Map(String, String),
    INDEX service_idx service TYPE bloom_filter GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- Agent performance metrics table
CREATE TABLE IF NOT EXISTS agent_metrics (
    id String,
    timestamp DateTime64(3),
    service String,
    agent_id String,
    workflow_id Nullable(String),
    success UInt8,
    execution_time_ms UInt32,
    cost_cents UInt32,
    tokens_used Nullable(UInt32),
    tags Map(String, String),
    INDEX agent_idx agent_id TYPE bloom_filter GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (agent_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR;

-- Business metrics table
CREATE TABLE IF NOT EXISTS business_metrics (
    id String,
    timestamp DateTime64(3),
    metric_name String,
    value Float64,
    unit String,
    dimension Map(String, String),
    cost_savings_cents Nullable(UInt64),
    revenue_impact_cents Nullable(Int64),
    INDEX metric_idx metric_name TYPE bloom_filter GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (metric_name, timestamp)
TTL timestamp + INTERVAL 5 YEAR;

-- API request analytics table
CREATE TABLE IF NOT EXISTS api_requests (
    id String,
    timestamp DateTime64(3),
    method Enum8('GET' = 1, 'POST' = 2, 'PUT' = 3, 'DELETE' = 4, 'PATCH' = 5),
    endpoint String,
    status_code UInt16,
    response_time_ms UInt32,
    request_size_bytes UInt32,
    response_size_bytes UInt32,
    user_id Nullable(String),
    ip_address IPv4,
    user_agent String,
    error_message Nullable(String),
    INDEX endpoint_idx endpoint TYPE bloom_filter GRANULARITY 1,
    INDEX status_idx status_code TYPE set(100) GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (endpoint, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- Workflow execution analytics table
CREATE TABLE IF NOT EXISTS workflow_executions (
    id String,
    timestamp DateTime64(3),
    workflow_id String,
    workflow_name String,
    execution_id String,
    status Enum8('pending' = 1, 'running' = 2, 'completed' = 3, 'failed' = 4, 'cancelled' = 5),
    duration_ms Nullable(UInt32),
    agent_count UInt16,
    total_cost_cents UInt32,
    success_rate Float32,
    error_message Nullable(String),
    metadata Map(String, String),
    INDEX workflow_idx workflow_id TYPE bloom_filter GRANULARITY 1,
    INDEX status_idx status TYPE set(10) GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (workflow_id, timestamp)
TTL timestamp + INTERVAL 2 YEAR;

-- User behavior analytics table
CREATE TABLE IF NOT EXISTS user_behavior (
    id String,
    timestamp DateTime64(3),
    user_id String,
    session_id String,
    event_type String,
    page_path String,
    duration_ms UInt32,
    metadata Map(String, String),
    INDEX user_idx user_id TYPE bloom_filter GRANULARITY 1,
    INDEX event_idx event_type TYPE bloom_filter GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, timestamp)
TTL timestamp + INTERVAL 3 YEAR;

-- Error tracking table
CREATE TABLE IF NOT EXISTS error_logs (
    id String,
    timestamp DateTime64(3),
    service String,
    level Enum8('error' = 1, 'warn' = 2, 'info' = 3, 'debug' = 4),
    message String,
    stack_trace Nullable(String),
    request_id Nullable(String),
    user_id Nullable(String),
    metadata Map(String, String),
    INDEX service_idx service TYPE bloom_filter GRANULARITY 1,
    INDEX level_idx level TYPE set(10) GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service, timestamp)
TTL timestamp + INTERVAL 1 YEAR;

-- Resource utilization table
CREATE TABLE IF NOT EXISTS resource_utilization (
    id String,
    timestamp DateTime64(3),
    service String,
    instance_id String,
    cpu_percent Float32,
    memory_percent Float32,
    disk_percent Float32,
    network_in_bytes UInt64,
    network_out_bytes UInt64,
    INDEX service_idx service TYPE bloom_filter GRANULARITY 1,
    INDEX instance_idx instance_id TYPE bloom_filter GRANULARITY 1,
    INDEX timestamp_idx timestamp TYPE minmax GRANULARITY 8192
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service, instance_id, timestamp)
TTL timestamp + INTERVAL 6 MONTH;

-- Materialized views for real-time aggregations

-- Hourly performance metrics aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS performance_metrics_hourly
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (service, metric_type, hour)
AS SELECT
    service,
    metric_type,
    toStartOfHour(timestamp) as hour,
    avgState(value) as avg_value,
    minState(value) as min_value,
    maxState(value) as max_value,
    countState() as count
FROM performance_metrics
GROUP BY service, metric_type, hour;

-- Daily agent performance summary
CREATE MATERIALIZED VIEW IF NOT EXISTS agent_performance_daily
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (agent_id, day)
AS SELECT
    agent_id,
    toDate(timestamp) as day,
    countState() as total_executions,
    sumState(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_executions,
    avgState(execution_time_ms) as avg_execution_time,
    sumState(cost_cents) as total_cost,
    sumState(tokens_used) as total_tokens
FROM agent_metrics
GROUP BY agent_id, day;

-- API endpoint performance summary
CREATE MATERIALIZED VIEW IF NOT EXISTS api_performance_summary
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(hour)
ORDER BY (endpoint, method, hour)
AS SELECT
    endpoint,
    method,
    toStartOfHour(timestamp) as hour,
    countState() as request_count,
    avgState(response_time_ms) as avg_response_time,
    quantileState(0.95)(response_time_ms) as p95_response_time,
    countState() FILTER WHERE status_code >= 400 as error_count,
    avgState(request_size_bytes) as avg_request_size,
    avgState(response_size_bytes) as avg_response_size
FROM api_requests
GROUP BY endpoint, method, hour;

-- Create functions for data analysis

-- Function to calculate ROI
CREATE FUNCTION calculateROI AS (cost_savings, investment) ->
CASE
    WHEN investment > 0 THEN ((cost_savings - investment) / investment) * 100
    ELSE 0
END;

-- Function to calculate success rate
CREATE FUNCTION calculateSuccessRate AS (successful, total) ->
CASE
    WHEN total > 0 THEN (successful / total) * 100
    ELSE 0
END;

-- Function to detect anomalies (simple Z-score based)
CREATE FUNCTION detectAnomaly AS (value, avg_value, std_dev, threshold) ->
CASE
    WHEN std_dev > 0 AND abs(value - avg_value) / std_dev > threshold THEN 1
    ELSE 0
END;