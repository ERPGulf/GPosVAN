import { useCallback, useState } from 'react';
import { createInvoice } from '../services/invoiceService';
import { zatcaLogger } from '../services/zatcaLogger';
import type { InvoiceParams, InvoiceResult, ZatcaConfig } from '../types';

interface UseCreateInvoiceReturn {
  create: (params: InvoiceParams, config: ZatcaConfig) => InvoiceResult | null;
  result: InvoiceResult | null;
  error: string | null;
  isLoading: boolean;
}

export function useCreateInvoice(): UseCreateInvoiceReturn {
  const [result, setResult] = useState<InvoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const create = useCallback((params: InvoiceParams, config: ZatcaConfig): InvoiceResult | null => {
    const startedAt = Date.now();
    setIsLoading(true);
    setError(null);

    zatcaLogger.info('useCreateInvoice.create called', {
      invoiceUUID: params.invoiceUUID,
      invoiceNumber: params.invoiceNumber,
      itemCount: params.cartItems.length,
      isTaxIncludedInPrice: config.isTaxIncludedInPrice,
    });

    try {
      const invoiceResult = createInvoice(params, config);
      setResult(invoiceResult);
      zatcaLogger.info('useCreateInvoice.create succeeded', {
        invoiceUUID: params.invoiceUUID,
        durationMs: Date.now() - startedAt,
      });
      return invoiceResult;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invoice creation failed';
      setError(message);
      zatcaLogger.error('useCreateInvoice.create failed', e, {
        invoiceUUID: params.invoiceUUID,
        durationMs: Date.now() - startedAt,
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { create, result, error, isLoading };
}
