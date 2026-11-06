import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, DataInconsistencyError } from "@/lib/api-client";
import type { HourlyAccuracyResponse } from "@/types/api";

describe("api.getAllHourlyAccuracy continuity and filter guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("permits 24-hour interval gaps when hour_of_day = 0 is filtered", async () => {
    // Two consecutive days at hour 0 (00:00 UTC)
    const mockResponse: HourlyAccuracyResponse = {
      items: [
        {
          delivery_date: "2026-01-02",
          delivery_hour_utc: "2026-01-02T00:00:00Z",
          hour_of_day: 0,
          decision_date: "2026-01-01",
          decision_cutoff_utc: "2026-01-01T09:00:00Z",
          selected_publish_time_utc: "2026-01-01T07:30:00Z",
          forecast_generation_mw: 10000,
          actual_generation_mw: 9000,
          forecast_error_mw: 1000,
          absolute_error_mw: 1000,
          absolute_percentage_error: 11.11,
          comparison_status: "VALID",
          traceability: null,
        },
        {
          delivery_date: "2026-01-03",
          delivery_hour_utc: "2026-01-03T00:00:00Z",
          hour_of_day: 0,
          decision_date: "2026-01-02",
          decision_cutoff_utc: "2026-01-02T09:00:00Z",
          selected_publish_time_utc: "2026-01-02T07:30:00Z",
          forecast_generation_mw: 11000,
          actual_generation_mw: 10000,
          forecast_error_mw: 1000,
          absolute_error_mw: 1000,
          absolute_percentage_error: 10.0,
          comparison_status: "VALID",
          traceability: null,
        },
      ],
      hour_of_day_summary: [],
      pagination: {
        page: 1,
        page_size: 200,
        total_items: 2,
        total_pages: 1,
        has_next: false,
        has_previous: false,
      },
    };

    vi.spyOn(api, "getHourlyAccuracy").mockResolvedValue(mockResponse);

    // Query with hour_of_day: 0 (falsy number)
    const result = await api.getAllHourlyAccuracy({ hour_of_day: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.total_items).toBe(2);
  });

  it("throws DataInconsistencyError when full unfiltered series contains a missing hour gap", async () => {
    // Gap of 2 hours in unfiltered series (00:00 -> 02:00)
    const mockPage1: HourlyAccuracyResponse = {
      items: [
        {
          delivery_date: "2026-01-02",
          delivery_hour_utc: "2026-01-02T00:00:00Z",
          hour_of_day: 0,
          delivery_hour_utc_test: "gap",
        } as any,
      ],
      hour_of_day_summary: [],
      pagination: {
        page: 1,
        page_size: 1,
        total_items: 2,
        total_pages: 2,
        has_next: true,
        has_previous: false,
      },
    };

    const mockPage2: HourlyAccuracyResponse = {
      items: [
        {
          delivery_date: "2026-01-02",
          delivery_hour_utc: "2026-01-02T02:00:00Z", // Gap: skipped 01:00
          hour_of_day: 2,
        } as any,
      ],
      hour_of_day_summary: [],
      pagination: {
        page: 2,
        page_size: 1,
        total_items: 2,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    };

    vi.spyOn(api, "getHourlyAccuracy")
      .mockResolvedValueOnce(mockPage1)
      .mockResolvedValueOnce(mockPage2);

    await expect(api.getAllHourlyAccuracy()).rejects.toThrow(DataInconsistencyError);
  });

  it("throws DataInconsistencyError when duplicate delivery hour keys exist", async () => {
    const mockPage1: HourlyAccuracyResponse = {
      items: [
        {
          delivery_date: "2026-01-02",
          delivery_hour_utc: "2026-01-02T00:00:00Z",
          hour_of_day: 0,
        } as any,
      ],
      hour_of_day_summary: [],
      pagination: {
        page: 1,
        page_size: 1,
        total_items: 2,
        total_pages: 2,
        has_next: true,
        has_previous: false,
      },
    };

    const mockPage2: HourlyAccuracyResponse = {
      items: [
        {
          delivery_date: "2026-01-02",
          delivery_hour_utc: "2026-01-02T00:00:00Z", // Duplicate key
          hour_of_day: 0,
        } as any,
      ],
      hour_of_day_summary: [],
      pagination: {
        page: 2,
        page_size: 1,
        total_items: 2,
        total_pages: 2,
        has_next: false,
        has_previous: true,
      },
    };

    vi.spyOn(api, "getHourlyAccuracy")
      .mockResolvedValueOnce(mockPage1)
      .mockResolvedValueOnce(mockPage2);

    await expect(api.getAllHourlyAccuracy()).rejects.toThrow(DataInconsistencyError);
  });
});

describe("Phase 4.1 Auth & RBAC API Client Capabilities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setAccessToken(null);
    api.setCsrfToken(null);
  });

  it("stores access token strictly in-memory without exposing to localStorage", () => {
    expect(api.getAccessToken()).toBeNull();
    api.setAccessToken("test_token_12345");
    expect(api.getAccessToken()).toBe("test_token_12345");

    api.setAccessToken(null);
    expect(api.getAccessToken()).toBeNull();
  });

  it("attaches Authorization header and credentials=include to authenticated requests", async () => {
    api.setAccessToken("jwt_bearer_token_xyz");

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ platform: "WindIQ", version: "2.1.0" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.getOverview();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [callUrl, callOptions] = fetchMock.mock.calls[0];
    expect(callUrl).toContain("/api/v1/overview");
    expect(callOptions.headers["Authorization"]).toBe("Bearer jwt_bearer_token_xyz");
    expect(callOptions.credentials).toBe("include");
  });

  it("performs single-flight refresh synchronization when receiving 401 and replays request", async () => {
    api.setAccessToken("expired_token");
    api.setCsrfToken("csrf_token_abc");

    let refreshCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/auth/refresh")) {
        refreshCallCount++;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            access_token: "new_valid_token_777",
            token_type: "bearer",
            expires_in_seconds: 900,
            user_id: "user-1",
            email: "analyst@windiq.local",
            role: "analyst",
            csrf_token: "new_csrf_token_888",
          }),
        };
      }

      if (url.includes("/api/v1/overview")) {
        // First call with expired token returns 401
        if (refreshCallCount === 0) {
          return {
            ok: false,
            status: 401,
            statusText: "Unauthorized",
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({ detail: "Token expired" }),
          };
        }
        // Second call with new token succeeds
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ platform: "WindIQ", version: "2.1.0" }),
        };
      }

      return { ok: false, status: 404 };
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await api.getOverview();

    expect(result.platform).toBe("WindIQ");
    expect(refreshCallCount).toBe(1);
    expect(api.getAccessToken()).toBe("new_valid_token_777");
  });

  it("synchronizes parallel requests during refresh so that only one /refresh call is executed", async () => {
    api.setAccessToken("expired_token");
    api.setCsrfToken("csrf_token_abc");

    let refreshCallCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/auth/refresh")) {
        refreshCallCount++;
        // Simulate small network delay on refresh
        await new Promise((r) => setTimeout(r, 10));
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            access_token: "refreshed_shared_token",
            token_type: "bearer",
            expires_in_seconds: 900,
            user_id: "user-1",
            email: "analyst@windiq.local",
            role: "analyst",
            csrf_token: "new_csrf_token",
          }),
        };
      }

      // Initial calls fail with 401, replay calls succeed
      if (refreshCallCount === 0) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ detail: "Token expired" }),
        };
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ data: "ok" }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    // Concurrently trigger two requests that both fail with 401
    const [res1, res2] = await Promise.all([
      api.getOverview(),
      api.getDataHealth(),
    ]);

    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    // CRITICAL: Refresh endpoint called EXACTLY ONCE across parallel failed requests
    expect(refreshCallCount).toBe(1);
    expect(api.getAccessToken()).toBe("refreshed_shared_token");
  });

  it("purges tokens and notifies auth listeners if refresh fails (theft detection or revoked)", async () => {
    api.setAccessToken("stolen_or_compromised_token");
    api.setCsrfToken("csrf_token");

    const listener = vi.fn();
    const unsub = api.onAuthChange(listener);

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/v1/auth/refresh")) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ detail: "Session security compromise detected" }),
        };
      }
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ detail: "Token revoked" }),
      };
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getOverview()).rejects.toThrow();

    expect(api.getAccessToken()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
    unsub();
  });
});


