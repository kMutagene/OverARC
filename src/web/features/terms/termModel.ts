import { compactIdentifier } from '../../shared/identifierModel';
import type { Term, TermUsageRole } from '../../shared/types';

/** User-controlled filters scoped only to the active state's term dictionary. */
export interface TermFilters {
  query: string;
  sources: Set<string>;
  roles: Set<TermUsageRole>;
}

/** Columns available through the term table's three-state sort cycle. */
export type TermSortColumn = 'name' | 'identifier' | 'source' | 'usageCount' | 'roles';

/** Active sort column and direction for the term table. */
export interface TermSort {
  column: TermSortColumn;
  direction: 'ascending' | 'descending';
}

/** Stable curator-facing labels for transport-level term usage roles. */
export const TERM_USAGE_LABELS: Readonly<Record<TermUsageRole, string>> = {
  objectType: 'Object type',
  objectPropertyPredicate: 'Object property predicate',
  relationPredicate: 'Relation predicate',
  relationPropertyPredicate: 'Relation property predicate',
  annotationProperty: 'Annotation property',
  termValue: 'Term value',
  unit: 'Unit',
};

const TERM_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Creates an unfiltered term view independent from graph filter state. */
export function emptyTermFilters(): TermFilters {
  return { query: '', sources: new Set(), roles: new Set() };
}

/** Normalizes curator search text so composed and decomposed Unicode match consistently. */
function normalizeSearch(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

/** Returns source and role choices present in the complete active term dictionary. */
export function termFilterOptions(terms: Term[]) {
  return {
    sources: [...new Set(terms.map((term) => term.source ?? ''))].sort(TERM_COLLATOR.compare),
    roles: [...new Set(terms.flatMap((term) => term.usageRoles))].sort((left, right) =>
      TERM_COLLATOR.compare(TERM_USAGE_LABELS[left], TERM_USAGE_LABELS[right]),
    ),
  };
}

/** Applies term-local search and OR-within-category source and role filters. */
export function filterTerms(terms: Term[], filters: TermFilters): Term[] {
  const query = normalizeSearch(filters.query.trim());
  return terms.filter((term) => {
    const searchText = normalizeSearch(
      [term.name, term.label, term.id, compactIdentifier(term.id), term.source]
        .filter((value): value is string => Boolean(value))
        .join(' '),
    );
    const sourceMatches = filters.sources.size === 0 || filters.sources.has(term.source ?? '');
    const roleMatches =
      filters.roles.size === 0 || term.usageRoles.some((role) => filters.roles.has(role));
    return (!query || searchText.includes(query)) && sourceMatches && roleMatches;
  });
}

/** Sorts filtered terms while resolving equal display values by exact term IRI. */
export function sortTerms(terms: Term[], sort: TermSort | null): Term[] {
  if (!sort) return terms;
  const value = (term: Term): string | number => {
    switch (sort.column) {
      case 'name':
        return term.name ?? term.label;
      case 'identifier':
        return compactIdentifier(term.id);
      case 'source':
        return term.source ?? '';
      case 'usageCount':
        return term.usageCount;
      case 'roles':
        return term.usageRoles.map((role) => TERM_USAGE_LABELS[role]).join(', ');
    }
  };
  return [...terms].sort((left, right) => {
    const leftValue = value(left);
    const rightValue = value(right);
    const compared =
      typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : TERM_COLLATOR.compare(String(leftValue), String(rightValue));
    if (compared !== 0) return sort.direction === 'ascending' ? compared : -compared;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}
