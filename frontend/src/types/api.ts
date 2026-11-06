/**
 * TypeScript interfaces strictly mirroring backend FastAPI Pydantic response models.
 * Reference: backend/app/schemas/{overview, accuracy, data_health}.py
 */

export interface EvaluationPeriodInfo {
  decision_start_date: string; // YYYY-MM-DD
  decision_end_date: string;
  delivery_start_date: string;
  delivery_end_date: string;
  decision_cutoff: string; // e.g. "09:00 Europe/London"
  total_evaluation_hours: number;
}

export interface AccuracyKpis {
  valid_comparisons: number;
  forecast_coverage_pct: number;
  actual_completeness_pct: number;
  mae_mw: number;
  rmse_mw: number;
  mape_pct: number;
  mape_denominator: number;
  forecast_bias_mw: number;
  overforecast_hours: number;
  underforecast_hours: number;
  zero_error_hours: number;
  avg_forecast_mw?: number | null;
  avg_actual_mw?: number | null;
}

export interface DatasetHealthInfo {
  raw_windfor_records: number;
  raw_fuelhh_readings: number;
  last_successful_ingestion_utc?: string | null;
}

export interface OverviewResponse {
  platform: string;
  version: string;
  evaluation_period: EvaluationPeriodInfo;
  accuracy_kpis: AccuracyKpis;
  dataset_health: DatasetHealthInfo;
  configuration_version: number;
  metric_version: string;
}

export interface AccuracyDateRange {
  delivery_date_from: string;
  delivery_date_to: string;
  total_calendar_days: number;
  total_hours: number;
}

export interface AccuracySummaryMetrics {
  valid_comparisons: number;
  missing_forecast_hours: number;
  missing_actual_hours: number;
  forecast_coverage_pct: number;
  actual_completeness_pct: number;
  mae_mw: number;
  rmse_mw: number;
  mape_pct: number;
  forecast_bias_mw: number;
  overforecast_count: number;
  underforecast_count: number;
  zero_error_count: number;
  mape_denominator: number;
  mape_excluded_count: number;
  mape_exclusion_reasons: string[];
  avg_forecast_mw?: number | null;
  avg_actual_mw?: number | null;
}

export interface AccuracySummaryResponse {
  date_range: AccuracyDateRange;
  metrics: AccuracySummaryMetrics;
}

export interface DailyAccuracyItem {
  delivery_date: string;
  decision_date: string;
  total_hours: number;
  valid_hours: number;
  forecast_coverage_pct: number;
  actual_completeness_pct: number;
  mae_mw: number;
  rmse_mw: number;
  mape_pct: number;
  mape_denominator: number;
  bias_mw: number;
  overforecast_hours: number;
  underforecast_hours: number;
  zero_error_hours: number;
  avg_forecast_mw?: number | null;
  avg_actual_mw?: number | null;
}

export interface DayExtremum {
  delivery_date: string;
  value: number;
}

export interface DailyAccuracySummary {
  total_days: number;
  best_day_mae?: DayExtremum | null;
  worst_day_mae?: DayExtremum | null;
  best_day_mape?: DayExtremum | null;
  worst_day_mape?: DayExtremum | null;
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface DailyAccuracyResponse {
  items: DailyAccuracyItem[];
  summary: DailyAccuracySummary;
  pagination?: PaginationMeta | null;
}

export interface DatasetHealthDetail {
  latest_successful_ingestion_utc?: string | null;
  latest_ingestion_status?: string | null;
  total_records: number;
  records_fetched: number;
  records_inserted: number;
  records_already_present: number;
  records_rejected: number;
}

export interface SchedulerJobDetail {
  job_id: string;
  status: string;
  last_run_utc?: string | null;
  last_successful_run_utc?: string | null;
  next_run_utc?: string | null;
  last_duration_seconds?: number | null;
  consecutive_failures: number;
  records_fetched: number;
  records_inserted: number;
  records_already_present: number;
  records_rejected: number;
  last_error?: string | null;
}

export interface SchedulerHealthDetail {
  status: string;
  is_leader: boolean;
  enabled: boolean;
  jobs: Record<string, SchedulerJobDetail>;
}

export interface PublicationCycleHealth {
  total_publication_cycles_observed: number;
  average_cycles_per_day: number;
  min_cycles_per_day: number;
  max_cycles_per_day: number;
}

export interface DataHealthSummary {
  total_delivery_hours_evaluated: number;
  missing_actual_hours: number;
  missing_forecast_hours: number;
  incomplete_hourly_actual_pairs: number;
  half_hourly_spacing_violations: number;
  null_generation_readings: number;
  duplicate_keys_detected: number;
  expected_delivery_hours?: number;
  available_delivery_hours?: number;
  evaluation_coverage_pct?: number;
  is_fully_evaluated?: boolean;
}

export interface QualityEventItem {
  id: number;
  dataset: string;
  event_type: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  description: string;
  affected_timestamp?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface DataHealthResponse {
  health_status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  data_integrity_score: number;
  summary: DataHealthSummary;
  datasets?: Record<string, DatasetHealthDetail>;
  publication_cycle_health: PublicationCycleHealth;
  quality_events_by_severity?: Record<string, number>;
  recent_quality_events: QualityEventItem[];
  scheduler?: SchedulerHealthDetail;
}

export interface ApiHealthResponse {
  status: string;
  timestamp: string;
  environment?: string;
  database?: string;
  version?: string;
}

export interface HalfHourReadingTrace {
  settlement_period: number; // 1..50
  start_time_utc: string;    // ISO timestamp (UTC)
  generation_mw: number;     // FUELHH metered generation (MW)
}

export interface TraceabilityDetail {
  selected_forecast_id: number;
  hourly_actual_id: number;
  half_hour_readings: HalfHourReadingTrace[];
}

export type ComparisonStatus = "VALID" | "MISSING_FORECAST" | "MISSING_ACTUAL";

export interface HourlyAccuracyItem {
  delivery_date: string;              // YYYY-MM-DD
  delivery_hour_utc: string;          // ISO timestamp: e.g. "2026-01-28T12:00:00Z"
  hour_of_day: number;                // 0..23 in Europe/London local time
  decision_date: string;              // YYYY-MM-DD
  decision_cutoff_utc: string;        // ISO timestamp
  selected_publish_time_utc: string | null;
  forecast_generation_mw: number | null;
  actual_generation_mw: number | null;
  forecast_error_mw: number | null;   // Signed: Forecast - Actual
  absolute_error_mw: number | null;   // |Forecast - Actual|
  absolute_percentage_error: number | null; // APE (%) or null if Actual <= 0
  comparison_status: ComparisonStatus;
  traceability: TraceabilityDetail | null;
}

export interface HourOfDayAggregate {
  hour_of_day: number;              // 0..23 in Europe/London local time
  comparison_count: number;         // Count of evaluations in diurnal slot
  mae_mw: number | null;            // Mean Absolute Error for this hour
  rmse_mw: number | null;           // Root Mean Squared Error for this hour
  mape_pct: number | null;          // Mean Absolute Percentage Error (%)
  mape_denominator: number;         // Evaluations with Actual > 0
  bias_mw: number | null;           // Mean signed error (+/- MW)
  avg_forecast_mw: number | null;   // Average forecast MW for this hour
  avg_actual_mw: number | null;     // Average actual MW for this hour
  overforecast_count: number;
  underforecast_count: number;
}

export interface HourlyAccuracyResponse {
  items: HourlyAccuracyItem[];
  pagination: PaginationMeta;
  hour_of_day_summary: HourOfDayAggregate[];
}

export interface HourlyAccuracyQueryParams {
  delivery_date?: string;
  delivery_date_from?: string;
  delivery_date_to?: string;
  hour_of_day?: number;
  status?: string;
  view?: "series" | "hour_of_day";
  sort_by?: "delivery_hour_utc" | "absolute_error_mw" | "signed_error_mw" | "forecast_generation_mw" | "actual_generation_mw";
  order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}

export interface QuantileMetrics {
  p50: number; // Median absolute error
  p75: number;
  p90: number;
  p95: number;
  validCount: number;
  maxError: number;
  minError: number;
  threshold1000Count: number;
  threshold1000Pct: number;
  threshold2000Count: number;
  threshold2000Pct: number;
  threshold3000Count: number;
  threshold3000Pct: number;
}

export interface HistogramBin {
  binLabel: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
  isUnderflow?: boolean;
  isOverflow?: boolean;
}

// =========================================================================
// Phase 3.3 Forecast Explorer Types
// =========================================================================

export interface PublicationVersion {
  id?: number | null;
  publish_time_utc: string;
  lead_time_hours?: number | null;
  forecast_mw: number;
  revision_mw?: number | null;
  is_eligible: boolean;
  is_selected?: boolean | null;
}

export interface SingleDeliveryHourPublicationResponse {
  delivery_hour_utc: string;
  delivery_date_london: string;
  hour_of_day_london: number;
  decision_cutoff_utc: string;
  selected_forecast_id?: number | null;
  selected_publish_time_utc?: string | null;
  actual_generation_mw?: number | null;
  actual_data_status: string;
  settlement_readings: HalfHourReadingTrace[];
  total_publications: number;
  forward_publications: number;
  eligible_publications: number;
  publications: PublicationVersion[];
}

export type HorizonMode = "matched" | "publication_weighted" | "unmatched_representative";

export interface HorizonBucketStats {
  horizon_bucket: string;
  lead_time_min_hours: number;
  lead_time_max_hours: number;
  boundary_semantics: string;
  target_lead_time_hours?: number | null;
  avg_actual_lead_time_hours: number;
  observation_count: number;
  unique_delivery_hours: number;
  hour_coverage_pct: number;
  mae_mw: number;
  rmse_mw: number;
  bias_mw: number;
  mape_pct?: number | null;
}

export interface MultiHorizonResponse {
  delivery_date_from: string;
  delivery_date_to: string;
  analysis_mode: HorizonMode;
  total_delivery_hours_in_period: number;
  evaluated_delivery_hours: number;
  common_matched_hours?: number | null;
  overall_coverage_pct: number;
  proven_convergence_improvement_pct?: number | null;
  buckets: HorizonBucketStats[];
}

export interface ExtremeRevisionItem {
  raw_forecast_id: number;
  delivery_hour_utc: string;
  delivery_date_london: string;
  hour_of_day_london: number;
  publish_time_utc: string;
  previous_publish_time_utc: string;
  lead_time_hours: number;
  previous_forecast_mw: number;
  revised_forecast_mw: number;
  revision_mw: number;
  abs_revision_mw: number;
  cycle_gap_hours: number;
  is_discontinuous: boolean;
}

export interface RevisionDistributionBin {
  bin_center_mw: number;
  bin_start_mw: number;
  bin_end_mw: number;
  count: number;
}

export interface DiurnalRevisionCell {
  hour_of_day_london: number;
  horizon_bucket: string;
  mean_abs_revision_mw: number;
  revision_count: number;
}

export interface RevisionAnalyticsResponse {
  delivery_date_from: string;
  delivery_date_to: string;
  forward_only_revisions: number;
  mean_signed_revision_mw: number;
  mean_absolute_revision_mw: number;
  upward_count: number;
  upward_pct: number;
  downward_count: number;
  downward_pct: number;
  unchanged_count: number;
  unchanged_pct: number;
  cycle_gap_max_hours: number;
  discontinuous_gap_count: number;
  histogram: RevisionDistributionBin[];
  top_revisions: ExtremeRevisionItem[];
  diurnal_revision_heatmap: DiurnalRevisionCell[];
}

// ---------------------------------------------------------------------------
// Phase 4.1 Authentication & RBAC Schemas
// ---------------------------------------------------------------------------

export type UserRole = "viewer" | "analyst" | "admin";

export interface UserProfileResponse {
  user_id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
  user_id: string;
  email: string;
  role: UserRole;
  csrf_token: string;
}

export interface ApiKeyCreateRequest {
  name: string;
  scopes?: string[];
  expires_in_days?: number | null;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  key_prefix: string;
  plaintext_key: string;
  scopes: string[];
  expires_at: string | null;
  created_at: string;
}

export interface ApiKeyItemResponse {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  is_revoked: boolean;
  created_at: string;
}



