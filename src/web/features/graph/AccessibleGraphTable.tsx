import type { Projection, Selection, VisibleProjection } from '../../shared/types';

interface AccessibleGraphTableProps {
  projection: Projection;
  visible: VisibleProjection;
  onSelect: (selection: Selection) => void;
}

export function AccessibleGraphTable({ projection, visible, onSelect }: AccessibleGraphTableProps) {
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
