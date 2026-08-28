import { useEffect, useMemo, useRef, useState } from 'react';
import type { CurationDraft, LiteralOccurrence, Mappings, Term } from '../../shared/types';
import { filterTerms } from '../terms/termModel';

const PREDICATES = [
  'skos:exactMatch',
  'skos:closeMatch',
  'skos:broadMatch',
  'skos:narrowMatch',
  'skos:relatedMatch',
] as const;

/** Finds targets already mapped from the exact source literal for ambiguity context. */
function targetsForLiteral(mappings: Mappings | null, literal: string): string[] {
  if (!mappings) return [];
  return mappings.mappings
    .filter((mapping) =>
      mapping.fields.some(
        (field) => field.name === 'subject_label' && field.values.includes(literal),
      ),
    )
    .flatMap((mapping) => mapping.fields.find((field) => field.name === 'object_id')?.values ?? []);
}

/** Accessible modal for mapping one exact supported literal occurrence to a registered term. */
export function MappingDialog({
  occurrence,
  terms,
  mappings,
  draft,
  error,
  submitting,
  onCancel,
  onSubmit,
}: {
  occurrence: LiteralOccurrence;
  terms: Term[];
  mappings: Mappings | null;
  draft: CurationDraft | null;
  error: string | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (targetTermId: string, predicateId: string, curator: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [predicate, setPredicate] = useState<(typeof PREDICATES)[number]>('skos:exactMatch');
  const [curator, setCurator] = useState(draft?.curator ?? '');
  const visibleTerms = useMemo(
    () => filterTerms(terms, { query, sources: new Set(), roles: new Set() }).slice(0, 100),
    [query, terms],
  );
  const existingTargets = useMemo(
    () => [...new Set(targetsForLiteral(mappings, occurrence.literal))],
    [mappings, occurrence.literal],
  );

  // Native modal behavior provides focus trapping and Escape cancellation; cleanup restores prior focus.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeDialog = dialog.current;
    activeDialog?.showModal();
    search.current?.focus();
    return () => {
      if (activeDialog?.open) activeDialog.close();
      previous?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="curation-dialog mapping-dialog"
      aria-labelledby="mapping-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (selected) onSubmit(selected, predicate, curator.trim());
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Selected occurrence</span>
            <h2 id="mapping-dialog-title">Map literal to registered term</h2>
          </div>
          <button
            type="button"
            className="outline compact"
            onClick={onCancel}
            aria-label="Cancel mapping"
          >
            ×
          </button>
        </header>
        <dl className="mapping-source">
          <dt>Context</dt>
          <dd>{occurrence.context}</dd>
          <dt>Exact literal</dt>
          <dd>{occurrence.literal}</dd>
          <dt>Selector</dt>
          <dd>
            <code>{occurrence.selector}</code>
          </dd>
        </dl>
        {existingTargets.length > 0 && (
          <div className="mapping-warning" role="status">
            This literal already maps to: {existingTargets.join(', ')}. Another target is allowed
            and will remain visible.
          </div>
        )}
        {!draft && (
          <label>
            Curator
            <input
              required
              value={curator}
              onChange={(event) => setCurator(event.target.value)}
              placeholder="name or identifier"
            />
          </label>
        )}
        <label>
          Predicate
          <select
            value={predicate}
            onChange={(event) => setPredicate(event.target.value as typeof predicate)}
          >
            {PREDICATES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Search registered terms
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="name, source, or exact IRI"
          />
        </label>
        <fieldset className="mapping-term-results">
          <legend>Target term</legend>
          {visibleTerms.map((term) => (
            <label key={term.id} className={selected === term.id ? 'selected' : ''}>
              <input
                type="radio"
                name="target-term"
                value={term.id}
                checked={selected === term.id}
                onChange={() => setSelected(term.id)}
              />
              <span>
                <strong>{term.name ?? term.label}</strong>
                <code>{term.id}</code>
              </span>
            </label>
          ))}
          {visibleTerms.length === 0 && <p>No registered terms match this search.</p>}
        </fieldset>
        {error && (
          <div className="dialog-error" role="alert">
            {error}
          </div>
        )}
        <footer>
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || !selected || (!draft && !curator.trim())}>
            {submitting ? 'Applying…' : 'Map selected occurrence'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
