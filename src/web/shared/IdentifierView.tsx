import { useState } from 'react';
import { identifierPresentation, type IdentifierLabels } from './identifierModel';

interface IdentifierViewProps {
  value: string;
  labels?: IdentifierLabels;
  label?: string | null;
  exact?: boolean;
}

async function copyExact(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function IdentifierView({
  value,
  labels = new Map(),
  label,
  exact = false,
}: IdentifierViewProps) {
  const [copied, setCopied] = useState(false);
  const presentation = identifierPresentation(value, labels, label);
  return (
    <span className={`identifier-view${exact ? ' exact' : ''}`} title={value}>
      <span className="identifier-text">
        {exact ? (
          <code>{value}</code>
        ) : (
          <>
            <span className="identifier-primary">{presentation.primary}</span>
            {presentation.secondary && (
              <code className="identifier-secondary">{presentation.secondary}</code>
            )}
          </>
        )}
      </span>
      <span className="identifier-actions">
        <button
          type="button"
          className="identifier-action"
          aria-label={`Copy exact identifier for ${presentation.primary}`}
          title="Copy exact identifier"
          onClick={() => {
            void copyExact(value).then(() => setCopied(true));
          }}
        >
          {copied ? '✓' : '⧉'}
        </button>
        {/^(https?:)/i.test(value) && (
          <a
            className="identifier-action"
            href={value}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open IRI for ${presentation.primary} in a new tab`}
            title="Open IRI in a new tab; dereferencing is not guaranteed"
          >
            ↗
          </a>
        )}
      </span>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Exact identifier copied.' : ''}
      </span>
    </span>
  );
}
