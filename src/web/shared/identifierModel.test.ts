import { describe, expect, it } from 'vitest';
import { compactIdentifier, identifierLabels, identifierPresentation } from './identifierModel';
import type { Projection } from './types';

describe('identifier presentation', () => {
  it('uses curator and term labels without changing the exact identity', () => {
    const projection: Projection = {
      stateId: 'state',
      sha256: 'hash',
      terms: [
        {
          id: 'http://purl.org/arc/insdc#Assay',
          label: 'Assay',
          name: 'Assay',
          source: null,
          selector: '#/term',
        },
      ],
      nodes: [
        {
          id: 'urn:biofsharp:insdc:object:DRX066754',
          label: 'DRX066754',
          kind: 'activity',
          typeIds: [],
          searchText: '',
          isPlaceholder: false,
          selector: '#/object',
        },
      ],
      relations: [],
    };
    const labels = identifierLabels(projection);

    expect(identifierPresentation('http://purl.org/arc/insdc#Assay', labels)).toEqual({
      primary: 'Assay',
      secondary: 'purl.org · Assay',
    });
    expect(identifierPresentation('urn:biofsharp:insdc:object:DRX066754', labels).primary).toBe(
      'DRX066754',
    );
  });

  it('abbreviates deterministic hashes and safely decodes local suffixes', () => {
    expect(
      compactIdentifier(
        'urn:biofsharp:arcir:assertion:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ),
    ).toBe('ArcIR assertion · 01234567…abcdef');
    expect(compactIdentifier('urn:biofsharp:insdc:object:DRR1%23fastq%3Areads.fastq.gz')).toBe(
      'INSDC object · DRR1#fastq:reads.fastq.gz',
    );
    expect(() => compactIdentifier('urn:biofsharp:insdc:object:broken%ZZvalue')).not.toThrow();
  });
});
