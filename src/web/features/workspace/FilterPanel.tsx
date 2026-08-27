import type { Filters } from '../../shared/types';
import { emptyFilters } from './filterModel';

function ToggleGroup({
  title,
  values,
  selected,
  labels,
  onChange,
}: {
  title: string;
  values: string[];
  selected: Set<string>;
  labels?: Map<string, string>;
  onChange: (next: Set<string>) => void;
}) {
  if (values.length === 0) return null;
  return (
    <fieldset>
      <legend>{title}</legend>
      {values.map((value) => (
        <label key={value}>
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
          {labels?.get(value) ?? value}
        </label>
      ))}
    </fieldset>
  );
}

interface FilterPanelProps {
  filters: Filters;
  options: { kinds: string[]; types: string[]; predicates: string[] };
  termLabels: Map<string, string>;
  onChange: (filters: Filters) => void;
}

export function FilterPanel({ filters, options, termLabels, onChange }: FilterPanelProps) {
  return (
    <section>
      <h2>Find and filter</h2>
      <label>
        Search
        <input
          type="search"
          value={filters.query}
          placeholder="IRI, label, value…"
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          role="switch"
          checked={filters.context}
          onChange={(event) => onChange({ ...filters, context: event.target.checked })}
        />{' '}
        One-hop context
      </label>
      <ToggleGroup
        title="Object kind"
        values={options.kinds}
        selected={filters.kinds}
        onChange={(kinds) => onChange({ ...filters, kinds })}
      />
      <ToggleGroup
        title="Object type"
        values={options.types}
        selected={filters.types}
        labels={termLabels}
        onChange={(types) => onChange({ ...filters, types })}
      />
      <ToggleGroup
        title="Relation predicate"
        values={options.predicates}
        selected={filters.predicates}
        labels={termLabels}
        onChange={(predicates) => onChange({ ...filters, predicates })}
      />
      <button type="button" className="secondary" onClick={() => onChange(emptyFilters())}>
        Reset filters
      </button>
    </section>
  );
}
