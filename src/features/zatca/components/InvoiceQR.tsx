import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface InvoiceQRProps {
  qrData: string;
  size?: number;
  /** Optional callback — receives the QR image as a base64-encoded PNG string (no data: prefix). */
  onCapturePng?: (base64Png: string) => void;
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
        ref.toDataURL((base64: string) => {
          onCapturePng(base64);
        });
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
