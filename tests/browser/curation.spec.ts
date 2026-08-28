import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { curationWorkspace } from './curationWorkspace';

const literal = 'Fictional Arabidopsis temperature study';
const targetTerm = 'urn:overarc:term:project';

interface BrowserState {
  id: string;
  relativePath: string;
  status: string;
  editable?: boolean;
  mappingArtifact?: { relativePath: string };
}

interface BrowserWorkspace {
  states: BrowserState[];
}

interface BrowserOperation {
  id: string;
  selector: string;
  outputSelector: string;
  targetTermId: string;
  mappingCreated: boolean;
  mappingRecord: { recordId: string };
}

interface BrowserDraft {
  id: string;
  revision: string;
  processName: string;
  operations: BrowserOperation[];
}

interface BrowserSave {
  processName: string;
  successorStateId: string;
  arcIrPath: string;
  mappingPath: string;
  mappingCreated: boolean;
}

interface BrowserMappings {
  mappings: Array<{ fields: Array<{ name: string; values: string[] }> }>;
}

/** Decodes one successful JSON response while keeping failed status assertions explicit. */
async function responseJson<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

/** Resolves a core-produced ArcIR JSON Pointer against decoded canonical output bytes. */
function resolvePointer(document: unknown, selector: string): unknown {
  return selector
    .replace(/^#\//, '')
    .split('/')
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, token) => (value as Record<string, unknown>)[token], document);
}

/** Opens the exact title occurrence and submits its mapping through the accessible dialog. */
async function mapProjectTitle(page: Page, curator: string) {
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect object PRJTEST001' }).click();
  const inspector = page.getByLabel('Element inspector');
  const titleProperty = inspector.locator('article').filter({ hasText: literal }).first();
  await titleProperty.getByRole('button', { name: 'Map to term' }).click();

  const dialog = page.getByRole('dialog', { name: 'Map literal to registered term' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(literal, { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Map selected occurrence' })).toBeDisabled();
  const curatorInput = dialog.getByLabel('Curator');
  if (await curatorInput.isVisible()) await curatorInput.fill(curator);
  await dialog.getByLabel('Search registered terms').fill('BioProject');
  await dialog.locator('input[type="radio"][value="urn:overarc:term:project"]').check();
  await dialog.getByRole('button', { name: 'Map selected occurrence' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel('Curation status')).toContainText('1 operations');
}

test('curates through replay, guards state changes, and publishes inspectable successors', async ({
  page,
}) => {
  const initialWorkspace = await responseJson<BrowserWorkspace>(
    await page.request.get('/api/v1/workspace'),
  );
  const active =
    initialWorkspace.states.find((state) => state.id === 'state-a') ??
    initialWorkspace.states.find((state) => state.id === 'state-b');
  expect(active?.editable).toBe(true);
  const other = initialWorkspace.states.find(
    (state) => state.status === 'valid' && state.id !== active?.id,
  );
  expect(other?.editable).toBe(true);
  if (!active || !other || !active.mappingArtifact)
    throw new Error('Two editable states are required.');
  const baseMappings = await responseJson<BrowserMappings>(
    await page.request.get(`/api/v1/states/${encodeURIComponent(active.id)}/mappings`),
  );

  // Empty drafts cannot pass the validated save boundary.
  const emptyDraft = await responseJson<BrowserDraft>(
    await page.request.post(`/api/v1/states/${encodeURIComponent(active.id)}/drafts`, {
      data: { curator: 'Browser invalid-save check' },
    }),
  );
  const invalidSave = await page.request.post(`/api/v1/drafts/${emptyDraft.id}/save`, {
    data: { expectedRevision: emptyDraft.revision },
  });
  expect(invalidSave.status()).toBe(422);
  expect((await invalidSave.json()).errors).not.toHaveLength(0);
  expect(
    (
      await page.request.delete(`/api/v1/drafts/${emptyDraft.id}`, {
        data: { expectedRevision: emptyDraft.revision },
      })
    ).status(),
  ).toBe(204);

  await page.goto(`/?state=${encodeURIComponent(active.id)}`);
  await expect(page.getByRole('heading', { name: 'OverARC' })).toBeVisible();
  await expect(page.getByLabel('Curation status')).toContainText(
    'This native state supports selected literal mapping.',
  );

  await mapProjectTitle(page, 'Browser Curator');
  const draftId = await page.evaluate(() => window.sessionStorage.getItem('overarc.draftId'));
  expect(draftId).toBeTruthy();
  expect(await page.evaluate(() => Object.keys(window.sessionStorage))).toEqual([
    'overarc.draftId',
  ]);

  await page.getByRole('button', { name: 'Terms', exact: true }).click();
  const terms = page.getByRole('region', { name: 'ArcIR terms' });
  await terms.getByLabel('Search terms').fill('BioProject');
  await terms.getByRole('button', { name: 'Inspect term BioProject' }).click();
  await expect(
    page.getByLabel('Term inspector').getByRole('heading', { name: 'Term value' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Mappings', exact: true }).click();
  const mappings = page.getByRole('region', { name: 'SSSOM mappings' });
  await expect(mappings.getByRole('cell', { name: literal, exact: true })).toBeVisible();
  await expect(
    mappings.getByRole('cell', { name: new RegExp(`BioProject ${targetTerm}`) }),
  ).toBeVisible();
  await expect(
    mappings.getByRole('cell', {
      name: 'http://www.w3.org/2004/02/skos/core#exactMatch',
      exact: true,
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Changes 1/ }).click();
  const changes = page.getByRole('region', { name: 'Draft changes' });
  await expect(changes.getByText(literal, { exact: true })).toBeVisible();
  await expect(changes.locator('code')).toHaveCount(4);

  page.once('dialog', (dialog) => void dialog.accept());
  await page.reload();
  await expect(page.getByLabel('Curation status')).toContainText('Reattached unsaved process');
  await page.getByRole('button', { name: /Changes 1/ }).click();
  await page
    .getByRole('region', { name: 'Draft changes' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(page.getByRole('region', { name: 'Draft changes' })).toContainText(
    'No unsaved operations.',
  );
  await page.getByRole('button', { name: 'Mappings', exact: true }).click();
  const restoredMappings = page.getByRole('region', { name: 'SSSOM mappings' });
  await expect(restoredMappings).toContainText(
    `SSSOM 1.1 · ${baseMappings.mappings.length} records`,
  );
  if (baseMappings.mappings.length === 0)
    await expect(restoredMappings).toContainText('contains no records yet');

  await mapProjectTitle(page, 'Browser Curator');
  const liveDraft = await responseJson<BrowserDraft>(
    await page.request.get(`/api/v1/drafts/${draftId}`),
  );
  const staleSave = await page.request.post(`/api/v1/drafts/${draftId}/save`, {
    data: { expectedRevision: '0' },
  });
  expect(staleSave.status()).toBe(409);

  await page.getByRole('button', { name: new RegExp(`^${other.id}`) }).click();
  const guard = page.getByRole('dialog', { name: 'Unsaved curation changes' });
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: 'Stay' }).click();
  await expect(page).toHaveURL(new RegExp(`state=${encodeURIComponent(active.id)}`));
  await expect(page.getByLabel('Curation status')).toContainText(liveDraft.processName);

  await page.getByRole('button', { name: new RegExp(`^${other.id}`) }).click();
  await page
    .getByRole('dialog', { name: 'Unsaved curation changes' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page).toHaveURL(new RegExp(`state=${encodeURIComponent(other.id)}`));
  expect(await page.evaluate(() => window.sessionStorage.getItem('overarc.draftId'))).toBeNull();

  await page.getByRole('button', { name: new RegExp(`^${active.id}`) }).click();
  await mapProjectTitle(page, 'Browser Curator');
  const saveDraftId = await page.evaluate(() => window.sessionStorage.getItem('overarc.draftId'));
  if (!saveDraftId) throw new Error('The save-ready draft ID is missing.');
  const saveReady = await responseJson<BrowserDraft>(
    await page.request.get(`/api/v1/drafts/${saveDraftId}`),
  );
  const operation = saveReady.operations[0];
  const predecessorArcIr = readFileSync(resolve(curationWorkspace, active.relativePath));
  const predecessorMappings = readFileSync(
    resolve(curationWorkspace, active.mappingArtifact.relativePath),
  );

  await page.getByRole('button', { name: new RegExp(`^${other.id}`) }).click();
  const saveResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/drafts/${saveDraftId}/save`),
  );
  await page
    .getByRole('dialog', { name: 'Unsaved curation changes' })
    .getByRole('button', { name: 'Save' })
    .click();
  const saved = (await (await saveResponsePromise).json()) as BrowserSave;
  await expect(page).toHaveURL(new RegExp(`state=${encodeURIComponent(other.id)}`));
  await expect(page.getByLabel('Curation status')).toContainText(`Saved ${saved.processName}`);

  expect(readFileSync(resolve(curationWorkspace, active.relativePath))).toEqual(predecessorArcIr);
  expect(readFileSync(resolve(curationWorkspace, active.mappingArtifact.relativePath))).toEqual(
    predecessorMappings,
  );
  const successorDocument = JSON.parse(
    readFileSync(resolve(curationWorkspace, saved.arcIrPath), 'utf8'),
  ) as unknown;
  expect(resolvePointer(successorDocument, operation.selector)).toMatchObject({
    type: 'string',
    value: literal,
  });
  expect(resolvePointer(successorDocument, operation.outputSelector)).toMatchObject({
    type: 'iri',
    value: targetTerm,
  });

  const publishedMappings = readFileSync(resolve(curationWorkspace, saved.mappingPath), 'utf8');
  expect(publishedMappings).toContain(operation.mappingRecord.recordId.replace('urn:uuid:', ''));
  expect(publishedMappings).toContain(literal);
  expect(publishedMappings).toContain('BioProject');
  if (!saved.mappingCreated) expect(Buffer.from(publishedMappings)).toEqual(predecessorMappings);

  const arcYaml = readFileSync(resolve(curationWorkspace, 'arc.yml'), 'utf8');
  expect(arcYaml).toContain(saved.processName);
  expect(arcYaml).toContain(saved.arcIrPath.replaceAll('\\', '/'));
  expect(arcYaml).toContain(operation.selector);
  expect(arcYaml).toContain(operation.outputSelector);
  expect(arcYaml).toContain(operation.mappingRecord.recordId.replace('urn:uuid:', ''));
  expect(arcYaml).toContain('CTRO:0000000');
  expect(arcYaml).toContain('CTRO:0000007');

  const refreshed = await responseJson<BrowserWorkspace>(
    await page.request.post('/api/v1/workspace/refresh'),
  );
  expect(refreshed.states.find((state) => state.id === saved.successorStateId)?.status).toBe(
    'valid',
  );
  const decodedMappings = await responseJson<BrowserMappings>(
    await page.request.get(`/api/v1/states/${encodeURIComponent(saved.successorStateId)}/mappings`),
  );
  const decodedRow = decodedMappings.mappings.find((mapping) =>
    mapping.fields.some(
      (field) =>
        field.name === 'record_id' && field.values.includes(operation.mappingRecord.recordId),
    ),
  );
  expect(decodedRow?.fields).toContainEqual({ name: 'subject_label', values: [literal] });
  expect(decodedRow?.fields).toContainEqual({ name: 'object_id', values: [targetTerm] });
});
