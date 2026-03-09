#!/usr/bin/env npx ts-node
/**
 * Cashfree End-to-End Test Flow
 *
 * Runs a complete subscription payment test against the local API:
 * 1. Logs in (or registers) an owner + academy
 * 2. Initiates a subscription payment
 * 3. Prints the Cashfree sandbox checkout URL
 * 4. Optionally simulates the webhook callback (--auto)
 * 5. Polls payment status until terminal state
 *
 * Usage:
 *   npx ts-node scripts/cashfree-test-flow.ts
 *   npx ts-node scripts/cashfree-test-flow.ts --auto
 *   npx ts-node scripts/cashfree-test-flow.ts --api-url http://localhost:3001 --email owner@playconnect.dev --password Owner@123
 *
 * Options:
 *   --api-url    API base URL (default: http://localhost:3001)
 *   --auto       Simulate webhook callback automatically after initiation
 *   --email      Owner email (default: owner@playconnect.dev)
 *   --password   Owner password (default: Owner@123)
 */
import { createHmac } from 'node:crypto';

// ── Color helpers ────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

function step(n: number, total: number, msg: string): void {
  console.log(`\n${C.bold}[${n}/${total}]${C.reset} ${msg}`);
}

function info(msg: string): void {
  console.log(`  ${C.cyan}INFO${C.reset}  ${msg}`);
}

function success(msg: string): void {
  console.log(`  ${C.green}OK${C.reset}    ${msg}`);
}

function error(msg: string): void {
  console.error(`  ${C.red}ERR${C.reset}   ${msg}`);
}

function warn(msg: string): void {
  console.log(`  ${C.yellow}WARN${C.reset}  ${msg}`);
}

function highlight(label: string, value: string): void {
  console.log(`  ${C.magenta}${label}${C.reset} ${C.bold}${value}${C.reset}`);
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

interface CliArgs {
  apiUrl: string;
  auto: boolean;
  email: string;
  password: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  let auto = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--auto') {
      auto = true;
      continue;
    }
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].replace(/^--/, '');
      map[key] = args[++i];
    }
  }

  return {
    apiUrl: map['api-url'] || 'http://localhost:3001',
    auto,
    email: map['email'] || 'owner@playconnect.dev',
    password: map['password'] || 'Owner@123',
  };
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function api(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${baseUrl}/api/v1${path}`, opts);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  return { ok: res.ok, status: res.status, data: json };
}

// ── Sleep helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Webhook simulation (same logic as cashfree-webhook-simulator.ts) ─────────

function simulateWebhook(
  target: string,
  orderId: string,
  amount: number,
  secret: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const payload = {
    data: {
      order: {
        order_id: orderId,
        order_amount: amount,
        order_currency: 'INR',
        order_status: 'PAID',
      },
      payment: {
        cf_payment_id: Math.floor(1000000 + Math.random() * 9000000),
        payment_status: 'SUCCESS',
        payment_amount: amount,
        payment_currency: 'INR',
        payment_method: { upi: { channel: 'collect', upi_id: 'test@upi' } },
        payment_time: new Date().toISOString(),
      },
    },
    event_time: new Date().toISOString(),
    type: 'PAYMENT_SUCCESS_WEBHOOK',
  };

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret)
    .update(timestamp + body)
    .digest('base64');

  return fetch(`${target}/api/v1/subscription-payments/cashfree/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': signature,
      'x-webhook-timestamp': timestamp,
    },
    body,
  }).then(async (res) => {
    const resBody = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(resBody);
    } catch {
      parsed = resBody;
    }
    return { ok: res.ok, status: res.status, body: parsed };
  });
}

// ── Main flow ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const TOTAL_STEPS = 7;

  console.log(`\n${C.bold}${'='.repeat(50)}${C.reset}`);
  console.log(`${C.bold}  Cashfree End-to-End Test Flow${C.reset}`);
  console.log(`${C.bold}${'='.repeat(50)}${C.reset}`);

  const args = parseArgs();
  info(`API URL:  ${args.apiUrl}`);
  info(`Email:    ${args.email}`);
  info(`Auto:     ${args.auto ? 'yes (will simulate webhook)' : 'no (manual checkout)'}`);

  // ── Step 1: Login ──────────────────────────────────────────────────────────
  step(1, TOTAL_STEPS, 'Logging in...');

  const loginRes = await api(args.apiUrl, 'POST', '/auth/login', {
    identifier: args.email,
    password: args.password,
    deviceId: `cashfree-test-${Date.now()}`,
  });

  if (!loginRes.ok) {
    error(`Login failed (HTTP ${loginRes.status})`);
    error(JSON.stringify(loginRes.data, null, 2));
    error('Make sure the seed data exists. Run: node scripts/seed-dev.mjs');
    process.exit(1);
  }

  const loginData = loginRes.data as { data?: { accessToken?: string; user?: { id?: string; role?: string } } };
  const token = loginData.data?.accessToken;
  const userId = loginData.data?.user?.id;

  if (!token) {
    error('No accessToken in login response');
    process.exit(1);
  }

  success(`Logged in as ${args.email} (userId: ${userId})`);

  // ── Step 2: Check subscription status ──────────────────────────────────────
  step(2, TOTAL_STEPS, 'Checking current subscription...');

  const subRes = await api(args.apiUrl, 'GET', '/subscription/my', undefined, token);
  if (subRes.ok) {
    const subData = subRes.data as { data?: { tierKey?: string; paidEndAt?: string; trialEndAt?: string } };
    const sub = subData.data;
    if (sub) {
      info(`Tier:       ${sub.tierKey || 'none (trial)'}`);
      info(`Trial ends: ${sub.trialEndAt || 'N/A'}`);
      info(`Paid ends:  ${sub.paidEndAt || 'N/A'}`);
    }
  } else {
    warn(`Could not fetch subscription (HTTP ${subRes.status}) — continuing anyway`);
  }

  // ── Step 3: Initiate payment ───────────────────────────────────────────────
  step(3, TOTAL_STEPS, 'Initiating subscription payment...');

  const initiateRes = await api(args.apiUrl, 'POST', '/subscription-payments/initiate', undefined, token);

  if (!initiateRes.ok) {
    error(`Initiation failed (HTTP ${initiateRes.status})`);
    error(JSON.stringify(initiateRes.data, null, 2));
    if (initiateRes.status === 409) {
      warn('A payment may already be in progress. Wait 30 minutes or check the database.');
    }
    process.exit(1);
  }

  const paymentData = initiateRes.data as {
    data?: {
      orderId?: string;
      paymentSessionId?: string;
      amountInr?: number;
      tierKey?: string;
      expiresAt?: string;
    };
  };
  const payment = paymentData.data;

  if (!payment?.orderId || !payment?.paymentSessionId) {
    error('Unexpected response shape from initiate endpoint');
    error(JSON.stringify(initiateRes.data, null, 2));
    process.exit(1);
  }

  success('Payment initiated!');
  highlight('Order ID:          ', payment.orderId);
  highlight('Payment Session ID:', payment.paymentSessionId);
  highlight('Amount:            ', `${payment.amountInr} INR`);
  highlight('Tier:              ', payment.tierKey || 'unknown');
  highlight('Expires at:        ', payment.expiresAt || 'N/A');

  // ── Step 4: Print Cashfree sandbox checkout URL ────────────────────────────
  step(4, TOTAL_STEPS, 'Cashfree Sandbox Checkout');

  const checkoutUrl = `https://sandbox.cashfree.com/pg/orders/sessions/${payment.paymentSessionId}`;
  console.log('');
  console.log(`  ${C.bold}${C.green}Open this URL to complete payment in Cashfree sandbox:${C.reset}`);
  console.log(`  ${C.cyan}${checkoutUrl}${C.reset}`);
  console.log('');
  info('Use Cashfree sandbox test cards/UPI to complete payment.');
  info('See: https://docs.cashfree.com/docs/test-instruments');

  // ── Step 5: Optionally simulate webhook ────────────────────────────────────
  step(5, TOTAL_STEPS, args.auto ? 'Simulating webhook callback...' : 'Waiting for webhook (manual)...');

  if (args.auto) {
    const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || '';
    if (!webhookSecret) {
      error('Cannot simulate webhook: CASHFREE_WEBHOOK_SECRET env var is not set.');
      error('Set it and re-run, or complete payment manually in the Cashfree sandbox.');
      warn('Skipping auto-webhook. Will still poll for status...');
    } else {
      info('Waiting 2 seconds before sending webhook...');
      await sleep(2000);

      const webhookRes = await simulateWebhook(
        args.apiUrl,
        payment.orderId,
        payment.amountInr || 299,
        webhookSecret,
      );

      if (webhookRes.ok) {
        success(`Webhook accepted (HTTP ${webhookRes.status})`);
      } else {
        error(`Webhook rejected (HTTP ${webhookRes.status})`);
        error(JSON.stringify(webhookRes.body, null, 2));
      }
    }
  } else {
    info('Complete the payment in the Cashfree sandbox, then the webhook will fire.');
    info('Or run the webhook simulator separately:');
    console.log(`  ${C.dim}npx ts-node scripts/cashfree-webhook-simulator.ts \\`);
    console.log(`    --order-id ${payment.orderId} --status SUCCESS${C.reset}`);
  }

  // ── Step 6: Poll payment status ────────────────────────────────────────────
  step(6, TOTAL_STEPS, 'Polling payment status...');

  const MAX_POLLS = 30;
  const POLL_INTERVAL_MS = 3000;
  let finalStatus = 'PENDING';

  for (let i = 1; i <= MAX_POLLS; i++) {
    const statusRes = await api(
      args.apiUrl,
      'GET',
      `/subscription-payments/${payment.orderId}/status`,
      undefined,
      token,
    );

    if (!statusRes.ok) {
      warn(`Poll ${i}/${MAX_POLLS} — HTTP ${statusRes.status}`);
    } else {
      const statusData = statusRes.data as { data?: { status?: string } };
      const status = statusData.data?.status || 'UNKNOWN';
      info(`Poll ${i}/${MAX_POLLS} — status: ${C.bold}${status}${C.reset}`);

      if (status === 'SUCCESS' || status === 'FAILED' || status === 'USER_DROPPED') {
        finalStatus = status;
        break;
      }
    }

    if (i < MAX_POLLS) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // ── Step 7: Print result ───────────────────────────────────────────────────
  step(7, TOTAL_STEPS, 'Result');

  console.log('');
  if (finalStatus === 'SUCCESS') {
    console.log(`  ${C.green}${C.bold}PAYMENT SUCCESSFUL${C.reset}`);
    success(`Order ${payment.orderId} completed.`);

    // Fetch updated subscription
    const updatedSub = await api(args.apiUrl, 'GET', '/subscription/my', undefined, token);
    if (updatedSub.ok) {
      const updatedData = updatedSub.data as { data?: { tierKey?: string; paidEndAt?: string } };
      const sub = updatedData.data;
      if (sub) {
        highlight('New tier:    ', sub.tierKey || 'unknown');
        highlight('Paid until:  ', sub.paidEndAt || 'N/A');
      }
    }
  } else if (finalStatus === 'FAILED' || finalStatus === 'USER_DROPPED') {
    console.log(`  ${C.red}${C.bold}PAYMENT ${finalStatus}${C.reset}`);
    error(`Order ${payment.orderId} did not succeed.`);
  } else {
    console.log(`  ${C.yellow}${C.bold}PAYMENT STILL PENDING${C.reset}`);
    warn(`Order ${payment.orderId} has not reached a terminal state.`);
    warn('The payment may still be processing. Check again later or simulate the webhook.');
  }

  console.log(`\n${C.bold}${'='.repeat(50)}${C.reset}\n`);
}

main().catch((err) => {
  console.error(`\n${C.red}Fatal error:${C.reset}`, err);
  process.exit(1);
});
