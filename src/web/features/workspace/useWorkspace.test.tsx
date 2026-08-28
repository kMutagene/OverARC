import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { api, ApiProblem } from '../../shared/api';
import type { CurationDraft, Mappings, Projection, Workspace } from '../../shared/types';
import { useWorkspace } from './useWorkspace';

vi.mock('../../shared/api', () => {
  class MockApiProblem extends Error {
    constructor(
      public readonly status: number,
      public readonly title: string,
      message: string,
      public readonly errors: string[] = [],
    ) {
      super(message);
    }
  }

  return {
    ApiProblem: MockApiProblem,
    api: {
      workspace: vi.fn(),
      refresh: vi.fn(),
      projection: vi.fn(),
      mappings: vi.fn(),
      draft: vi.fn(),
      draftProjection: vi.fn(),
      draftMappings: vi.fn(),
      createDraft: vi.fn(),
      addLiteralMapping: vi.fn(),
      undoOperation: vi.fn(),
      discardDraft: vi.fn(),
      saveDraft: vi.fn(),
    },
  };
});

const projection: Projection = {
  stateId: 'state-a',
  sha256: 'a'.repeat(64),
  terms: [],
  nodes: [],
  relations: [],
};

const mappings: Mappings = {
  stateId: 'state-a',
  draftId: null,
  relativePath: 'mappings/state-a.sssom.tsv',
  sha256: 'b'.repeat(64),
  isDraft: false,
  sssomVersion: '1.1',
  mappingSetId: 'https://example.org/mappings',
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  metadataFields: [],
  mappings: [],
};

const workspace: Workspace = {
  name: 'Editable workspace',
  relativeManifestPath: 'arc.yml',
  defaultStateId: 'state-a',
  lineageKind: 'nativeArc',
  states: [
    {
      id: 'state-a',
      label: 'state-a',
      relativePath: 'arcir/state-a.json',
      sha256: 'a'.repeat(64),
      status: 'valid',
      lastWriteUtc: null,
      formatVersion: '1.0',
      objectCount: 0,
      relationCount: 0,
      errors: [],
      editable: true,
    },
  ],
};

const draft: CurationDraft = {
  id: 'draft-live',
  stateId: 'state-a',
  revision: '1',
  processName: 'overarc-curation-live',
  curator: 'Curator',
  createdUtc: '2026-08-28T12:00:00Z',
  lastAccessUtc: '2026-08-28T12:01:00Z',
  baseArcIrSha256: 'a'.repeat(64),
  baseSssomSha256: 'b'.repeat(64),
  arcIrSha256: 'c'.repeat(64),
  sssomSha256: 'd'.repeat(64),
  operations: [],
};

describe('useWorkspace draft lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.mocked(api.workspace).mockResolvedValue(workspace);
    vi.mocked(api.projection).mockResolvedValue(projection);
    vi.mocked(api.mappings).mockResolvedValue(mappings);
    vi.mocked(api.draftProjection).mockResolvedValue(projection);
    vi.mocked(api.draftMappings).mockResolvedValue({
      ...mappings,
      draftId: draft.id,
      isDraft: true,
    });
  });

  test('reattaches solely from the stored server ID and loads replayed views', async () => {
    window.sessionStorage.setItem('overarc.draftId', draft.id);
    vi.mocked(api.draft).mockResolvedValue(draft);

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.draft?.id).toBe(draft.id));
    await waitFor(() => expect(result.current.projection).toEqual(projection));
    expect(result.current.notice).toContain('Reattached unsaved process');
    expect(api.draftProjection).toHaveBeenCalledWith(draft.id);
    expect(api.draftMappings).toHaveBeenCalledWith(draft.id);
    expect(Object.keys(window.sessionStorage)).toEqual(['overarc.draftId']);
  });

  test('explains and removes a server-lost draft before browsing the immutable state', async () => {
    window.sessionStorage.setItem('overarc.draftId', 'draft-lost');
    vi.mocked(api.draft).mockRejectedValue(
      new ApiProblem(404, 'Draft not found', 'The draft expired or the server restarted.'),
    );

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.notice).toContain('expired or was lost'));
    await waitFor(() => expect(result.current.projection).toEqual(projection));
    expect(result.current.draft).toBeNull();
    expect(window.sessionStorage.getItem('overarc.draftId')).toBeNull();
    expect(api.projection).toHaveBeenCalledWith('state-a');
  });

  test('creates a server draft and sends the exact current revision with a typed command', async () => {
    const created = { ...draft, revision: '0', operations: [] };
    const updated = {
      ...draft,
      operations: [
        {
          id: 'operation-1',
          selector: '#/graph/objects/source/properties/title/value',
          literal: 'Source literal',
          targetTermId: 'urn:term:target',
          targetTermLabel: 'Target',
          predicateId: 'skos:exactMatch',
          proposedRecordId: 'urn:uuid:record',
          outputSelector: '#/graph/objects/source/properties/companion/value',
          arcIrStatus: 'Added',
          mappingCreated: true,
          mappingRecord: {
            index: 0,
            recordId: 'urn:uuid:record',
            subjectLabel: 'Source literal',
            predicateId: 'skos:exactMatch',
            objectId: 'urn:term:target',
            objectLabel: 'Target',
            mappingJustification: 'semapv:ManualMappingCuration',
          },
        },
      ],
    } satisfies CurationDraft;
    vi.mocked(api.createDraft).mockResolvedValue(created);
    vi.mocked(api.addLiteralMapping).mockResolvedValue(updated);
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.activeState).toBe('state-a'));

    await act(async () => {
      await result.current.addLiteralMapping(
        {
          selector: '#/graph/objects/source/properties/title/value',
          literal: 'Source literal',
          context: 'Source · Title',
        },
        'urn:term:target',
        'skos:exactMatch',
        'Curator',
      );
    });

    expect(api.createDraft).toHaveBeenCalledWith('state-a', 'Curator');
    expect(api.addLiteralMapping).toHaveBeenCalledWith(draft.id, {
      expectedRevision: '0',
      selector: '#/graph/objects/source/properties/title/value',
      literal: 'Source literal',
      targetTermId: 'urn:term:target',
      predicateId: 'skos:exactMatch',
    });
    expect(result.current.draft?.revision).toBe('1');
    expect(window.sessionStorage.getItem('overarc.draftId')).toBe(draft.id);
  });
});
