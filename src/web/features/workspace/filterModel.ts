import type { Filters } from '../../shared/types';

/** Creates the default unfiltered view with one-hop context enabled. */
export function emptyFilters(): Filters {
  return {
    query: '',
    kinds: new Set(),
    types: new Set(),
    predicates: new Set(),
    context: true,
  };
}
