import { expect, test } from '@playwright/test';

test('loads states, filters with context, and inspects complete details', async ({ page }) => {
  await page.goto('/?state=state-a');
  await expect(page.getByRole('heading', { name: 'OverARC' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Example state A/ })).toHaveClass(/active/);
  const visibleGraph = page.getByRole('heading', { name: 'Visible graph' }).locator('..');
  await expect(visibleGraph.getByText('5 objects · 5 relations', { exact: true })).toBeVisible();

  await page.getByLabel('Search').fill('SAMTEST001');
  await expect(visibleGraph.getByText('3 objects · 4 relations', { exact: true })).toBeVisible();
  await page.getByText('Accessible visible graph table').click();
  await page.getByRole('button', { name: 'SAMTEST001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'SAMTEST001' })).toBeVisible();
  await expect(page.getByText('Growth temperature')).toBeVisible();
  await expect(page.getByText('22 degree Celsius')).toBeVisible();
  await expect(
    page
      .getByLabel('Element inspector')
      .getByText('urn:biofsharp:insdc:object:PRJTEST001', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('urn:biofsharp:insdc:object:SAMTEST001', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(
    page.getByText('Select an object or relation to inspect every assertion and annotation.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'SAMTEST001', exact: true }).click();
  await page.getByRole('button', { name: 'references', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ArcValue.Ref reference' })).toBeVisible();
  await expect(page.getByText(/It is not an ArcRelation/)).toBeVisible();
  await expect(
    page
      .getByLabel('Element inspector')
      .getByText('urn:biofsharp:insdc:object:PRJTEST001', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page
    .getByRole('button', { name: 'urn:biofsharp:insdc:object:SAM-MISSING', exact: true })
    .click();
  await expect(page.getByText(/contains no ArcIR object/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Introduced by relations' })).toBeVisible();
  await expect(page.getByText('Unable to load')).not.toBeVisible();
});

test('switches state, refreshes, controls layout, and exports', async ({ page }) => {
  await page.goto('/?state=state-a');
  await expect(page.getByRole('button', { name: /Example state A/ })).toHaveClass(/active/);
  await page.getByText('Accessible visible graph table').click();
  await page.getByRole('button', { name: 'PRJTEST001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'PRJTEST001' })).toBeVisible();
  await page.getByLabel('Search').fill('PRJTEST001');
  await page.getByRole('button', { name: /Example state B/ }).click();
  await expect(page).toHaveURL(/state=state-b/);
  await expect(page.getByLabel('Search')).toHaveValue('PRJTEST001');
  await expect(
    page.getByText('Select an object or relation to inspect every assertion and annotation.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  const visibleGraph = page.getByRole('heading', { name: 'Visible graph' }).locator('..');
  await expect(visibleGraph.getByText('3 objects · 2 relations', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Start layout' }).click();
  await expect(page.getByRole('button', { name: 'Stop layout' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop layout' }).click();
  await page.getByRole('button', { name: 'Reset layout' }).click();
  await page.getByRole('button', { name: 'Refresh workspace' }).click();
  await expect(page.getByRole('button', { name: /Example state B/ })).toHaveClass(/active/);

  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG' }).click();
  expect((await png).suggestedFilename()).toBe('overarc-visible-graph.png');

  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV pair' }).click();
  expect((await csv).suggestedFilename()).toMatch(/state-b-(nodes|relations)\.csv/);
});
