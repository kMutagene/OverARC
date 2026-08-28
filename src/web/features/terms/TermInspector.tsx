import { useEffect, useMemo, useState } from 'react';
import { IdentifierView } from '../../shared/IdentifierView';
import type { TermDetail, TermUsageRole } from '../../shared/types';
import { TERM_USAGE_LABELS } from './termModel';

const USAGE_PAGE_SIZE = 100;

/** Exact term detail and clear-selection callback required by the right inspector pane. */
interface TermInspectorProps {
  detail: TermDetail;
  onClear?: () => void;
}

/** Renders one selected term definition and a bounded, complete path through all usage occurrences. */
export function TermInspector({ detail, onClear }: TermInspectorProps) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(detail.usages.length / USAGE_PAGE_SIZE));
  const roleCounts = useMemo(() => {
    const counts = new Map<TermUsageRole, number>();
    detail.usages.forEach((usage) => counts.set(usage.role, (counts.get(usage.role) ?? 0) + 1));
    return counts;
  }, [detail.usages]);
  const pageUsages = detail.usages.slice(page * USAGE_PAGE_SIZE, (page + 1) * USAGE_PAGE_SIZE);
  const groups = detail.usageRoles
    .map((role) => ({ role, usages: pageUsages.filter((usage) => usage.role === role) }))
    .filter((group) => group.usages.length > 0);

  useEffect(() => setPage(0), [detail.id]);
  useEffect(() => setPage((current) => Math.min(current, pages - 1)), [pages]);

  return (
    <aside className="inspector term-inspector" aria-label="Term inspector">
      <header className="inspector-header">
        <div>
          <span className="eyebrow">Ontology term</span>
          <h2>{detail.name ?? detail.label}</h2>
        </div>
        {onClear && (
          <button
            type="button"
            className="outline compact"
            onClick={onClear}
            aria-label="Clear selection"
          >
            ×
          </button>
        )}
      </header>

      <dl className="inspector-summary">
        <dt>Source</dt>
        <dd>{detail.source ?? 'Not specified'}</dd>
        <dt>Usages</dt>
        <dd>{detail.usageCount}</dd>
        <dt>Roles</dt>
        <dd>
          {detail.usageRoles.length === 0
            ? 'Unused'
            : detail.usageRoles
                .map((role) => `${TERM_USAGE_LABELS[role]} (${roleCounts.get(role) ?? 0})`)
                .join(', ')}
        </dd>
      </dl>

      <details className="technical-details">
        <summary>Technical details</summary>
        <dl>
          <dt>Exact IRI</dt>
          <dd>
            <IdentifierView value={detail.id} label={detail.name ?? detail.label} exact />
          </dd>
          <dt>Selector</dt>
          <dd>
            <code>{detail.selector}</code>
          </dd>
        </dl>
      </details>

      <section className="term-usages" aria-labelledby="term-usages-heading">
        <h3 id="term-usages-heading">Usage occurrences</h3>
        {detail.usages.length === 0 ? (
          <p>This term is registered in the state but is not currently used.</p>
        ) : (
          <>
            {groups.map((group) => (
              <details className="inspector-section" key={group.role} open>
                <summary>
                  <h3>{TERM_USAGE_LABELS[group.role]}</h3>{' '}
                  <small>{roleCounts.get(group.role) ?? 0}</small>
                </summary>
                {group.usages.map((usage, index) => (
                  <article
                    key={`${usage.ownerId}\n${usage.occurrenceId}\n${usage.selector}\n${index}`}
                  >
                    <IdentifierView value={usage.ownerId} label={usage.ownerLabel} />
                    <p className="term-usage-kind">{usage.ownerKind}</p>
                    <details className="technical-details">
                      <summary>Occurrence details</summary>
                      <dl>
                        <dt>Occurrence ID</dt>
                        <dd>
                          <IdentifierView value={usage.occurrenceId} exact />
                        </dd>
                        <dt>Selector</dt>
                        <dd>
                          <code>{usage.selector}</code>
                        </dd>
                      </dl>
                    </details>
                  </article>
                ))}
              </details>
            ))}
            <nav className="term-usage-pagination" aria-label="Term usage pages">
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
          </>
        )}
      </section>
    </aside>
  );
}
