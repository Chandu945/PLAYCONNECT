import { Platform } from 'react-native';
import { env } from '../env';

/**
 * Opens Cashfree checkout.
 *
 * - Web: Uses the Cashfree JS SDK (loaded from CDN) to render a payment modal.
 * - Native: Opens web checkout in-app via the Cashfree React Native SDK (future).
 *           Falls back to Linking.openURL for basic flow.
 */
export async function openCashfreeCheckout(
  paymentSessionId: string,
  _orderId: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    return openWebCheckout(paymentSessionId);
  }

  // Native fallback — open Cashfree checkout via Linking
  // Note: For production native apps, integrate react-native-cashfree-pg-sdk
  const { Linking } = await import('react-native');
  const isSandbox = env.APP_ENV !== 'production';
  const baseUrl = isSandbox
    ? 'https://sandbox.cashfree.com/pg/orders/sessions'
    : 'https://cashfree.com/pg/orders/sessions';
  const checkoutUrl = `${baseUrl}/${paymentSessionId}`;
  await Linking.openURL(checkoutUrl);
}

/**
 * Load the Cashfree JS SDK from CDN and open checkout in a modal/redirect.
 */
async function openWebCheckout(paymentSessionId: string): Promise<void> {
  const cashfree = await loadCashfreeSDK();

  return new Promise<void>((resolve, reject) => {
    try {
      const result = cashfree.checkout({
        paymentSessionId,
        redirectTarget: '_modal',
      });

      // The SDK returns a promise-like that resolves when the modal closes
      if (result && typeof result.then === 'function') {
        result.then(() => resolve()).catch(() => resolve());
      } else {
        // Modal opened — resolve immediately; polling handles the rest
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

// Singleton: reuse the Cashfree SDK instance once loaded
let cashfreeInstance: CashfreeInstance | null = null;

interface CashfreeInstance {
  checkout(options: {
    paymentSessionId: string;
    redirectTarget?: '_self' | '_modal' | '_blank';
  }): Promise<void> | void;
}

interface CashfreeLoader {
  initialise(options: { mode: string }): CashfreeInstance;
}

async function loadCashfreeSDK(): Promise<CashfreeInstance> {
  if (cashfreeInstance) return cashfreeInstance;

  const mode = env.APP_ENV === 'production' ? 'production' : 'sandbox';

  // Try the npm package first (bundled by webpack)
  try {
    const { load } = await import('@cashfreepayments/cashfree-js');
    const cf = await (load as (options: { mode: string }) => Promise<CashfreeInstance>)({ mode });
    cashfreeInstance = cf;
    return cf;
  } catch {
    // npm package not available — fall back to CDN script tag
  }

  // CDN fallback: inject <script> and wait for window.Cashfree
  return new Promise<CashfreeInstance>((resolve, reject) => {
    const existing = document.querySelector('script[src*="sdk.cashfree.com"]');
    if (existing && (window as unknown as Record<string, unknown>)['Cashfree']) {
      const cf = ((window as unknown as Record<string, CashfreeLoader>)['Cashfree'] as CashfreeLoader).initialise({ mode });
      cashfreeInstance = cf;
      resolve(cf);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = () => {
      try {
        const cf = ((window as unknown as Record<string, CashfreeLoader>)['Cashfree'] as CashfreeLoader).initialise({ mode });
        cashfreeInstance = cf;
        resolve(cf);
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.head.appendChild(script);
  });
}
