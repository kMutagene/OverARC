import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const workspaceKey = createHash('sha256').update(resolve('.')).digest('hex').slice(0, 12);

/** Isolated native workspace used only by the dedicated curation browser run. */
export const curationWorkspace = resolve(tmpdir(), `overarc-curation-playwright-${workspaceKey}`);

/** Copies the immutable editable fixture and adds a second current state for switch-guard tests. */
export function prepareCurationWorkspace() {
  rmSync(curationWorkspace, { recursive: true, force: true });
  mkdirSync(dirname(curationWorkspace), { recursive: true });
  cpSync(resolve('tests/fixtures/editable-workspace'), curationWorkspace, { recursive: true });

  const firstState = resolve(curationWorkspace, 'arcir/states/state-a.arcir.json');
  const secondState = resolve(curationWorkspace, 'arcir/states/state-b.arcir.json');
  const stateBytes = readFileSync(firstState);
  writeFileSync(secondState, stateBytes);
  const stateDigest = createHash('sha256').update(stateBytes).digest('hex');
  const mappingBytes = readFileSync(resolve(curationWorkspace, 'mappings/state-a.sssom.tsv'));
  const mappingDigest = createHash('sha256').update(mappingBytes).digest('hex');

  writeFileSync(
    resolve(curationWorkspace, 'arc.yml'),
    `type: Dataset
identifier: overarc-editable-browser-workspace
title: OverARC editable browser workspace
description: Temporary native ARC lineage for curation browser verification.
dataFiles:
  - type: Data
    path: arcir/states/state-a.arcir.json
    additionalType: ArcIR state
    encodingFormat: application/json
    additionalProperty:
      - type: Annotation
        name: sha256
        value: ${stateDigest}
  - type: Data
    path: arcir/states/state-b.arcir.json
    additionalType: ArcIR state
    encodingFormat: application/json
    additionalProperty:
      - type: Annotation
        name: sha256
        value: ${stateDigest}
  - type: Data
    path: mappings/state-a.sssom.tsv
    additionalType: SSSOM mapping set
    encodingFormat: text/tab-separated-values
    additionalProperty:
      - type: Annotation
        name: sha256
        value: ${mappingDigest}
`,
    'utf8',
  );
}

/** Removes only this repository's exact generated browser workspace. */
export function removeCurationWorkspace() {
  rmSync(curationWorkspace, { recursive: true, force: true });
}
