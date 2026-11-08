/**
 * Centralized API client for WindIQ Backend API.
 * Uses typed requests, configurable base URL, and RFC 7807 error handling.
 */

import type {
  OverviewResponse,
  AccuracySummaryResponse,
  DailyAccuracyResponse,
  HourlyAccuracyResponse,
  HourlyAccuracyQueryParams,
  HourlyAccuracyItem,
  DataHealthResponse,
  ApiHealthResponse,
  SingleDeliveryHourPublicationResponse,
  MultiHorizonResponse,
  HorizonMode,
  RevisionAnalyticsResponse,
  UserProfileResponse,
  LoginRequest,
  TokenResponse,
  ApiKeyCreateRequest,
  ApiKeyCreateResponse,
  ApiKeyItemResponse,
} from "@/types/api";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") || "";

export class DataInconsistencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataInconsistencyError";
  }
}

export class ApiError extends Error {
  public statusCode: number;
  public details?: unknown;
  public requestId?: string;

  constructor(
    message: string,
    statusCode: number,
    details?: unknown,
    requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
  }
}

// In-memory token storage (XSS hardened: never persisted in localStorage)
let inMemoryAccessToken: string | null = null;
let inMemoryCsrfToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
const authListeners = new Set<(user: UserProfileResponse | null) => void>();

export function getCsrfTokenFromCookie(): string | null {
  if (typeof document !== "undefined" && document.cookie) {
    const match = document.cookie.match(/(?:^|;\s*)windiq_csrf_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return inMemoryCsrfToken;
}

export function setTokens(accessToken: string | null, csrfToken?: string | null): void {
  inMemoryAccessToken = accessToken;
  if (csrfToken !== undefined) {
    inMemoryCsrfToken = csrfToken;
  }
}

export async function executeTokenRefresh(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
      }

      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        setTokens(null, null);
        for (const listener of authListeners) {
          listener(null);
        }
        throw new ApiError("Session expired or revoked", res.status);
      }

      const data = (await res.json()) as TokenResponse;
      setTokens(data.access_token, data.csrf_token);
      return data.access_token;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(endpoint: string, options?: RequestInit, isRetry = false): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const requestId = crypto.randomUUID();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-ID": requestId,
    ...(options?.headers as Record<string, string>),
  };

  if (inMemoryAccessToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${inMemoryAccessToken}`;
  }

  if (
    options?.method &&
    ["POST", "PUT", "DELETE", "PATCH"].includes(options.method.toUpperCase()) &&
    endpoint.startsWith("/api/v1/auth/") &&
    !headers["X-CSRF-Token"]
  ) {
    const csrf = getCsrfTokenFromCookie();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: options?.credentials ?? "include",
    });

    // Single-flight refresh synchronization when encountering 401 on protected analytical endpoints
    if (res.status === 401 && !isRetry && !endpoint.startsWith("/api/v1/auth/")) {
      try {
        await executeTokenRefresh();
        return await request<T>(endpoint, options, true);
      } catch {
        // Refresh failed, continue to standard error handling
      }
    }

    const responseRequestId = res.headers.get("X-Request-ID") || requestId;

    if (!res.ok) {
      let errorMessage = `HTTP error ${res.status}: ${res.statusText}`;
      let errorDetails: unknown = undefined;

      try {
        const errJson = await res.json();
        if (errJson?.error?.message) {
          errorMessage = errJson.error.message;
          errorDetails = errJson.error.details;
        } else if (errJson?.detail) {
          errorMessage =
            typeof errJson.detail === "string"
              ? errJson.detail
              : JSON.stringify(errJson.detail);
        }
      } catch {
        // Not a JSON response (e.g. HTML gateway error)
        if (res.status === 502) {
          errorMessage = "Render backend service is unavailable (502 Bad Gateway). Please verify active deployment in Render dashboard.";
        } else if (res.status === 503) {
          errorMessage = "Backend service starting up (503 Service Unavailable). Please retry in a few seconds.";
        } else if (res.status === 504) {
          errorMessage = "Gateway timeout (504). Render backend instance is waking up.";
        }
      }

      throw new ApiError(errorMessage, res.status, errorDetails, responseRequestId);
    }

    return (await res.json()) as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message =
      err instanceof Error
        ? err.message
        : "Failed to connect to WindIQ API service";
    throw new ApiError(message, 0, undefined, requestId);
  }
}

export const api = {
  getBaseUrl(): string {
    return BASE_URL;
  },

  /**
   * GET /api/v1/overview
   * Returns high-level platform status, active evaluation period, overall benchmark KPIs, and dataset health.
   */
  async getOverview(): Promise<OverviewResponse> {
    return request<OverviewResponse>("/api/v1/overview");
  },

  /**
   * GET /api/v1/accuracy/summary
   * Calculates overall forecast accuracy KPIs over an arbitrary delivery date window.
   */
  async getAccuracySummary(
    deliveryDateFrom?: string,
    deliveryDateTo?: string
  ): Promise<AccuracySummaryResponse> {
    const params = new URLSearchParams();
    if (deliveryDateFrom) params.set("delivery_date_from", deliveryDateFrom);
    if (deliveryDateTo) params.set("delivery_date_to", deliveryDateTo);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<AccuracySummaryResponse>(`/api/v1/accuracy/summary${qs}`);
  },

  /**
   * GET /api/v1/accuracy/daily
   * Returns a day-by-day table of accuracy metrics, completeness, and bias across delivery dates.
   */
  async getDailyAccuracy(
    deliveryDateFrom?: string,
    deliveryDateTo?: string,
    sortBy?: string,
    order?: string,
    page?: number,
    pageSize?: number,
    signal?: AbortSignal
  ): Promise<DailyAccuracyResponse> {
    const params = new URLSearchParams();
    if (deliveryDateFrom) params.set("delivery_date_from", deliveryDateFrom);
    if (deliveryDateTo) params.set("delivery_date_to", deliveryDateTo);
    if (sortBy) params.set("sort_by", sortBy);
    if (order) params.set("order", order);
    if (page) params.set("page", String(page));
    if (pageSize) params.set("page_size", String(pageSize));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<DailyAccuracyResponse>(`/api/v1/accuracy/daily${qs}`, { signal });
  },

  /**
   * GET /api/v1/accuracy/hourly
   * Returns paginated granular hourly evaluations with mathematical traceability and diurnal summary.
   */
  async getHourlyAccuracy(
    queryParams?: HourlyAccuracyQueryParams,
    signal?: AbortSignal
  ): Promise<HourlyAccuracyResponse> {
    const params = new URLSearchParams();
    if (queryParams?.delivery_date) params.set("delivery_date", queryParams.delivery_date);
    if (queryParams?.delivery_date_from) params.set("delivery_date_from", queryParams.delivery_date_from);
    if (queryParams?.delivery_date_to) params.set("delivery_date_to", queryParams.delivery_date_to);
    if (queryParams?.hour_of_day !== undefined && queryParams?.hour_of_day !== null) {
      params.set("hour_of_day", String(queryParams.hour_of_day));
    }
    if (queryParams?.status && queryParams.status !== "ALL") params.set("status", queryParams.status);
    if (queryParams?.view) params.set("view", queryParams.view);
    if (queryParams?.sort_by) params.set("sort_by", queryParams.sort_by);
    if (queryParams?.order) params.set("order", queryParams.order);
    if (queryParams?.page) params.set("page", String(queryParams.page));
    if (queryParams?.page_size) params.set("page_size", String(queryParams.page_size));

    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<HourlyAccuracyResponse>(`/api/v1/accuracy/hourly${qs}`, { signal });
  },

  /**
   * Complete series fetcher for charts, heatmaps, quantiles, and CSV exports.
   * Concurrently fetches all pages (bounded by page_size=200) and performs consistency checks:
   * 1. Count parity check against initial total_items.
   * 2. Key uniqueness check on delivery_hour_utc.
   * 3. Chronological continuity verification.
   */
  async getAllHourlyAccuracy(
    queryParams?: Omit<HourlyAccuracyQueryParams, "page" | "page_size">,
    signal?: AbortSignal
  ): Promise<{ items: HourlyAccuracyItem[]; hour_of_day_summary: HourlyAccuracyResponse["hour_of_day_summary"]; total_items: number }> {
    const firstPage = await this.getHourlyAccuracy(
      { ...queryParams, page: 1, page_size: 200, sort_by: "delivery_hour_utc", order: "asc" },
      signal
    );

    const totalPages = firstPage.pagination.total_pages;
    const expectedTotal = firstPage.pagination.total_items;

    if (totalPages <= 1) {
      return {
        items: firstPage.items,
        hour_of_day_summary: firstPage.hour_of_day_summary,
        total_items: expectedTotal,
      };
    }

    const remainingPromises: Promise<HourlyAccuracyResponse>[] = [];
    for (let p = 2; p <= totalPages; p++) {
      remainingPromises.push(
        this.getHourlyAccuracy(
          { ...queryParams, page: p, page_size: 200, sort_by: "delivery_hour_utc", order: "asc" },
          signal
        )
      );
    }

    const remainingResponses = await Promise.all(remainingPromises);
    const allItems: HourlyAccuracyItem[] = [...firstPage.items];
    for (const r of remainingResponses) {
      allItems.push(...r.items);
    }

    // 1. Count parity validation
    if (allItems.length !== expectedTotal) {
      throw new DataInconsistencyError(
        `Pagination count mismatch: expected ${expectedTotal} items across ${totalPages} pages, but received ${allItems.length}. Underlying evaluations may have shifted.`
      );
    }

    // 2. Key uniqueness validation
    const seenKeys = new Set<string>();
    for (const item of allItems) {
      if (seenKeys.has(item.delivery_hour_utc)) {
        throw new DataInconsistencyError(
          `Duplicate delivery hour key detected during pagination assembly: ${item.delivery_hour_utc}. Offset drift detected.`
        );
      }
      seenKeys.add(item.delivery_hour_utc);
    }

    // 3. Chronological continuity validation (when querying full ranges without hour/status filtering)
    const isHourFiltered = queryParams?.hour_of_day !== undefined && queryParams?.hour_of_day !== null;
    const isStatusFiltered = Boolean(queryParams?.status && queryParams.status !== "ALL");
    if (!isHourFiltered && !isStatusFiltered && allItems.length > 1) {
      for (let i = 1; i < allItems.length; i++) {
        const prevTime = new Date(allItems[i - 1].delivery_hour_utc).getTime();
        const currTime = new Date(allItems[i].delivery_hour_utc).getTime();
        const deltaMs = currTime - prevTime;
        if (deltaMs !== 3600000) {
          throw new DataInconsistencyError(
            `Chronological discontinuity detected between ${allItems[i - 1].delivery_hour_utc} and ${allItems[i].delivery_hour_utc} (gap: ${deltaMs / 3600000}h). Dataset is missing hourly steps.`
          );
        }
      }
    }

    return {
      items: allItems,
      hour_of_day_summary: firstPage.hour_of_day_summary,
      total_items: expectedTotal,
    };
  },

  async getCompleteHourlySeries(
    queryParams?: Omit<HourlyAccuracyQueryParams, "page" | "page_size">,
    signal?: AbortSignal
  ): Promise<HourlyAccuracyItem[]> {
    const res = await this.getAllHourlyAccuracy(queryParams, signal);
    return res.items;
  },

  /**
   * GET /api/v1/data-health
   * Returns system integrity health scorecard, publication timing health, and scheduler status.
   */
  async getDataHealth(): Promise<DataHealthResponse> {
    return request<DataHealthResponse>("/api/v1/data-health");
  },

  /**
   * GET /health/live
   * Liveness probe.
   */
  async checkLiveness(): Promise<ApiHealthResponse> {
    return request<ApiHealthResponse>("/health/live");
  },

  /**
   * GET /health/ready
   * Readiness probe.
   */
  async checkReadiness(): Promise<ApiHealthResponse> {
    return request<ApiHealthResponse>("/health/ready");
  },

  /**
   * GET /api/v1/forecasts/publications/{delivery_hour_utc}
   * Returns all publications and settlement readings trace for a single delivery hour.
   */
  async getSingleDeliveryHourPublications(
    deliveryHourUtc: string,
    options?: RequestInit
  ): Promise<SingleDeliveryHourPublicationResponse> {
    return request<SingleDeliveryHourPublicationResponse>(
      `/api/v1/forecasts/publications/${encodeURIComponent(deliveryHourUtc)}`,
      options
    );
  },

  /**
   * GET /api/v1/forecasts/horizons
   * Returns multi-horizon forecast accuracy across standardized lead-time buckets.
   */
  async getMultiHorizonAnalysis(
    params?: {
      delivery_date_from?: string;
      delivery_date_to?: string;
      mode?: HorizonMode;
    },
    options?: RequestInit
  ): Promise<MultiHorizonResponse> {
    const searchParams = new URLSearchParams();
    if (params?.delivery_date_from) searchParams.set("delivery_date_from", params.delivery_date_from);
    if (params?.delivery_date_to) searchParams.set("delivery_date_to", params.delivery_date_to);
    if (params?.mode) searchParams.set("mode", params.mode);
    const qs = searchParams.toString();
    return request<MultiHorizonResponse>(`/api/v1/forecasts/horizons${qs ? `?${qs}` : ""}`, options);
  },

  /**
   * GET /api/v1/forecasts/revisions
   * Returns forward forecast revision analytics, distributions, and top swings.
   */
  async getRevisionAnalytics(
    params?: {
      delivery_date_from?: string;
      delivery_date_to?: string;
      min_abs_revision_mw?: number;
    },
    options?: RequestInit
  ): Promise<RevisionAnalyticsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.delivery_date_from) searchParams.set("delivery_date_from", params.delivery_date_from);
    if (params?.delivery_date_to) searchParams.set("delivery_date_to", params.delivery_date_to);
    if (params?.min_abs_revision_mw !== undefined) {
      searchParams.set("min_abs_revision_mw", params.min_abs_revision_mw.toString());
    }
    const qs = searchParams.toString();
    return request<RevisionAnalyticsResponse>(`/api/v1/forecasts/revisions${qs ? `?${qs}` : ""}`, options);
  },

  // -------------------------------------------------------------------------
  // Phase 4.1 Authentication & RBAC APIs
  // -------------------------------------------------------------------------

  /**
   * Retrieves currently stored in-memory access token (null if unauthenticated).
   */
  getAccessToken(): string | null {
    return inMemoryAccessToken;
  },

  /**
   * Manually sets or clears in-memory access token.
   */
  setAccessToken(token: string | null): void {
    setTokens(token);
  },

  /**
   * Retrieves active CSRF token.
   */
  getCsrfToken(): string | null {
    return getCsrfTokenFromCookie();
  },

  /**
   * Manually sets or clears in-memory CSRF token.
   */
  setCsrfToken(token: string | null): void {
    setTokens(inMemoryAccessToken, token);
  },

  /**
   * Registers a callback for authentication state changes (e.g., logout or session theft revocation).
   */
  onAuthChange(callback: (user: UserProfileResponse | null) => void): () => void {
    authListeners.add(callback);
    return () => authListeners.delete(callback);
  },

  /**
   * POST /api/v1/auth/login
   * Authenticates user credentials with Argon2id verification and returns JWT access token.
   */
  async login(payload: LoginRequest): Promise<TokenResponse> {
    const data = await request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setTokens(data.access_token, data.csrf_token);
    return data;
  },

  /**
   * POST /api/v1/auth/refresh
   * Explicitly rotates refresh token using HTTP-only cookie and updates access token.
   */
  async refreshSession(): Promise<TokenResponse> {
    const newToken = await executeTokenRefresh();
    const user = await this.getCurrentUser();
    return {
      access_token: newToken,
      token_type: "bearer",
      expires_in_seconds: 900,
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      csrf_token: getCsrfTokenFromCookie() || "",
    };
  },

  /**
   * POST /api/v1/auth/logout
   * Invalidates refresh token family and clears client credentials.
   */
  async logout(): Promise<{ detail: string }> {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      const headers: Record<string, string> = {};
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

      const res = await request<{ detail: string }>("/api/v1/auth/logout", {
        method: "POST",
        headers,
      });
      return res;
    } finally {
      setTokens(null, null);
      for (const listener of authListeners) {
        listener(null);
      }
    }
  },

  /**
   * GET /api/v1/auth/me
   * Fetches active user profile, assigned role, and effective permissions.
   */
  async getCurrentUser(): Promise<UserProfileResponse> {
    return request<UserProfileResponse>("/api/v1/auth/me");
  },

  /**
   * GET /api/v1/auth/keys
   * Lists machine-to-machine API keys (Admin only).
   */
  async getApiKeys(): Promise<ApiKeyItemResponse[]> {
    return request<ApiKeyItemResponse[]>("/api/v1/auth/keys");
  },

  /**
   * POST /api/v1/auth/keys
   * Generates a new machine-to-machine API key (Admin only).
   */
  async createApiKey(payload: ApiKeyCreateRequest): Promise<ApiKeyCreateResponse> {
    return request<ApiKeyCreateResponse>("/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  /**
   * DELETE /api/v1/auth/keys/{id}
   * Revokes an API key (Admin only).
   */
  async revokeApiKey(keyId: string): Promise<{ detail: string }> {
    return request<{ detail: string }>(`/api/v1/auth/keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    });
  },
};

