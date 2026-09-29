import type { HealthResponse, RoutesSnapshot, ScheduleMatch } from "../../shared/types";

const request = async <T>(url: string, method = "GET"): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: { Accept: "application/json" }
  });
  const payload = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : undefined;
    throw new Error(message ?? `请求失败：${response.status}`);
  }

  return payload as T;
};

export const resolveMatch = (input: string): Promise<{ key: string }> =>
  request(`/api/tt/resolve?input=${encodeURIComponent(input)}`);

export const getSchedule = (): Promise<ScheduleMatch[]> =>
  request("/api/tt/schedule");

export const getHealth = (): Promise<HealthResponse> =>
  request("/api/health");

export const getRoutes = (): Promise<RoutesSnapshot> =>
  request("/api/tt/routes");

export const refreshRoutes = (): Promise<RoutesSnapshot> =>
  request("/api/tt/routes/refresh", "POST");
