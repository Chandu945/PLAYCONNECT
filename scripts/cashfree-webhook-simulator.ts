#!/usr/bin/env npx ts-node
/**
 * Cashfree Webhook Simulator
 *
 * Simulates a Cashfree payment webhook for local testing.
 *
 * Usage:
 *   npx ts-node scripts/cashfree-webhook-simulator.ts \
 *     --order-id pc_sub_20240315_abc123 \
 *     --status SUCCESS \
 *     --amount 299 \
 *     --endpoint subscription
 *
 * Options:
 *   --order-id     The order ID to simulate (required)
 *   --status       Payment status: SUCCESS | FAILED | USER_DROPPED (default: SUCCESS)
 *   --amount       Order amount in INR (default: 299)
 *   --target       API base URL (default: http://localhost:3001)
 *   --endpoint     Webhook endpoint: subscription | fee (default: subscription)
 *   --secret       Webhook secret (default: from CASHFREE_WEBHOOK_SECRET env var)
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
};

function info(msg: string): void {
  console.log(`${C.cyan}[INFO]${C.reset} ${msg}`);
}

function success(msg: string): void {
  console.log(`${C.green}[OK]${C.reset}   ${msg}`);
}

function error(msg: string): void {
  console.error(`${C.red}[ERR]${C.reset}  ${msg}`);
}

function warn(msg: string): void {
  console.log(`${C.yellow}[WARN]${C.reset} ${msg}`);
}

// ── Arg parsing ──────────────────────────────────────────────────────────────

interface CliArgs {
  orderId: string;
  status: string;
  amount: number;
  target: string;
  endpoint: 'subscription' | 'fee';
  secret: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      const key = args[i].replace(/^--/, '');
      map[key] = args[++i];
    }
  }

  if (!map['order-id']) {
    error('Missing required argument: --order-id');
    console.log(`
${C.bold}Usage:${C.reset}
  npx ts-node scripts/cashfree-webhook-simulator.ts \\
    --order-id <orderId> \\
    --status SUCCESS \\
    --amount 299 \\
    --endpoint subscription

${C.bold}Options:${C.reset}
  --order-id     The order ID to simulate ${C.red}(required)${C.reset}
  --status       SUCCESS | FAILED | USER_DROPPED (default: SUCCESS)
  --amount       Order amount in INR (default: 299)
  --target       API base URL (default: http://localhost:3001)
  --endpoint     subscription | fee (default: subscription)
  --secret       Webhook secret (default: CASHFREE_WEBHOOK_SECRET env var)
`);
    process.exit(1);
  }

  const validStatuses = ['SUCCESS', 'FAILED', 'USER_DROPPED'];
  const status = (map['status'] || 'SUCCESS').toUpperCase();
  if (!validStatuses.includes(status)) {
    error(`Invalid --status "${status}". Must be one of: ${validStatuses.join(', ')}`);
    process.exit(1);
  }

  const endpoint = (map['endpoint'] || 'subscription') as 'subscription' | 'fee';
  if (endpoint !== 'subscription' && endpoint !== 'fee') {
    error(`Invalid --endpoint "${endpoint}". Must be "subscription" or "fee".`);
    process.exit(1);
  }

  const secret = map['secret'] || process.env.CASHFREE_WEBHOOK_SECRET || '';
  if (!secret) {
    warn('No webhook secret provided. Set --secret or CASHFREE_WEBHOOK_SECRET env var.');
    warn('The API will likely reject the webhook with a signature error.');
  }

  return {
    orderId: map['order-id'],
    status,
    amount: Number(map['amount'] || '299'),
    target: map['target'] || 'http://localhost:3001',
    endpoint,
    secret,
  };
}

// ── Webhook payload ──────────────────────────────────────────────────────────

interface CashfreeWebhookPayload {
  data: {
    order: {
      order_id: string;
      order_amount: number;
      order_currency: string;
      order_status: string;
    };
    payment: {
      cf_payment_id: number;
      payment_status: string;
      payment_amount: number;
      payment_currency: string;
      payment_method: {
        upi?: { channel: string; upi_id: string };
      };
      payment_time: string;
    };
  };
  event_time: string;
  type: string;
}

function buildPayload(args: CliArgs): CashfreeWebhookPayload {
  const now = new Date().toISOString();
  return {
    data: {
      order: {
        order_id: args.orderId,
        order_amount: args.amount,
        order_currency: 'INR',
        order_status: args.status === 'SUCCESS' ? 'PAID' : 'ACTIVE',
      },
      payment: {
        cf_payment_id: Math.floor(1000000 + Math.random() * 9000000),
        payment_status: args.status,
        payment_amount: args.amount,
        payment_currency: 'INR',
        payment_method: {
          upi: { channel: 'collect', upi_id: 'test@upi' },
        },
        payment_time: now,
      },
    },
    event_time: now,
    type: 'PAYMENT_' + (args.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED') + '_WEBHOOK',
  };
}

// ── Signature ────────────────────────────────────────────────────────────────

function sign(body: string, timestamp: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(timestamp + body)
    .digest('base64');
}

// ── Endpoint mapping ─────────────────────────────────────────────────────────

const ENDPOINT_PATHS: Record<string, string> = {
  subscription: '/api/v1/subscription-payments/cashfree/webhook',
  fee: '/api/v1/parent/fee-payments/cashfree/webhook',
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}Cashfree Webhook Simulator${C.reset}\n`);

  const args = parseArgs();
  const payload = buildPayload(args);
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(body, timestamp, args.secret);

  const webhookPath = ENDPOINT_PATHS[args.endpoint];
  const url = `${args.target}${webhookPath}`;

  info(`Order ID:  ${C.bold}${args.orderId}${C.reset}`);
  info(`Status:    ${C.bold}${args.status}${C.reset}`);
  info(`Amount:    ${C.bold}${args.amount} INR${C.reset}`);
  info(`Endpoint:  ${C.bold}${args.endpoint}${C.reset} (${webhookPath})`);
  info(`Target:    ${C.bold}${url}${C.reset}`);
  console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`);

  info('Sending webhook POST...');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp,
      },
      body,
    });

    const resBody = await res.text();
    let resJson: unknown;
    try {
      resJson = JSON.parse(resBody);
    } catch {
      resJson = resBody;
    }

    console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`);

    if (res.ok) {
      success(`HTTP ${res.status} ${res.statusText}`);
    } else {
      error(`HTTP ${res.status} ${res.statusText}`);
    }

    info('Response body:');
    console.log(JSON.stringify(resJson, null, 2));
    console.log('');
  } catch (err) {
    console.log(`${C.dim}${'─'.repeat(60)}${C.reset}`);
    error(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
    error('Is the API server running?');
    process.exit(1);
  }
}

main();
