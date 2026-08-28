import type {
  CurationDraft,
  CurationSave,
  ElementDetail,
  Mappings,
  Projection,
  TermDetail,
  Workspace,
} from './types';

/** Error raised for non-success API responses after decoding their RFC 7807 payload. */
export class ApiProblem extends Error {
  /** Creates an API error that preserves HTTP status, problem title, and user-facing detail. */
  constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
    public readonly errors: string[] = [],
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
      errors?: string[];
    };
    throw new ApiProblem(
      response.status,
      problem.title ?? 'Request failed',
      problem.detail ?? response.statusText,
      problem.errors ?? [],
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Hand-written, exact-ID-safe client for the OverARC browse and curation HTTP surface. */
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
  /** Loads one exact term definition and every usage occurrence in the selected state. */
  termDetails: (stateId: string, id: string) =>
    request<TermDetail>(`/api/v1/states/${encodeURIComponent(stateId)}/term-details`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }),
  /** Loads validated SSSOM metadata and records paired to one immutable native state. */
  mappings: (stateId: string) =>
    request<Mappings>(`/api/v1/states/${encodeURIComponent(stateId)}/mappings`),
  /** Starts one server-owned curation draft against exact immutable base digests. */
  createDraft: (stateId: string, curator: string) =>
    request<CurationDraft>(`/api/v1/states/${encodeURIComponent(stateId)}/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curator }),
    }),
  /** Reattaches to a live draft after server-side base-digest verification. */
  draft: (draftId: string) =>
    request<CurationDraft>(`/api/v1/drafts/${encodeURIComponent(draftId)}`),
  /** Discards a draft using its lossless optimistic revision precondition. */
  discardDraft: (draftId: string, expectedRevision: string) =>
    request<void>(`/api/v1/drafts/${encodeURIComponent(draftId)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    }),
  /** Loads the graph/table/term projection derived from replayed draft ArcIR. */
  draftProjection: (draftId: string) =>
    request<Projection>(`/api/v1/drafts/${encodeURIComponent(draftId)}/projection`),
  /** Loads one exact object or relation from replayed draft ArcIR. */
  draftDetails: (draftId: string, kind: 'object' | 'relation', id: string) =>
    request<ElementDetail>(`/api/v1/drafts/${encodeURIComponent(draftId)}/details`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    }),
  /** Loads one registered term and its exact occurrences from replayed draft ArcIR. */
  draftTermDetails: (draftId: string, id: string) =>
    request<TermDetail>(`/api/v1/drafts/${encodeURIComponent(draftId)}/term-details`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }),
  /** Loads SSSOM metadata and rows from the replayed draft mapping artifact. */
  draftMappings: (draftId: string) =>
    request<Mappings>(`/api/v1/drafts/${encodeURIComponent(draftId)}/mappings`),
  /** Appends one exact selected-literal mapping at an optimistic revision. */
  addLiteralMapping: (
    draftId: string,
    operation: {
      expectedRevision: string;
      selector: string;
      literal: string;
      targetTermId: string;
      predicateId: string;
    },
  ) =>
    request<CurationDraft>(`/api/v1/drafts/${encodeURIComponent(draftId)}/literal-term-mappings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(operation),
    }),
  /** Removes one typed operation and returns the fully replayed successor draft. */
  undoOperation: (draftId: string, operationId: string, expectedRevision: string) =>
    request<CurationDraft>(
      `/api/v1/drafts/${encodeURIComponent(draftId)}/operations/${encodeURIComponent(operationId)}`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision }),
      },
    ),
  /** Atomically publishes immutable successors at the supplied draft revision. */
  saveDraft: (draftId: string, expectedRevision: string) =>
    request<CurationSave>(`/api/v1/drafts/${encodeURIComponent(draftId)}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision }),
    }),
};
