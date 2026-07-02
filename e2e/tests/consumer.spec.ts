/**
 * Consumer order flow e2e tests against the LIVE Terps storefront.
 *
 * Constraints:
 *   - At most 2 real orders placed total (customer name: "E2E TEST - ignore").
 *   - Tests run sequentially (single worker, serial mode).
 *   - Verifies: menu loads, product add-to-cart, checkout validation,
 *     order placement, tracking page rendering, chat, and cancellation.
 */
import { test, expect, Page } from '@playwright/test';

const CUSTOMER = {
  name: 'E2E TEST - ignore',
  phone: '7195550199',
  email: 'xevan.smithx+e2e@gmail.com',
};

// Shared state between sequential tests
let orderCode1: string;
let orderToken1: string;
let trackUrl1: string;

let orderCode2: string;
let orderToken2: string;
let trackUrl2: string;

// ---------- Helpers ----------

/** Dismiss the age gate if present */
async function dismissAgeGate(page: Page) {
  const gate = page.locator('#agegate');
  if (await gate.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('#age-yes').click();
    await expect(gate).toBeHidden();
  }
}

/** Add the first available product to cart from the menu page */
async function addProductFromMenu(page: Page) {
  await page.goto('/menu.html');
  await dismissAgeGate(page);

  // Wait for product cards to render (grid populated by menu.js from catalog.json)
  const productLink = page.locator('#grid a.card').first();
  await expect(productLink).toBeVisible({ timeout: 20000 });
  await productLink.click();

  // On the product page, dismiss age gate again (product pages have their own)
  await dismissAgeGate(page);

  // If the product has multiple strains, select the first one
  const strainBtn = page.locator('.strain-opt').first();
  if (await strainBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await strainBtn.click();
  }

  // Click the "Add to pickup order" button
  const addBtn = page.locator('button.btn-gold.btn-lg, .addrow button.btn-gold').first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();

  // After addPDP(), Cart.add is called and openCart() opens the cart sidebar.
  // Verify the cart sidebar opens with at least one item.
  await expect(page.locator('#cart.open')).toBeVisible({ timeout: 5000 });
}

/** Open the checkout modal and fill the form */
async function fillCheckout(page: Page) {
  // Trigger checkout directly via the global function (avoids brittle cart-sidebar waits)
  await page.evaluate(() => {
    (window as any).reservePickup();
  });

  // Wait for checkout modal to appear
  await expect(page.getByTestId('checkout-name')).toBeVisible({ timeout: 10000 });

  // Fill fields
  await page.getByTestId('checkout-name').fill(CUSTOMER.name);
  await page.getByTestId('checkout-phone').fill(CUSTOMER.phone);
  await page.getByTestId('checkout-email').fill(CUSTOMER.email);
  await page.getByTestId('checkout-note').fill('Automated e2e test — please ignore this order.');
}

// ---------- Tests ----------

test.describe.serial('Consumer order flow', () => {

  test('menu loads with products', async ({ page }) => {
    await page.goto('/menu.html');
    await dismissAgeGate(page);

    // The grid is populated by menu.js from catalog.json
    const products = page.locator('#grid a.card');
    await expect(products.first()).toBeVisible({ timeout: 20000 });
    const count = await products.count();
    expect(count).toBeGreaterThan(0);
  });

  test('product page add-to-cart works', async ({ page }) => {
    await addProductFromMenu(page);
  });

  test('checkout modal validation rejects empty fields', async ({ page }) => {
    // Add something to cart first
    await addProductFromMenu(page);
    await fillCheckout(page);

    // Clear the fields to test validation
    await page.getByTestId('checkout-name').fill('');
    await page.getByTestId('checkout-phone').fill('');
    await page.getByTestId('checkout-email').fill('');

    // Submit empty
    await page.getByTestId('checkout-submit').click();

    // Should show validation error (field highlight or error message)
    await expect(
      page.locator('.co-err.show, label.bad').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('ORDER 1: place order and verify success', async ({ page }) => {
    await addProductFromMenu(page);
    await fillCheckout(page);

    // Submit
    await page.getByTestId('checkout-submit').click();

    // Wait for success state
    const success = page.getByTestId('checkout-success');
    await expect(success).toBeVisible({ timeout: 30000 });

    // Extract order code from the success UI
    const codeEl = page.locator('.co-code');
    await expect(codeEl).toBeVisible();
    orderCode1 = (await codeEl.textContent() ?? '').trim();
    expect(orderCode1).toMatch(/^TD-/);

    // Extract tracking link
    const trackLink = page.getByTestId('track-link');
    await expect(trackLink).toBeVisible();
    trackUrl1 = await trackLink.getAttribute('href') ?? '';
    expect(trackUrl1).toContain('order.html');

    // Parse token from URL
    const url = new URL(trackUrl1, 'https://terpsdispensary.com');
    orderToken1 = url.searchParams.get('t') ?? '';
    expect(orderToken1.length).toBeGreaterThan(0);
  });

  test('ORDER 1: tracking page renders status and timeline', async ({ page }) => {
    test.skip(!trackUrl1, 'No tracking URL from previous test');

    await page.goto(trackUrl1);

    // Status banner renders
    const status = page.getByTestId('track-status');
    await expect(status).toBeVisible({ timeout: 15000 });

    // Timeline renders with at least one entry
    const timeline = page.getByTestId('track-timeline');
    await expect(timeline).toBeVisible();
    const entries = timeline.locator('.tl');
    await expect(entries.first()).toBeVisible({ timeout: 5000 });
  });

  test('ORDER 1: chat — send message and see it appear', async ({ page }) => {
    test.skip(!trackUrl1, 'No tracking URL from previous test');

    await page.goto(trackUrl1);
    await expect(page.getByTestId('track-status')).toBeVisible({ timeout: 15000 });

    const chatInput = page.getByTestId('chat-input');
    const chatSend = page.getByTestId('chat-send');
    await expect(chatInput).toBeVisible();
    await expect(chatSend).toBeVisible();

    // Send a message
    const msg = 'E2E test message — please ignore ' + Date.now();
    await chatInput.fill(msg);
    await chatSend.click();

    // Message should appear in chat-messages
    const messages = page.getByTestId('chat-messages');
    await expect(messages.locator('.m').filter({ hasText: msg }).first()).toBeVisible({ timeout: 15000 });
  });

  test('ORDER 2: place order and cancel it', async ({ page }) => {
    await addProductFromMenu(page);
    await fillCheckout(page);

    await page.getByTestId('checkout-submit').click();

    // Wait for success
    const success = page.getByTestId('checkout-success');
    await expect(success).toBeVisible({ timeout: 30000 });

    // Extract order code + tracking link
    const codeEl = page.locator('.co-code');
    orderCode2 = (await codeEl.textContent() ?? '').trim();
    expect(orderCode2).toMatch(/^TD-/);

    const trackLink = page.getByTestId('track-link');
    trackUrl2 = await trackLink.getAttribute('href') ?? '';
    const url2 = new URL(trackUrl2, 'https://terpsdispensary.com');
    orderToken2 = url2.searchParams.get('t') ?? '';

    // Navigate to tracking page
    await page.goto(trackUrl2);
    await expect(page.getByTestId('track-status')).toBeVisible({ timeout: 15000 });

    // Cancel button should be present (order is new)
    const cancelBtn = page.getByTestId('track-cancel');
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });

    // Accept the confirm dialog
    page.on('dialog', (dialog) => dialog.accept());
    await cancelBtn.click();

    // After cancel, status should change to "Cancelled"
    await expect(page.getByTestId('track-status')).toContainText(/cancel/i, { timeout: 15000 });
  });
});
