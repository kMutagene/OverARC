import type { ElementDetail, Projection, Workspace } from './types';

export class ApiProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    message: string,
  ) {
    super(message);
  }
}

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

export const api = {
  workspace: () => request<Workspace>('/api/v1/workspace'),
  refresh: () => request<Workspace>('/api/v1/workspace/refresh', { method: 'POST' }),
  projection: (stateId: string) =>
    request<Projection>(`/api/v1/states/${encodeURIComponent(stateId)}/projection`),
  details: (stateId: string, kind: 'object' | 'relation', id: string) =>
    request<ElementDetail>(`/api/v1/states/${encodeURIComponent(stateId)}/details`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    }),
};
