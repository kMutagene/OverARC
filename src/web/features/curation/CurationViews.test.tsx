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
  metadataFields: [
    { name: 'curie_map', values: ['GENO: http://purl.obolibrary.org/obo/GENO_'] },
    { name: 'ext_note', values: ['retained'] },
  ],
  mappings: [
    {
      index: 0,
      fields: [
        { name: 'subject_id', values: ['urn:local:control'] },
        { name: 'subject_label', values: ['control'] },
        { name: 'subject_type', values: ['RdfsLiteral'] },
        {
          name: 'predicate_id',
          values: ['http://www.w3.org/2004/02/skos/core#exactMatch'],
        },
        { name: 'object_id', values: ['http://purl.obolibrary.org/obo/GENO_0000536'] },
        { name: 'object_label', values: ['control role'] },
        { name: 'object_type', values: ['OwlClass'] },
        {
          name: 'mapping_justification',
          values: ['https://w3id.org/semapv/vocab/ManualMappingCuration'],
        },
        { name: 'comment', values: ['Example curator description.'] },
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

  it('shows semantic mapping columns, compact links, types, descriptions, and retained fields', () => {
    render(<MappingsView mappings={mappings} active />);
    expect(screen.getByRole('region', { name: 'SSSOM mappings' })).toBeVisible();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Subject',
      'Predicate',
      'Object',
      'Justification',
    ]);
    expect(screen.getByText('rdfs literal')).toBeVisible();
    expect(screen.getByText('owl class')).toBeVisible();
    expect(screen.getByText('Example curator description.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'skos:exactMatch' })).toHaveAttribute(
      'href',
      'http://www.w3.org/2004/02/skos/core#exactMatch',
    );
    expect(screen.getByRole('link', { name: 'GENO:0000536' })).toHaveAttribute(
      'href',
      'http://purl.obolibrary.org/obo/GENO_0000536',
    );
    screen.getByText('Mapping-set metadata').click();
    expect(screen.getByText('retained')).toBeVisible();
    screen.getByText('3 additional fields').click();
    expect(screen.getByText('urn:uuid:record')).toBeVisible();
    expect(screen.getByText('row retained')).toBeVisible();
  });
});
