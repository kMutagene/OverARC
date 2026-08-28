import type { ElementDetail, Projection, Workspace } from './types';

/** Error raised for non-success API responses after decoding their RFC 7807 payload. */
export class ApiProblem extends Error {
  /** Creates an API error that preserves HTTP status, problem title, and user-facing detail. */
  constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
  ) {
    super(message);
  }
}

/** Executes one JSON request and normalizes failed responses into {@link ApiProblem}. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      title?: string;
      detail?: string;
    };
    throw new ApiProblem(
      response.status,
      problem.title ?? 'Request failed',
      problem.detail ?? response.statusText,
    );
  }
  return (await response.json()) as T;
}

/** Hand-written, exact-ID-safe client for the read-only OverARC HTTP surface. */
export const api = {
  /** Reads the current viewer manifest metadata and validation results. */
  workspace: () => request<Workspace>('/api/v1/workspace'),
  /** Re-reads the workspace from disk without modifying its manifest or ArcIR files. */
  refresh: () => request<Workspace>('/api/v1/workspace/refresh', { method: 'POST' }),
  /** Loads the compact graph projection for an exact state ID. */
  projection: (stateId: string) =>
    request<Projection>(`/api/v1/states/${encodeURIComponent(stateId)}/projection`),
  /** Loads complete inspector details for one exact object or relation IRI. */
  details: (stateId: string, kind: 'object' | 'relation', id: string) =>
    request<ElementDetail>(`/api/v1/states/${encodeURIComponent(stateId)}/details`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    }),
};
