import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { buildGraph, filterOptions, objectKindColor, visibleCsv, visibleProjection } from './graph';
import { GraphCanvas } from './GraphCanvas';
import { Inspector } from './Inspector';
import type { ElementDetail, Filters, Projection, VisibleProjection, Workspace } from './types';

const emptyFilters = (): Filters => ({
  query: '',
  kinds: new Set(),
  types: new Set(),
  predicates: new Set(),
  context: true,
});

function updateUrl(stateId: string) {
  window.history.replaceState(null, '', `?state=${encodeURIComponent(stateId)}`);
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

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

function AccessibleGraphTable({
  projection,
  visible,
  onSelect,
}: {
  projection: Projection;
  visible: VisibleProjection;
  onSelect: (selection: { kind: 'object' | 'relation'; id: string }) => void;
}) {
  return (
    <details className="graph-table">
      <summary>Accessible visible graph table</summary>
      <h3>Objects</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Exact ID</th>
            </tr>
          </thead>
          <tbody>
            {projection.nodes
              .filter((node) => visible.nodeStatus.has(node.id))
              .map((node) => (
                <tr key={node.id}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onSelect({ kind: 'object', id: node.id })}
                    >
                      {node.label}
                    </button>
                  </td>
                  <td>{node.kind ?? 'placeholder'}</td>
                  <td>{visible.nodeStatus.get(node.id)}</td>
                  <td>
                    <code>{node.id}</code>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <h3>Relations</h3>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Label</th>
              <th>Status</th>
              <th>Subject</th>
              <th>Object</th>
            </tr>
          </thead>
          <tbody>
            {projection.relations
              .filter((relation) => visible.relationStatus.has(relation.id))
              .map((relation) => (
                <tr key={relation.id}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onSelect({ kind: 'relation', id: relation.id })}
                    >
                      {relation.label}
                    </button>
                  </td>
                  <td>{visible.relationStatus.get(relation.id)}</td>
                  <td>
                    <code>{relation.subject}</code>
                  </td>
                  <td>
                    <code>{relation.object}</code>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeState, setActiveState] = useState<string | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<{ kind: 'object' | 'relation'; id: string } | null>(
    null,
  );
  const [detail, setDetail] = useState<ElementDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetToken, setResetToken] = useState(0);

  const loadWorkspace = useCallback(async (refresh = false) => {
    setError(null);
    try {
      const next = refresh ? await api.refresh() : await api.workspace();
      setWorkspace(next);
      const valid = new Set(
        next.states.filter((state) => state.status === 'valid').map((state) => state.id),
      );
      const requested = new URLSearchParams(window.location.search).get('state');
      setActiveState((current) => {
        const chosen =
          (current && valid.has(current) ? current : null) ??
          (requested && valid.has(requested) ? requested : null) ??
          next.defaultStateId;
        if (chosen) updateUrl(chosen);
        return chosen;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);
  useEffect(() => {
    if (!activeState) {
      setProjection(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelected(null);
    setDetail(null);
    setResetToken((value) => value + 1);
    performance.mark('overarc-projection-start');
    void api
      .projection(activeState)
      .then((next) => {
        if (cancelled) return;
        setProjection(next);
        performance.mark('overarc-projection-end');
        performance.measure(
          'overarc-projection',
          'overarc-projection-start',
          'overarc-projection-end',
        );
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeState]);

  useEffect(() => {
    if (!activeState || !selected) {
      setDetail(null);
      setDetailLoading(false);
      return;
    }
    if (selected.kind === 'relation') {
      const relation = projection?.relations.find((candidate) => candidate.id === selected.id);
      if (relation?.isDerived) {
        setError(null);
        setDetail({
          kind: 'relation',
          id: relation.id,
          label: 'ArcValue.Ref reference',
          selector: relation.selector ?? '',
          isDerivedReference: true,
          subject: relation.subject,
          predicateId: relation.predicateId,
          predicateLabel:
            projection?.terms.find((term) => term.id === relation.predicateId)?.label ??
            relation.predicateId,
          object: relation.object,
          types: [],
          properties: [],
          annotations: [],
        });
        setDetailLoading(false);
        return;
      }
    }
    if (selected.kind === 'object') {
      const node = projection?.nodes.find((candidate) => candidate.id === selected.id);
      if (node?.isPlaceholder) {
        setError(null);
        const placeholderReferences =
          projection?.relations
            .filter(
              (relation) => relation.subject === selected.id || relation.object === selected.id,
            )
            .map((relation) => ({
              relationId: relation.id,
              relationLabel: relation.label,
              endpoint:
                relation.subject === selected.id && relation.object === selected.id
                  ? ('subject and object' as const)
                  : relation.subject === selected.id
                    ? ('subject' as const)
                    : ('object' as const),
              otherId: relation.subject === selected.id ? relation.object : relation.subject,
            })) ?? [];
        setDetail({
          kind: 'object',
          id: node.id,
          label: node.label,
          selector: '',
          isPlaceholder: true,
          placeholderReferences,
          types: [],
          properties: [],
          annotations: [],
        });
        setDetailLoading(false);
        return;
      }
    }
    let cancelled = false;
    setDetailLoading(true);
    void api
      .details(activeState, selected.kind, selected.id)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeState, projection, selected]);

  const visible = useMemo(
    () =>
      projection
        ? visibleProjection(projection, filters)
        : { nodeStatus: new Map(), relationStatus: new Map() },
    [filters, projection],
  );
  const graph = useMemo(
    () => (projection ? buildGraph(projection, visible) : null),
    [projection, visible],
  );
  const options = useMemo(
    () => (projection ? filterOptions(projection) : { kinds: [], types: [], predicates: [] }),
    [projection],
  );
  const termLabels = useMemo(
    () => new Map(projection?.terms.map((term) => [term.id, term.label]) ?? []),
    [projection],
  );

  const chooseState = (id: string) => {
    setActiveState(id);
    updateUrl(id);
  };
  const selectGraphElement = useCallback(
    (selection: { kind: 'object' | 'relation'; id: string } | null) => {
      setError(null);
      setSelected(selection);
    },
    [],
  );
  const exportCsv = () => {
    if (!projection) return;
    const csv = visibleCsv(projection, visible);
    download(`${activeState}-nodes.csv`, csv.nodes, 'text/csv;charset=utf-8');
    download(`${activeState}-relations.csv`, csv.relations, 'text/csv;charset=utf-8');
  };

  return (
    <main className="workbench">
      <aside className="sidebar" aria-label="Workspace and filters">
        <header>
          <p className="eyebrow">Read-only ArcIR workbench</p>
          <h1>OverARC</h1>
          <p>{workspace?.name ?? 'Loading workspace…'}</p>
        </header>
        <section>
          <div className="section-heading">
            <h2>States</h2>
            <button
              type="button"
              className="outline compact"
              onClick={() => void loadWorkspace(true)}
              aria-label="Refresh workspace"
            >
              ↻ Refresh
            </button>
          </div>
          <nav className="state-list" aria-label="Workspace states">
            {workspace?.states.map((state) => (
              <button
                type="button"
                key={state.id}
                className={state.id === activeState ? 'active' : ''}
                disabled={state.status !== 'valid'}
                onClick={() => chooseState(state.id)}
              >
                <span>{state.label}</span>
                <small>
                  {state.status === 'valid'
                    ? `${state.objectCount} objects · ${state.relationCount} relations`
                    : state.status}
                </small>
                {state.errors.map((message) => (
                  <small className="state-error" key={message}>
                    {message}
                  </small>
                ))}
              </button>
            ))}
          </nav>
        </section>
        <section>
          <h2>Find and filter</h2>
          <label>
            Search
            <input
              type="search"
              value={filters.query}
              placeholder="IRI, label, value…"
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              role="switch"
              checked={filters.context}
              onChange={(event) => setFilters({ ...filters, context: event.target.checked })}
            />{' '}
            One-hop context
          </label>
          <ToggleGroup
            title="Object kind"
            values={options.kinds}
            selected={filters.kinds}
            onChange={(kinds) => setFilters({ ...filters, kinds })}
          />
          <ToggleGroup
            title="Object type"
            values={options.types}
            selected={filters.types}
            labels={termLabels}
            onChange={(types) => setFilters({ ...filters, types })}
          />
          <ToggleGroup
            title="Relation predicate"
            values={options.predicates}
            selected={filters.predicates}
            labels={termLabels}
            onChange={(predicates) => setFilters({ ...filters, predicates })}
          />
          <button type="button" className="secondary" onClick={() => setFilters(emptyFilters())}>
            Reset filters
          </button>
        </section>
        <section>
          <h2>Visible graph</h2>
          <p>
            <strong>{visible.nodeStatus.size}</strong> objects ·{' '}
            <strong>{visible.relationStatus.size}</strong> relations
          </p>
          <h3 className="legend-heading">ArcIR object kinds</h3>
          <div className="legend" aria-label="ArcIR object kind colors">
            {options.kinds.map((kind) => (
              <span key={kind}>
                <i style={{ backgroundColor: objectKindColor(kind) }} /> {kind}
              </span>
            ))}
            {projection?.nodes.some((node) => node.isPlaceholder) && (
              <span>
                <i style={{ backgroundColor: objectKindColor(null) }} /> unresolved ID
              </span>
            )}
          </div>
          <p className="legend-note">
            Dimmed nodes provide one-hop context. Solid arrows are ArcRelations;{' '}
            <span className="reference-line" /> purple arrows are view-only ArcValue.Ref links.
          </p>
          <button type="button" className="secondary" disabled={!projection} onClick={exportCsv}>
            Export CSV pair
          </button>
        </section>
      </aside>
      <section className="graph-pane" aria-label="Graph view">
        {error && (
          <div role="alert" className="error-banner">
            <strong>Unable to load</strong>
            <br />
            {error}
          </div>
        )}
        {loading && (
          <div className="loading" aria-busy="true">
            Loading ArcIR graph…
          </div>
        )}
        {!loading && graph && projection && (
          <>
            <GraphCanvas
              graph={graph}
              resetToken={resetToken}
              selected={selected}
              onSelect={selectGraphElement}
            />
            <AccessibleGraphTable
              projection={projection}
              visible={visible}
              onSelect={selectGraphElement}
            />
          </>
        )}
        {!loading && !graph && !error && (
          <div className="loading">No valid state is available.</div>
        )}
      </section>
      <Inspector detail={detail} loading={detailLoading} onClear={() => setSelected(null)} />
    </main>
  );
}
