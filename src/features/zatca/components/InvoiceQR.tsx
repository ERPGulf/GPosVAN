import { useCallback, useRef } from 'react';
import { InteractionManager, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface InvoiceQRProps {
  qrData: string;
  size?: number;
  /** Optional callback — receives the QR image as a base64-encoded PNG string (no data: prefix). */
  onCapturePng?: (base64Png: string) => void;
}

/**
 * Attempt `toDataURL` with retries.
 *
 * On Fabric (New Architecture) the native `RNSVGSvgView` may not be
 * registered in the view registry at the instant `getRef` fires.  Calling
 * `toDataURL` too early results in:
 *   "Invalid svg returned from registry, expecting RNSVGSvgView, got: (null)"
 *
 * Waiting for the current interaction to finish and then retrying (up to 3
 * times with a small backoff) reliably avoids this.
 */
function captureWithRetry(
  ref: any,
  callback: (base64: string) => void,
  attempt = 0,
) {
  const MAX_ATTEMPTS = 3;
  const DELAY_MS = 150; // base delay; doubles each retry

  const doCapture = () => {
    try {
      ref.toDataURL((base64: string) => {
        callback(base64);
      });
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(
          () => captureWithRetry(ref, callback, attempt + 1),
          DELAY_MS * Math.pow(2, attempt),
        );
      } else {
        console.warn('[InvoiceQR] toDataURL failed after retries:', err);
      }
    }
  };

  if (attempt === 0) {
    // On the first call, wait until React Native has flushed all pending
    // UI operations so the native view is definitely in the registry.
    InteractionManager.runAfterInteractions(() => {
      setTimeout(doCapture, DELAY_MS);
    });
  } else {
    doCapture();
  }
}

export function InvoiceQR({ qrData, size = 200, onCapturePng }: InvoiceQRProps) {
  const svgRef = useRef<any>(null);
  const capturedRef = useRef(false);

  const handleGetRef = useCallback(
    (ref: any) => {
      svgRef.current = ref;
      // Capture PNG once the ref is available
      if (ref && onCapturePng && !capturedRef.current) {
        capturedRef.current = true;
        captureWithRetry(ref, onCapturePng);
      }
    },
    [onCapturePng],
  );

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* qrData is already the base64 TLV string and should be encoded as-is in the QR */}
      <QRCode value={qrData} size={size} getRef={handleGetRef} />
    </View>
  );
}
