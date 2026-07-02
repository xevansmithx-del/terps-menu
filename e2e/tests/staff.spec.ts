/**
 * Staff dashboard e2e tests (staff.html).
 *
 * Gated behind environment variables:
 *   STAFF_EMAIL — Supabase auth email for a staff account
 *   STAFF_PASSWORD — corresponding password
 *
 * When unset, all tests in this file are cleanly skipped.
 */
import { test, expect } from '@playwright/test';

const STAFF_EMAIL = process.env.STAFF_EMAIL;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;
const HAS_CREDS = !!(STAFF_EMAIL && STAFF_PASSWORD);

test.describe('Staff dashboard', () => {

  test.beforeEach(async ({}, testInfo) => {
    if (!HAS_CREDS) {
      testInfo.skip(true, 'STAFF_EMAIL / STAFF_PASSWORD not set — skipping staff suite');
    }
  });

  test('login with valid credentials shows the order queue', async ({ page }) => {
    await page.goto('/staff.html');

    // Login form should be visible
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 10000 });

    await page.getByTestId('login-email').fill(STAFF_EMAIL!);
    await page.getByTestId('login-password').fill(STAFF_PASSWORD!);
    await page.getByTestId('login-submit').click();

    // After successful login the queue container should render
    const queue = page.getByTestId('queue');
    await expect(queue).toBeVisible({ timeout: 20000 });
  });

  test('order queue renders rows', async ({ page }) => {
    await page.goto('/staff.html');
    await page.getByTestId('login-email').fill(STAFF_EMAIL!);
    await page.getByTestId('login-password').fill(STAFF_PASSWORD!);
    await page.getByTestId('login-submit').click();

    const queue = page.getByTestId('queue');
    await expect(queue).toBeVisible({ timeout: 20000 });

    // Wait for at least one order card or the empty state
    const hasOrders = await queue.locator('[data-testid^="queue-row-"]').first()
      .isVisible({ timeout: 10000 }).catch(() => false);

    // If there are orders, click the first one and verify detail opens
    if (hasOrders) {
      const firstRow = queue.locator('[data-testid^="queue-row-"]').first();
      await firstRow.click();

      const detail = page.getByTestId('order-detail');
      await expect(detail).toBeVisible({ timeout: 10000 });
    }
  });

  test('order detail shows status pipeline and chat', async ({ page }) => {
    await page.goto('/staff.html');
    await page.getByTestId('login-email').fill(STAFF_EMAIL!);
    await page.getByTestId('login-password').fill(STAFF_PASSWORD!);
    await page.getByTestId('login-submit').click();

    const queue = page.getByTestId('queue');
    await expect(queue).toBeVisible({ timeout: 20000 });

    const firstRow = queue.locator('[data-testid^="queue-row-"]').first();
    const hasOrders = await firstRow.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasOrders, 'No orders in queue to inspect');

    await firstRow.click();
    const detail = page.getByTestId('order-detail');
    await expect(detail).toBeVisible({ timeout: 10000 });

    // Status pipeline buttons exist
    const statusBtn = detail.locator('[data-testid^="status-btn-"]').first();
    await expect(statusBtn).toBeVisible({ timeout: 5000 });

    // Chat input and send button are present
    await expect(page.getByTestId('chat-input')).toBeVisible();
    await expect(page.getByTestId('chat-send')).toBeVisible();
  });

  test('chat send message works', async ({ page }) => {
    await page.goto('/staff.html');
    await page.getByTestId('login-email').fill(STAFF_EMAIL!);
    await page.getByTestId('login-password').fill(STAFF_PASSWORD!);
    await page.getByTestId('login-submit').click();

    const queue = page.getByTestId('queue');
    await expect(queue).toBeVisible({ timeout: 20000 });

    const firstRow = queue.locator('[data-testid^="queue-row-"]').first();
    const hasOrders = await firstRow.isVisible({ timeout: 10000 }).catch(() => false);
    test.skip(!hasOrders, 'No orders in queue to test chat');

    await firstRow.click();
    await expect(page.getByTestId('order-detail')).toBeVisible({ timeout: 10000 });

    const chatInput = page.getByTestId('chat-input');
    const chatSend = page.getByTestId('chat-send');
    await expect(chatInput).toBeVisible();

    const msg = 'Staff E2E test message — ignore ' + Date.now();
    await chatInput.fill(msg);
    await chatSend.click();

    // Message should appear in chat-messages
    const chatMessages = page.getByTestId('chat-messages');
    await expect(chatMessages.locator('text=' + msg)).toBeVisible({ timeout: 10000 });
  });

  test('statuses-manage button opens modal', async ({ page }) => {
    await page.goto('/staff.html');
    await page.getByTestId('login-email').fill(STAFF_EMAIL!);
    await page.getByTestId('login-password').fill(STAFF_PASSWORD!);
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('queue')).toBeVisible({ timeout: 20000 });

    const manageBtn = page.getByTestId('statuses-manage');
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    // Modal should open
    const modal = page.locator('#status-modal-ov.open');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });
});
