import { useEffect, useMemo, useState } from 'react';
import { IdentifierView } from '../../shared/IdentifierView';
import type { Projection, Selection, TermUsageRole } from '../../shared/types';
import {
  emptyTermFilters,
  filterTerms,
  sortTerms,
  TERM_USAGE_LABELS,
  termFilterOptions,
  type TermSort,
  type TermSortColumn,
} from './termModel';

const PAGE_SIZE = 100;

/** Projection, activation, and selection inputs for the term dictionary workspace. */
interface TermsViewProps {
  projection: Projection;
  active: boolean;
  onSelect: (selection: Selection) => void;
}

/** Renders one selectable OR-within-category term filter menu. */
function TermFilter<TValue extends string>({
  label,
  values,
  selected,
  display,
  onChange,
}: {
  label: string;
  values: TValue[];
  selected: Set<TValue>;
  display: (value: TValue) => string;
  onChange: (next: Set<TValue>) => void;
}) {
  if (values.length === 0) return null;
  return (
    <details className="term-filter">
      <summary>
        {label}
        {selected.size > 0 && <span>{selected.size}</span>}
      </summary>
      <fieldset>
        <legend className="visually-hidden">{label}</legend>
        {values.map((value) => (
          <label key={value || '__unspecified'}>
            <input
              type="checkbox"
              checked={selected.has(value)}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(value)) next.delete(value);
                else next.add(value);
                onChange(next);
              }}
            />{' '}
            {display(value)}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

/** Renders a full-cell term sort button and announces the next three-state sort action. */
function TermSortHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: TermSortColumn;
  label: string;
  sort: TermSort | null;
  onSort: (column: TermSortColumn) => void;
}) {
  const direction = sort?.column === column ? sort.direction : null;
  const actionLabel =
    direction === 'descending'
      ? `Remove ${label} sort`
      : `Sort by ${label}, ${direction === 'ascending' ? 'descending' : 'ascending'}`;
  return (
    <th scope="col" aria-sort={direction ?? undefined}>
      <button
        type="button"
        className="table-sort-button"
        aria-label={actionLabel}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className={`table-sort-indicator${direction ? ' active' : ''}`} aria-hidden="true">
          {direction === 'ascending' ? '▲' : direction === 'descending' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  );
}

/** Provides searchable, filterable, sortable, and paginated access to every registered ArcIR term. */
export function TermsView({ projection, active, onSelect }: TermsViewProps) {
  const [filters, setFilters] = useState(emptyTermFilters);
  const [sort, setSort] = useState<TermSort | null>(null);
  const [page, setPage] = useState(0);
  const options = useMemo(() => termFilterOptions(projection.terms), [projection.terms]);
  const filtered = useMemo(
    () => filterTerms(projection.terms, filters),
    [filters, projection.terms],
  );
  const sorted = useMemo(() => sortTerms(filtered, sort), [filtered, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => setPage((current) => Math.min(current, pages - 1)), [pages]);

  /** Advances one term column through ascending, descending, and source-order states. */
  const changeSort = (column: TermSortColumn) => {
    setSort((current) => {
      const previous = current?.column === column ? current : null;
      return previous?.direction === 'descending'
        ? null
        : { column, direction: previous ? 'descending' : 'ascending' };
    });
    setPage(0);
  };

  /** Applies term-local filters and returns to the first bounded result page. */
  const changeFilters = (next: typeof filters) => {
    setFilters(next);
    setPage(0);
  };

  const start = page * PAGE_SIZE;
  return (
    <section
      className={`center-view terms-view${active ? ' active' : ' inactive'}`}
      aria-label="ArcIR terms"
      aria-hidden={!active}
      inert={!active}
    >
      <div className="terms-toolbar">
        <label>
          <span className="visually-hidden">Search terms</span>
          <input
            type="search"
            value={filters.query}
            placeholder="Search terms…"
            onChange={(event) => changeFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <TermFilter
          label="Sources"
          values={options.sources}
          selected={filters.sources}
          display={(source) => source || 'Unspecified source'}
          onChange={(sources) => changeFilters({ ...filters, sources })}
        />
        <TermFilter<TermUsageRole>
          label="Roles"
          values={options.roles}
          selected={filters.roles}
          display={(role) => TERM_USAGE_LABELS[role]}
          onChange={(roles) => changeFilters({ ...filters, roles })}
        />
        <button
          type="button"
          className="secondary compact"
          disabled={!filters.query && filters.sources.size === 0 && filters.roles.size === 0}
          onClick={() => changeFilters(emptyTermFilters())}
        >
          Reset term filters
        </button>
        <span className="terms-count">
          {sorted.length} of {projection.terms.length} terms
        </span>
      </div>

      <div className="table-content terms-content">
        <table>
          <caption className="visually-hidden">Registered ArcIR terms</caption>
          <thead>
            <tr>
              <TermSortHeader column="name" label="Name" sort={sort} onSort={changeSort} />
              <TermSortHeader
                column="identifier"
                label="Identifier"
                sort={sort}
                onSort={changeSort}
              />
              <TermSortHeader column="source" label="Source" sort={sort} onSort={changeSort} />
              <TermSortHeader column="usageCount" label="Usages" sort={sort} onSort={changeSort} />
              <TermSortHeader column="roles" label="Roles" sort={sort} onSort={changeSort} />
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(start, start + PAGE_SIZE).map((term) => (
              <tr key={term.id}>
                <td>{term.name ?? term.label}</td>
                <td>
                  <IdentifierView value={term.id} label={term.name ?? term.label} />
                </td>
                <td>{term.source ?? '—'}</td>
                <td>{term.usageCount}</td>
                <td>
                  {term.usageRoles.length === 0
                    ? 'Unused'
                    : term.usageRoles.map((role) => TERM_USAGE_LABELS[role]).join(', ')}
                </td>
                <td>
                  <button
                    type="button"
                    className="compact"
                    aria-label={`Inspect term ${term.name ?? term.label}`}
                    onClick={() => onSelect({ kind: 'term', id: term.id })}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="empty-table">No terms match the current term filters.</p>
        )}
      </div>

      <nav className="table-pagination" aria-label="Term table pages">
        <button
          type="button"
          className="secondary compact"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button
          type="button"
          className="secondary compact"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </nav>
    </section>
  );
}
