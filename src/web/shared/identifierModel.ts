import type { Projection } from './types';

/** Read-only exact-IRI-to-curator-label lookup built from the active projection. */
export type IdentifierLabels = ReadonlyMap<string, string>;

const HASH_PATTERN = /^[0-9a-f]{32,}$/i;
const KNOWN_NAMESPACES: ReadonlyArray<readonly [string, string]> = [
  ['urn:biofsharp:insdc:object:', 'INSDC object'],
  ['urn:biofsharp:arcir:assertion:', 'ArcIR assertion'],
  ['urn:biofsharp:arcir:relation:', 'ArcIR relation'],
  ['urn:overarc:view:reference:', 'Derived reference'],
];

/** Decodes percent-encoded identifier suffixes without throwing on malformed input. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Preserves the recognizable beginning and end of long unknown identifiers. */
function middleEllipsis(value: string, maximum = 44): string {
  if (value.length <= maximum) return value;
  const tail = 12;
  return `${value.slice(0, maximum - tail - 1)}…${value.slice(-tail)}`;
}

/** Shortens a namespace suffix, using a stable first/last form for hash identities. */
function compactSuffix(value: string): string {
  const decoded = safeDecode(value);
  return HASH_PATTERN.test(decoded)
    ? `${decoded.slice(0, 8)}…${decoded.slice(-6)}`
    : middleEllipsis(decoded, 38);
}

/** Creates a deterministic display form for known URNs, HTTP IRIs, and arbitrary identifiers. */
export function compactIdentifier(value: string): string {
  for (const [namespace, label] of KNOWN_NAMESPACES) {
    if (value.startsWith(namespace))
      return `${label} · ${compactSuffix(value.slice(namespace.length))}`;
  }

  if (/^https?:/i.test(value)) {
    try {
      const url = new URL(value);
      const local =
        url.hash.slice(1) || url.pathname.split('/').filter(Boolean).at(-1) || url.hostname;
      return `${url.hostname} · ${compactSuffix(local)}`;
    } catch {
      return middleEllipsis(value);
    }
  }

  if (value.length <= 44) return value;

  const firstColon = value.indexOf(':');
  if (firstColon > 0) {
    const namespace = value.slice(0, firstColon);
    const local =
      value
        .slice(firstColon + 1)
        .split(':')
        .at(-1) ?? value;
    return `${namespace} · ${compactSuffix(local)}`;
  }

  const cut = Math.max(value.lastIndexOf('#'), value.lastIndexOf('/'));
  return cut >= 0 ? compactSuffix(value.slice(cut + 1)) : middleEllipsis(value);
}

/** Collects curator labels for terms and real objects while leaving unresolved placeholders explicit. */
export function identifierLabels(projection: Projection | null): IdentifierLabels {
  const labels = new Map<string, string>();
  projection?.terms.forEach((term) => labels.set(term.id, term.label));
  projection?.nodes.forEach((node) => {
    if (!node.isPlaceholder || node.label !== node.id) labels.set(node.id, node.label);
  });
  return labels;
}

/** Selects primary and optional secondary identifier text without changing the exact underlying value. */
export function identifierPresentation(
  value: string,
  labels: IdentifierLabels,
  preferredLabel?: string | null,
) {
  const compact = compactIdentifier(value);
  const candidate = preferredLabel?.trim() || labels.get(value)?.trim();
  const primary = candidate && candidate !== value ? candidate : compact;
  return { primary, secondary: primary === compact ? null : compact };
}
