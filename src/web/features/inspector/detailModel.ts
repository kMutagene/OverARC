import type { ElementDetail, Projection, Selection } from '../../shared/types';

/** Builds inspector details locally for projection-only placeholders and ArcValue.Ref edges. */
export function projectedDetail(
  projection: Projection | null,
  selection: Selection,
): ElementDetail | undefined {
  if (selection.kind === 'relation') {
    const relation = projection?.relations.find((candidate) => candidate.id === selection.id);
    if (relation?.isDerived) {
      return {
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
      };
    }
  }

  if (selection.kind === 'object') {
    const node = projection?.nodes.find((candidate) => candidate.id === selection.id);
    if (node?.isPlaceholder) {
      const placeholderReferences =
        projection?.relations
          .filter(
            (relation) => relation.subject === selection.id || relation.object === selection.id,
          )
          .map((relation) => ({
            relationId: relation.id,
            relationLabel: relation.label,
            endpoint:
              relation.subject === selection.id && relation.object === selection.id
                ? ('subject and object' as const)
                : relation.subject === selection.id
                  ? ('subject' as const)
                  : ('object' as const),
            otherId: relation.subject === selection.id ? relation.object : relation.subject,
          })) ?? [];
      return {
        kind: 'object',
        id: node.id,
        label: node.label,
        selector: '',
        isPlaceholder: true,
        placeholderReferences,
        types: [],
        properties: [],
        annotations: [],
      };
    }
  }

  return undefined;
}
