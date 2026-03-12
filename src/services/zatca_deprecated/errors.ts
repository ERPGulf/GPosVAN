/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – error types                                   */
/* ------------------------------------------------------------------ */

/**
 * Typed error for ZATCA pipeline failures.
 * The `step` property identifies which pipeline stage failed.
 */
export class ZatcaError extends Error {
  readonly step: string;

  constructor(step: string, message: string, cause?: unknown) {
    super(`[ZATCA:${step}] ${message}`);
    this.name = 'ZatcaError';
    this.step = step;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
