import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Mappings, Term } from '../../shared/types';
import { MappingDialog } from './MappingDialog';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const terms: Term[] = [
  {
    id: 'http://purl.obolibrary.org/obo/OBI_0000220',
    label: 'control role',
    name: 'control role',
    source: 'OBI',
    selector: '#/terms/obi',
    usageCount: 0,
    usageRoles: [],
  },
  {
    id: 'urn:term:treatment',
    label: 'treatment',
    name: 'treatment',
    source: null,
    selector: '#/terms/treatment',
    usageCount: 1,
    usageRoles: ['termValue'],
  },
];

const mappings: Mappings = {
  stateId: 'state-a',
  draftId: null,
  relativePath: 'mappings/state-a.sssom.tsv',
  sha256: 'hash',
  isDraft: false,
  sssomVersion: '1.1',
  mappingSetId: 'https://example.org/mappings',
  license: 'https://creativecommons.org/publicdomain/zero/1.0/',
  metadataFields: [],
  mappings: [
    {
      index: 0,
      fields: [
        { name: 'subject_label', values: ['control'] },
        { name: 'object_id', values: ['urn:term:existing'] },
      ],
    },
  ],
};

describe('MappingDialog', () => {
  it('focuses registered-term search, warns about alternatives, and submits exact choices', () => {
    const onSubmit = vi.fn();
    render(
      <MappingDialog
        occurrence={{ selector: '#/value', literal: 'control', context: 'Sample · role' }}
        terms={terms}
        mappings={mappings}
        draft={null}
        error={null}
        submitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search registered terms' })).toHaveFocus();
    expect(screen.getByText(/already maps to: urn:term:existing/)).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: 'Curator' }), {
      target: { value: 'curator@example.org' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Predicate' }), {
      target: { value: 'skos:closeMatch' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /control role/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Map selected occurrence' }));

    expect(onSubmit).toHaveBeenCalledWith(
      'http://purl.obolibrary.org/obo/OBI_0000220',
      'skos:closeMatch',
      'curator@example.org',
    );
  });

  it('filters only supplied registered terms and handles Escape as cancel', () => {
    const onCancel = vi.fn();
    const view = render(
      <MappingDialog
        occurrence={{ selector: '#/value', literal: 'control', context: 'Sample' }}
        terms={terms}
        mappings={null}
        draft={null}
        error="A structured validation error"
        submitting={false}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search registered terms' }), {
      target: { value: 'treatment' },
    });
    expect(screen.queryByRole('radio', { name: /control role/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /treatment/ })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('A structured validation error');
    fireEvent(view.container.querySelector('dialog')!, new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
