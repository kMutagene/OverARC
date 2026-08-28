import { useEffect, useMemo, useState } from 'react';
import { IdentifierView } from '../../shared/IdentifierView';
import { identifierLabels } from '../../shared/identifierModel';
import type {
  GraphNode,
  GraphRelation,
  Projection,
  Selection,
  VisibleProjection,
} from '../../shared/types';

const PAGE_SIZE = 100;
const SORT_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Active object/relation dataset shown by the center table. */
type TableTab = 'objects' | 'relations';

/** Sort states exposed through the table header's aria-sort attribute. */
type SortDirection = 'ascending' | 'descending';

/** Sortable object-table columns; the Action column intentionally remains unsorted. */
type ObjectSortColumn = 'object' | 'kind' | 'types' | 'status' | 'flags';

/** Sortable relation-table columns; the Action column intentionally remains unsorted. */
type RelationSortColumn = 'relation' | 'subject' | 'predicate' | 'object' | 'status' | 'flags';

/** Column and direction selected for one table tab. */
interface SortConfiguration<TColumn extends string> {
  column: TColumn;
  direction: SortDirection;
}

/** Independent sort configuration retained while switching between object and relation tabs. */
interface TableSorts {
  objects: SortConfiguration<ObjectSortColumn> | null;
  relations: SortConfiguration<RelationSortColumn> | null;
}

/** Projection, visibility, activation, and selection inputs for the center table. */
interface GraphTableViewProps {
  projection: Projection;
  visible: VisibleProjection;
  active: boolean;
  onSelect: (selection: Selection) => void;
}

/** Renders fixed-height page navigation so only one bounded row window enters the DOM. */
function Pagination({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <nav className="table-pagination" aria-label="Table pages">
      <button
        type="button"
        className="secondary compact"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
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
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

/** Renders a full-cell sort button and announces the next action in the three-state cycle. */
function SortableHeader<TColumn extends string>({
  column,
  label,
  sort,
  onSort,
}: {
  column: TColumn;
  label: string;
  sort: SortConfiguration<TColumn> | null;
  onSort: (column: TColumn) => void;
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
        onClick={() => onSort(column)}
        aria-label={actionLabel}
      >
        <span>{label}</span>
        <span className={`table-sort-indicator${direction ? ' active' : ''}`} aria-hidden="true">
          {direction === 'ascending' ? '▲' : direction === 'descending' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  );
}

/** Compares display values in the requested direction and resolves ties by exact ID. */
function compareRows<T extends { id: string }>(
  left: T,
  right: T,
  direction: SortDirection,
  value: (row: T) => string,
) {
  const compared = SORT_COLLATOR.compare(value(left), value(right));
  if (compared !== 0) return direction === 'ascending' ? compared : -compared;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** Provides full-pane, paginated object and relation tables over the currently visible graph. */
export function GraphTableView({ projection, visible, active, onSelect }: GraphTableViewProps) {
  const [tab, setTab] = useState<TableTab>('objects');
  const [pages, setPages] = useState<Record<TableTab, number>>({ objects: 0, relations: 0 });
  const [sorts, setSorts] = useState<TableSorts>({ objects: null, relations: null });
  const labels = useMemo(() => identifierLabels(projection), [projection]);
  const nodes = useMemo(
    () => projection.nodes.filter((node) => visible.nodeStatus.has(node.id)),
    [projection, visible],
  );
  const relations = useMemo(
    () => projection.relations.filter((relation) => visible.relationStatus.has(relation.id)),
    [projection, visible],
  );
  const sortedNodes = useMemo(() => {
    const sort = sorts.objects;
    if (!sort) return nodes;
    // Resolve each sortable column to the exact text presented to curators.
    const value = (node: GraphNode) => {
      switch (sort.column) {
        case 'object':
          return node.label;
        case 'kind':
          return node.kind ?? '';
        case 'types':
          return node.typeIds.map((id) => labels.get(id) ?? id).join(', ');
        case 'status':
          return visible.nodeStatus.get(node.id) ?? '';
        case 'flags':
          return node.isPlaceholder ? 'Missing endpoint' : '';
      }
    };
    return [...nodes].sort((left, right) => compareRows(left, right, sort.direction, value));
  }, [labels, nodes, sorts.objects, visible.nodeStatus]);
  const sortedRelations = useMemo(() => {
    const sort = sorts.relations;
    if (!sort) return relations;
    // Endpoint and predicate sorting use projection labels with exact-ID fallbacks.
    const value = (relation: GraphRelation) => {
      switch (sort.column) {
        case 'relation':
          return relation.label;
        case 'subject':
          return labels.get(relation.subject) ?? relation.subject;
        case 'predicate':
          return labels.get(relation.predicateId) ?? relation.predicateId;
        case 'object':
          return labels.get(relation.object) ?? relation.object;
        case 'status':
          return visible.relationStatus.get(relation.id) ?? '';
        case 'flags':
          return relation.isDerived ? 'Derived reference' : 'ArcRelation';
      }
    };
    return [...relations].sort((left, right) => compareRows(left, right, sort.direction, value));
  }, [labels, relations, sorts.relations, visible.relationStatus]);

  useEffect(() => {
    setPages((current) => ({
      objects: Math.min(current.objects, Math.max(0, Math.ceil(nodes.length / PAGE_SIZE) - 1)),
      relations: Math.min(
        current.relations,
        Math.max(0, Math.ceil(relations.length / PAGE_SIZE) - 1),
      ),
    }));
  }, [nodes.length, relations.length]);

  const page = pages[tab];
  /** Changes only the active tab's page while retaining the other tab's position. */
  const setPage = (next: number) => setPages((current) => ({ ...current, [tab]: next }));

  /** Advances an object column through ascending, descending, and source-order states. */
  const sortObjects = (column: ObjectSortColumn) => {
    setSorts((current) => {
      const previous = current.objects?.column === column ? current.objects : null;
      return {
        ...current,
        objects:
          previous?.direction === 'descending'
            ? null
            : { column, direction: previous ? 'descending' : 'ascending' },
      };
    });
    setPages((current) => ({ ...current, objects: 0 }));
  };

  /** Advances a relation column through ascending, descending, and source-order states. */
  const sortRelations = (column: RelationSortColumn) => {
    setSorts((current) => {
      const previous = current.relations?.column === column ? current.relations : null;
      return {
        ...current,
        relations:
          previous?.direction === 'descending'
            ? null
            : { column, direction: previous ? 'descending' : 'ascending' },
      };
    });
    setPages((current) => ({ ...current, relations: 0 }));
  };
  const start = page * PAGE_SIZE;

  return (
    <section
      className={`center-view table-view${active ? ' active' : ' inactive'}`}
      aria-label="Visible graph table"
      aria-hidden={!active}
      inert={!active}
    >
      <div className="table-tabs" role="tablist" aria-label="Graph table content">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'objects'}
          className={tab === 'objects' ? 'active' : 'secondary'}
          onClick={() => setTab('objects')}
        >
          Objects <span>{nodes.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'relations'}
          className={tab === 'relations' ? 'active' : 'secondary'}
          onClick={() => setTab('relations')}
        >
          Relations <span>{relations.length}</span>
        </button>
      </div>

      <div className="table-content" role="tabpanel">
        {tab === 'objects' ? (
          <table>
            <caption className="visually-hidden">Visible ArcIR objects</caption>
            <thead>
              <tr>
                <SortableHeader
                  column="object"
                  label="Object"
                  sort={sorts.objects}
                  onSort={sortObjects}
                />
                <SortableHeader
                  column="kind"
                  label="Kind"
                  sort={sorts.objects}
                  onSort={sortObjects}
                />
                <SortableHeader
                  column="types"
                  label="Types"
                  sort={sorts.objects}
                  onSort={sortObjects}
                />
                <SortableHeader
                  column="status"
                  label="Status"
                  sort={sorts.objects}
                  onSort={sortObjects}
                />
                <SortableHeader
                  column="flags"
                  label="Flags"
                  sort={sorts.objects}
                  onSort={sortObjects}
                />
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedNodes.slice(start, start + PAGE_SIZE).map((node) => (
                <tr key={node.id}>
                  <td>
                    <IdentifierView value={node.id} labels={labels} label={node.label} />
                  </td>
                  <td>{node.kind ?? '—'}</td>
                  <td>
                    {node.typeIds.length === 0
                      ? '—'
                      : node.typeIds.map((id) => labels.get(id) ?? id).join(', ')}
                  </td>
                  <td>{visible.nodeStatus.get(node.id)}</td>
                  <td>{node.isPlaceholder ? 'Missing endpoint' : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="compact"
                      onClick={() => onSelect({ kind: 'object', id: node.id })}
                      aria-label={`Inspect object ${node.label}`}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <caption className="visually-hidden">Visible ArcIR relations</caption>
            <thead>
              <tr>
                <SortableHeader
                  column="relation"
                  label="Relation"
                  sort={sorts.relations}
                  onSort={sortRelations}
                />
                <SortableHeader
                  column="subject"
                  label="Subject"
                  sort={sorts.relations}
                  onSort={sortRelations}
                />
                <SortableHeader
                  column="predicate"
                  label="Predicate"
                  sort={sorts.relations}
                  onSort={sortRelations}
                />
                <SortableHeader
                  column="object"
                  label="Object"
                  sort={sorts.relations}
                  onSort={sortRelations}
                />
                <SortableHeader
                  column="status"
                  label="Status"
                  sort={sorts.relations}
                  onSort={sortRelations}
                />
                <SortableHeader
                  column="flags"
                  label="Flags"
                  sort={sorts.relations}
                  onSort={sortRelations}
                />
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedRelations.slice(start, start + PAGE_SIZE).map((relation) => (
                <tr key={relation.id}>
                  <td>
                    <IdentifierView value={relation.id} labels={labels} label={relation.label} />
                  </td>
                  <td>
                    <IdentifierView value={relation.subject} labels={labels} />
                  </td>
                  <td>
                    <IdentifierView value={relation.predicateId} labels={labels} />
                  </td>
                  <td>
                    <IdentifierView value={relation.object} labels={labels} />
                  </td>
                  <td>{visible.relationStatus.get(relation.id)}</td>
                  <td>{relation.isDerived ? 'Derived reference' : 'ArcRelation'}</td>
                  <td>
                    <button
                      type="button"
                      className="compact"
                      onClick={() => onSelect({ kind: 'relation', id: relation.id })}
                      aria-label={`Inspect relation ${relation.label}`}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(tab === 'objects' ? nodes.length : relations.length) === 0 && (
          <p className="empty-table">No visible {tab} match the current filters.</p>
        )}
      </div>

      <Pagination
        page={page}
        count={tab === 'objects' ? nodes.length : relations.length}
        onPage={setPage}
      />
    </section>
  );
}
