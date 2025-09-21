export const API_BASE_URL: string =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE_URL) ||
  "http://localhost:4000";

// Client-side should call our Next.js API to avoid CORS in dev
export const RECORDS_ENDPOINT: string = "/api/records";

// Server-side proxy target
export const UPSTREAM_RECORDS_ENDPOINT: string = `${API_BASE_URL}/records`;


