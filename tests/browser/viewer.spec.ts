import { expect, test } from '@playwright/test';

test('loads states, filters with context, and inspects complete details', async ({ page }) => {
  await page.goto('/?state=state-a');
  await expect(page.getByRole('heading', { name: 'OverARC' })).toBeVisible();
  const workspaceSubtitle = page.getByText('OverARC example workspace', { exact: true });
  const workspaceToolbar = page.getByRole('toolbar', { name: 'Workspace toolbar' });
  const openWorkspace = workspaceToolbar.getByRole('button', {
    name: 'Open OverARC workspace',
  });
  await expect(openWorkspace).toHaveAttribute('title', 'Open OverARC workspace');
  const subtitleBounds = await workspaceSubtitle.boundingBox();
  const toolbarBounds = await workspaceToolbar.boundingBox();
  if (!subtitleBounds || !toolbarBounds)
    throw new Error('Workspace toolbar bounds are unavailable.');
  expect(toolbarBounds.y).toBeGreaterThanOrEqual(subtitleBounds.y + subtitleBounds.height);
  await expect(page.getByRole('button', { name: /Example state A/ })).toHaveClass(/active/);
  const visibleGraph = page.getByRole('heading', { name: 'Visible graph' }).locator('..');
  await expect(visibleGraph.getByText('5 objects · 5 relations', { exact: true })).toBeVisible();

  await page.getByLabel('Search', { exact: true }).fill('SAMTEST001');
  await expect(visibleGraph.getByText('3 objects · 4 relations', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect object SAMTEST001' }).click();
  const inspector = page.getByLabel('Element inspector');
  await expect(inspector.getByRole('heading', { name: 'SAMTEST001' })).toBeVisible();
  await expect(inspector.getByText('Growth temperature')).toBeVisible();
  await expect(inspector.getByText('22 degree Celsius')).toBeVisible();

  const propertiesHeading = inspector.getByRole('heading', { name: /Properties/ });
  const propertiesDisclosure = propertiesHeading.locator('xpath=../..');
  await propertiesHeading.click();
  await expect(propertiesDisclosure).not.toHaveAttribute('open', '');
  await propertiesHeading.click();
  await expect(propertiesDisclosure).toHaveAttribute('open', '');

  await inspector.getByText('Technical details', { exact: true }).first().click();
  await expect(
    inspector.getByText('urn:biofsharp:insdc:object:SAMTEST001', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await expect(
    page.getByText('Select an object, relation, or term to inspect its complete details.'),
  ).toBeVisible();

  await page.getByRole('tab', { name: /Relations/ }).click();
  await page.getByRole('button', { name: 'Inspect relation references' }).click();
  await expect(page.getByRole('heading', { name: 'ArcValue.Ref reference' })).toBeVisible();
  await expect(page.getByText(/It is not an ArcRelation/)).toBeVisible();

  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('tab', { name: /Objects/ }).click();
  await page
    .getByRole('button', {
      name: 'Inspect object urn:biofsharp:insdc:object:SAM-MISSING',
    })
    .click();
  await expect(page.getByText(/contains no ArcIR object/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Introduced by relations/ })).toBeVisible();
  await expect(page.getByText('Unable to load')).not.toBeVisible();
});

test('switches state, refreshes, controls layout, and exports', async ({ page }) => {
  await page.goto('/?state=state-a');
  await expect(page.getByRole('button', { name: /Example state A/ })).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect object PRJTEST001' }).click();
  await expect(page.getByRole('heading', { name: 'PRJTEST001' })).toBeVisible();
  await page.getByLabel('Search', { exact: true }).fill('PRJTEST001');
  await page.getByRole('button', { name: /Example state B/ }).click();
  await expect(page).toHaveURL(/state=state-b/);
  await expect(page.getByLabel('Search', { exact: true })).toHaveValue('PRJTEST001');
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    page.getByText('Select an object, relation, or term to inspect its complete details.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  const visibleGraph = page.getByRole('heading', { name: 'Visible graph' }).locator('..');
  await expect(visibleGraph.getByText('3 objects · 2 relations', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  const graphControls = page.getByLabel('Graph controls');
  const graphPane = page.getByLabel('Graph, table, and term views');
  const controlsBounds = await graphControls.boundingBox();
  const graphBounds = await graphPane.boundingBox();
  if (!controlsBounds || !graphBounds) throw new Error('Graph control bounds are unavailable.');
  expect(controlsBounds.y + controlsBounds.height).toBeGreaterThan(
    graphBounds.y + graphBounds.height * 0.85,
  );
  const showLabels = page.getByRole('button', { name: 'Show labels' });
  await expect(showLabels).toHaveAttribute('aria-pressed', 'false');
  await showLabels.click();
  await expect(page.getByRole('button', { name: 'Hide labels' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Start layout' }).click();
  await expect(page.getByRole('button', { name: 'Stop layout' })).toBeVisible();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start layout' })).toBeVisible();
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

test('uses the full table pane with selectable text, sorting, and reachable pagination', async ({
  page,
}) => {
  await page.goto('/?state=state-a');
  const sigma = page.locator('.react-sigma');
  await expect(sigma).toBeVisible();

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const tableView = page.getByRole('region', { name: 'Visible graph table' });
  await expect(tableView).toBeVisible();
  await expect(sigma).not.toBeVisible();

  const tableBounds = await tableView.boundingBox();
  const paginationBounds = await page
    .getByRole('navigation', { name: 'Table pages' })
    .boundingBox();
  if (!tableBounds || !paginationBounds) throw new Error('Table layout bounds are unavailable.');
  expect(paginationBounds.y + paginationBounds.height).toBeLessThanOrEqual(
    tableBounds.y + tableBounds.height + 1,
  );

  const selectedText = await tableView
    .locator('tbody td')
    .first()
    .evaluate((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() ?? '';
    });
  expect(selectedText).toContain('PRJTEST001');

  const originalFirstRow = await tableView.locator('tbody tr').first().innerText();
  const kindHeader = tableView.getByRole('columnheader', { name: /Kind/ });
  await tableView.getByRole('button', { name: 'Sort by Kind, ascending' }).click();
  await expect(kindHeader).toHaveAttribute('aria-sort', 'ascending');
  await tableView.getByRole('button', { name: 'Sort by Kind, descending' }).click();
  await expect(kindHeader).toHaveAttribute('aria-sort', 'descending');
  await tableView.getByRole('button', { name: 'Remove Kind sort' }).click();
  await expect(kindHeader).not.toHaveAttribute('aria-sort');
  await expect(tableView.locator('tbody tr').first()).toContainText(
    originalFirstRow.split('\n')[0],
  );

  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(sigma).toBeVisible();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(tableView).toBeVisible();
});

test('discovers terms and inspects every registered usage without disturbing graph state', async ({
  page,
}) => {
  await page.goto('/?state=state-a');
  const sigma = page.locator('.react-sigma');
  await expect(sigma).toBeVisible();

  await page.getByRole('button', { name: 'Terms', exact: true }).click();
  const termsView = page.getByRole('region', { name: 'ArcIR terms' });
  await expect(termsView).toBeVisible();
  await expect(sigma).not.toBeVisible();
  await expect(termsView.getByText('14 of 14 terms', { exact: true })).toBeVisible();

  await termsView.getByLabel('Search terms').fill('measurement');
  await expect(termsView.getByText('1 of 14 terms', { exact: true })).toBeVisible();
  await termsView.getByRole('button', { name: 'Inspect term Measurement' }).click();

  const inspector = page.getByLabel('Term inspector');
  await expect(inspector.getByRole('heading', { name: 'Measurement' })).toBeVisible();
  await expect(inspector.getByText('3', { exact: true }).first()).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Object property predicate' })).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Annotation property' })).toBeVisible();

  await page.getByRole('button', { name: 'Graph', exact: true }).click();
  await expect(sigma).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Measurement' })).toBeVisible();
  await page.getByRole('button', { name: 'Terms', exact: true }).click();
  await expect(termsView.getByLabel('Search terms')).toHaveValue('measurement');

  await page.getByRole('button', { name: /Example state B/ }).click();
  await expect(page).toHaveURL(/state=state-b/);
  await expect(page.getByLabel('Element inspector')).toContainText(
    'Select an object, relation, or term to inspect its complete details.',
  );
});

test('resizes, collapses, and restores both side panes', async ({ page }) => {
  await page.goto('/?state=state-a');
  const leftPane = page.getByLabel('Workspace and filters');
  const leftResizer = page.getByRole('separator', { name: 'Resize left pane' });
  const rightResizer = page.getByRole('separator', { name: 'Resize right pane' });

  const leftHandle = await leftResizer.boundingBox();
  if (!leftHandle) throw new Error('Left resize handle is not visible.');
  await page.mouse.move(leftHandle.x + leftHandle.width / 2, leftHandle.y + 100);
  await page.mouse.down();
  await page.mouse.move(80, leftHandle.y + 100);
  await page.mouse.up();
  await expect(leftPane).toHaveClass(/pane-collapsed/);
  await expect(leftResizer).toHaveAttribute('aria-valuetext', 'Collapsed');

  await leftResizer.dblclick();
  await expect(leftPane).not.toHaveClass(/pane-collapsed/);

  await rightResizer.focus();
  await rightResizer.press('Home');
  await expect(rightResizer).toHaveAttribute('aria-valuetext', 'Collapsed');
  await rightResizer.press('Enter');
  await expect(rightResizer).not.toHaveAttribute('aria-valuetext', 'Collapsed');
});

test('toggles and persists the color theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?state=state-a');
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  expect(
    await root.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--overarc-graph-center').trim(),
    ),
  ).toBe('#151e1d');
  await expect(page.locator('.react-sigma')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('overarc.theme')))
    .toBe('dark');

  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'dark');
});
