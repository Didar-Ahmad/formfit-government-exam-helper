const { test, expect } = require('@playwright/test');

const svg = (color, label) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><rect width="100%" height="100%" fill="${color}"/><circle cx="600" cy="520" r="270" fill="#f6d4b1"/><rect x="280" y="850" width="640" height="420" rx="210" fill="#193b3a"/><text x="600" y="1400" text-anchor="middle" font-size="70" fill="white">${label}</text></svg>`);

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Prepare your application files');
  page.testErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.testErrors, `Browser errors: ${page.testErrors?.join('\n')}`).toEqual([]);
});

test('homepage renders all major sections and links', async ({ page }) => {
  await expect(page).toHaveTitle(/FormFit/);
  await expect(page.locator('.tool-card')).toHaveCount(4);
  await expect(page.locator('.preset')).toHaveCount(5);
  await expect(page.locator('#how')).toBeVisible();
  await expect(page.locator('footer')).toBeVisible();
});

test('first tool starts the photo workflow directly', async ({ page }) => {
  await page.locator('[data-tool="photo"] .card-link').click();
  await expect(page.locator('#toolModal')).toBeVisible();
  await expect(page.locator('#modalKicker')).toHaveText('RESIZE PHOTO');
  await expect(page.locator('#targetSize')).toHaveValue('50');
});

test('exam filters and multilingual guide work', async ({ page }) => {
  await page.getByRole('button', { name: 'UPSC', exact: true }).click();
  await expect(page.locator('.preset:visible')).toHaveCount(1);
  await page.locator('#guideButton').click();
  await expect(page.locator('#guideModal')).toBeVisible();
  await page.getByRole('button', { name: 'हिन्दी' }).click();
  await expect(page.locator('#guideContent')).toContainText('अपनी फ़ाइल');
  await page.getByRole('button', { name: 'বাংলা' }).click();
  await expect(page.locator('#guideContent')).toContainText('ফাইল কীভাবে');
});

test('photo is resized and downloads as JPEG', async ({ page }) => {
  await page.locator('[data-tool="photo"] [data-size="50"]').click();
  await page.locator('#fileInput').setInputFiles({ name: 'photo.svg', mimeType: 'image/svg+xml', buffer: svg('#df745f', 'PHOTO') });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#processButton').click();
  await expect(page.locator('#resultTitle')).toContainText(/ready|possible/i);
  await page.locator('#downloadButton').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('photo-50kb.jpg');
  const stream = await download.createReadStream(); let size = 0; for await (const chunk of stream) size += chunk.length;
  expect(size).toBeGreaterThan(1000); expect(size).toBeLessThanOrEqual(50 * 1024);
});

test('multiple images convert to a downloadable PDF', async ({ page }) => {
  await page.locator('[data-tool="image-pdf"] [data-size="500"]').click();
  await page.locator('#fileInput').setInputFiles([
    { name: 'one.svg', mimeType: 'image/svg+xml', buffer: svg('#4e8878', 'ONE') },
    { name: 'two.svg', mimeType: 'image/svg+xml', buffer: svg('#426da4', 'TWO') }
  ]);
  await page.locator('#processButton').click();
  await expect(page.locator('#resultTitle')).toContainText(/ready|possible/i);
  const downloadPromise = page.waitForEvent('download'); await page.locator('#downloadButton').click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe('documents-500kb.pdf');
  const stream = await download.createReadStream(); let head = Buffer.alloc(0); for await (const chunk of stream) { head = Buffer.concat([head, chunk]); if (head.length > 5) break; }
  expect(head.subarray(0, 4).toString()).toBe('%PDF');
});

test('PDF tool accepts and processes a valid PDF', async ({ page }) => {
  const pdfBytes = await page.evaluate(() => {
    const pdf = new window.jspdf.jsPDF(); pdf.setFontSize(24); pdf.text('FormFit PDF compression test', 20, 30);
    for (let i = 0; i < 8; i++) { if (i) pdf.addPage(); pdf.text(`Test page ${i + 1}`, 20, 50); }
    return Array.from(new Uint8Array(pdf.output('arraybuffer')));
  });
  await page.locator('[data-tool="pdf"] [data-size="200"]').click();
  await page.locator('#fileInput').setInputFiles({ name: 'document.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdfBytes) });
  await page.locator('#processButton').click();
  await expect(page.locator('#resultTitle')).toContainText(/ready|possible/i);
  await expect(page.locator('#downloadButton')).toBeVisible();
});

test('layout has no horizontal overflow', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator('[data-tool="signature"] .card-link').click();
  const dialogFits = await page.locator('#toolModal').evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().left >= 0);
  expect(dialogFits).toBe(true);
});
