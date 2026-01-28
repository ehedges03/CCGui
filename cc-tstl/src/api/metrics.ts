export interface AnyValue {
    string_value?: string;
    bool_value?: boolean;
    int_value?: number;
    double_value?: number;
    bytes_value?: string;
    array_value?: ArrayValue;
    kvlist_value?: KeyValueList;
}

export interface ArrayValue {
    values: AnyValue[];
}

export interface KeyValueList {
    values: KeyValue[];
}

export interface KeyValue {
    key: string;
    value: AnyValue;
}

export interface Resource {
    attributes?: KeyValue[];
    dropped_attributes_count?: number;
}

export interface InstrumentationScope {
    name?: string;
    version?: string;
    attributes?: KeyValue[];
    dropped_attributes_count?: number;
}

export interface MetricsData {
    resource_metrics: ResourceMetrics[];
}

export interface ResourceMetrics {
    resource?: Resource;
    scope_metrics?: ScopeMetrics[];
    schema_url?: string;
}

export interface ScopeMetrics {
    scope?: InstrumentationScope;
    metrics?: Metric[];
    schema_url?: string;
}

export interface Metric {
    name: string;
    description?: string;
    unit?: string;
    gauge?: Gauge;
    sum?: Sum;
    histogram?: Histogram;
    exponential_histogram?: ExponentialHistogram;
    summary?: Summary;
    metadata?: KeyValue[];
}

export interface Gauge {
    data_points: NumberDataPoint[];
}

export interface Sum {
    data_points: NumberDataPoint[];
    aggregation_temporality: AggregationTemporality;
    is_monotonic?: boolean;
}

export interface Histogram {
    data_points: HistogramDataPoint[];
    aggregation_temporality: AggregationTemporality;
}

export interface ExponentialHistogram {
    data_points: ExponentialHistogramDataPoint[];
    aggregation_temporality: AggregationTemporality;
}

export interface Summary {
    data_points: SummaryDataPoint[];
}

export enum AggregationTemporality {
    AGGREGATION_TEMPORALITY_UNSPECIFIED = 0,
    AGGREGATION_TEMPORALITY_DELTA = 1,
    AGGREGATION_TEMPORALITY_CUMULATIVE = 2,
}

export enum DataPointFlags {
    DATA_POINT_FLAGS_DO_NOT_USE = 0,
    DATA_POINT_FLAGS_NO_RECORDED_VALUE_MASK = 1,
}

export interface NumberDataPoint {
    attributes?: KeyValue[];
    start_time_unix_nano?: number;
    time_unix_nano: number;
    as_double?: number;
    as_int?: number;
    exemplars?: Exemplar[];
    flags?: number;
}

export interface HistogramDataPoint {
    attributes?: KeyValue[];
    start_time_unix_nano?: number;
    time_unix_nano: number;
    count: number;
    sum?: number;
    bucket_counts?: number[];
    explicit_bounds?: number[];
    exemplars?: Exemplar[];
    flags?: number;
    min?: number;
    max?: number;
}

export interface ExponentialHistogramDataPoint {
    attributes?: KeyValue[];
    start_time_unix_nano?: number;
    time_unix_nano: number;
    count: number;
    sum?: number;
    scale: number;
    zero_count: number;
    positive: ExponentialHistogramBuckets;
    negative: ExponentialHistogramBuckets;
    flags?: number;
    exemplars?: Exemplar[];
    min?: number;
    max?: number;
    zero_threshold?: number;
}

export interface ExponentialHistogramBuckets {
    offset: number;
    bucket_counts: number[];
}

export interface SummaryDataPoint {
    attributes?: KeyValue[];
    start_time_unix_nano?: number;
    time_unix_nano: number;
    count: number;
    sum: number;
    quantile_values?: ValueAtQuantile[];
    flags?: number;
}

export interface ValueAtQuantile {
    quantile: number;
    value: number;
}

export interface Exemplar {
    filtered_attributes?: KeyValue[];
    time_unix_nano: number;
    as_double?: number;
    as_int?: number;
    span_id?: string;
    trace_id?: string;
}
