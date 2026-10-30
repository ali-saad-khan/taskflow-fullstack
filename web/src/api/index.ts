import { createHttpAdapter } from "./http";
import { createMockAdapter } from "./mock";
import type { Api } from "./types";

export { ApiError } from "./types";
export type { Api } from "./types";

/**
 * Chosen at build time via VITE_API_MODE=mock|http (default http). Written as a direct
 * comparison so the bundler can drop the adapter that is not selected.
 */
export const api: Api =
  import.meta.env.VITE_API_MODE === "mock"
    ? createMockAdapter()
    : createHttpAdapter({ baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1" });
