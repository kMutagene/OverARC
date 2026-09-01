import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CurationDraft, Mappings, StateSummary } from '../../shared/types';
import { ChangesView } from './ChangesView';
import { CurationStatus } from './CurationStatus';
import { MappingsView } from './MappingsView';

const draft: CurationDraft = {
  id: 'draft',
  stateId: 'state-a',
  revision: '1',
  processName: 'overarc-curation-uuid',
  curator: 'Curator',
  createdUtc: '2026-08-28T12:00:00Z',
  lastAccessUtc: '2026-08-28T12:00:00Z',
  baseArcIrSha256: 'a',
  baseSssomSha256: 'b',
  arcIrSha256: 'c',
  sssomSha256: 'd',
  operations: [
    {
      id: 'operation',
      selector: '#/source',
      literal: 'control',
      targetTermId: 'urn:term:control',
      targetTermLabel: 'control role',
      predicateId: 'skos:exactMatch',
      proposedRecordId: 'urn:uuid:record',
      outputSelector: '#/output',
      arcIrStatus: 'Added',
      mappingCreated: true,
      mappingRecord: {
        index: 0,
        recordId: 'urn:uuid:record',
        subjectLabel: 'control',
        predicateId: 'skos:exactMatch',
        objectId: 'urn:term:control',
        objectLabel: 'control role',
        mappingJustification: 'semapv:ManualMappingCuration',
      },
    },
  ],
};

const mappings: Mappings = {
  stateId: 'state-a',
  draftId: 'draft',
  relativePath: null,
  sha256: 'd',
  isDraft: true,
  sssomVersion: '1.1',
  mappingSetId: 'https://example.org/mappings',
  license: 'CC0',
  metadataFields: [{ name: 'ext_note', values: ['retained'] }],
  mappings: [
    {
      index: 0,
      fields: [
        { name: 'subject_label', values: ['control'] },
        { name: 'predicate_id', values: ['skos:exactMatch'] },
        { name: 'object_id', values: ['urn:term:control'] },
        { name: 'object_label', values: ['control role'] },
        { name: 'mapping_justification', values: ['semapv:ManualMappingCuration'] },
        { name: 'record_id', values: ['urn:uuid:record'] },
        { name: 'ext_note', values: ['row retained'] },
      ],
    },
  ],
};

const editableState: StateSummary = {
  id: 'state-a',
  label: 'State A',
  relativePath: 'arcir/state-a.json',
  sha256: 'a'.repeat(64),
  status: 'valid',
  lastWriteUtc: null,
  formatVersion: '1.0',
  objectCount: 1,
  relationCount: 0,
  errors: [],
  editable: true,
};

describe('curation center views', () => {
  it('keeps editing controls behind an explicit curation-mode switch', () => {
    const onToggleMode = vi.fn();
    const shared = {
      state: editableState,
      draft: null,
      notice: null,
      error: null,
      busy: false,
      onSave: vi.fn(),
      onDiscard: vi.fn(),
      onDismissNotice: vi.fn(),
      onToggleMode,
    };
    const view = render(<CurationStatus {...shared} curationMode={false} />);

    expect(screen.getByText(/Browse mode is active/)).toBeVisible();
    screen.getByRole('button', { name: 'Enter curation mode' }).click();
    expect(onToggleMode).toHaveBeenCalledOnce();

    view.rerender(<CurationStatus {...shared} curationMode />);
    expect(screen.getByText(/Curation mode is active/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exit curation mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows exact draft accounting and invokes replay-based undo', () => {
    const onUndo = vi.fn();
    render(<ChangesView draft={draft} active disabled={false} onUndo={onUndo} />);
    expect(screen.getByRole('region', { name: 'Draft changes' })).toBeVisible();
    expect(screen.getByText('#/source')).toBeVisible();
    expect(screen.getByText('urn:uuid:record')).toBeVisible();
    screen.getByRole('button', { name: 'Undo' }).click();
    expect(onUndo).toHaveBeenCalledWith('operation');
  });

  it('shows retained mapping metadata, row extensions, and exact target IDs', () => {
    render(<MappingsView mappings={mappings} active />);
    expect(screen.getByRole('region', { name: 'SSSOM mappings' })).toBeVisible();
    expect(screen.getAllByText('urn:term:control')[0]).toBeVisible();
    screen.getByText('Mapping-set metadata').click();
    expect(screen.getByText('retained')).toBeVisible();
    screen.getByText('7 fields').click();
    expect(screen.getByText('row retained')).toBeVisible();
  });
});
