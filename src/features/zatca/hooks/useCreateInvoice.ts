import { useCallback, useState } from 'react';
import { createInvoice } from '../services/invoiceService';
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
    setIsLoading(true);
    setError(null);
    try {
      const invoiceResult = createInvoice(params, config);
      setResult(invoiceResult);
      return invoiceResult;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invoice creation failed';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { create, result, error, isLoading };
}
