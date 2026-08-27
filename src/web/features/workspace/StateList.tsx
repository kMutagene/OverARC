import type { Workspace } from '../../shared/types';

interface StateListProps {
  workspace: Workspace | null;
  activeState: string | null;
  onChooseState: (id: string) => void;
  onRefresh: () => void;
}

export function StateList({ workspace, activeState, onChooseState, onRefresh }: StateListProps) {
  return (
    <section>
      <div className="section-heading">
        <h2>States</h2>
        <button
          type="button"
          className="outline compact"
          onClick={onRefresh}
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
            onClick={() => onChooseState(state.id)}
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
  );
}
