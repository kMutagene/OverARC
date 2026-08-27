import type { Filters } from '../../shared/types';

export function emptyFilters(): Filters {
  return {
    query: '',
    kinds: new Set(),
    types: new Set(),
    predicates: new Set(),
    context: true,
  };
}
