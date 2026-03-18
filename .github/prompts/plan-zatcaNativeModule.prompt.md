# Plan: ZATCA Native Module for React Native Expo

## TL;DR
Port the C# ZATCA e-invoicing feature to this Expo React Native app using an **Expo Module** for native crypto operations (XML C14N canonicalization, ECDSA signing, X509 certificate parsing) with a TypeScript orchestration layer for XML building, QR generation, and invoice workflow.

## Architecture Decision
The `xml-crypto` library doesn't work in React Native. Instead of fighting JS limitations, we create a **single Expo native module** (`zatca-crypto`) that handles all crypto/XML operations that require native APIs, and keep everything else (XML string building, TLV encoding, QR, workflow orchestration) in TypeScript.

**What goes native (iOS Swift + Android Kotlin):**
- XML C14N canonicalization (`XmlDsigC14NTransform` equivalent)
- XSLT-like tag removal (UBLExtensions, Signature, QR ref) before canonicalization
- ECDSA-SHA256 signing with PEM private key
- X509 certificate parsing (issuer, serial number, signature bytes, public key bytes)
- SHA-256 hashing (for consistency, though `expo-crypto` exists)

**What stays in TypeScript:**
- UBL 2.1 XML invoice construction (string templates, no DOM needed)
- Signed properties XML template generation
- TLV encoding for ZATCA QR code
- Invoice hash computation orchestration (calls native for C14N + SHA-256)
- QR code rendering (`react-native-qrcode-svg`)
- ZATCA config/credentials management (local storage)
- Integration with existing cart/checkout flow

## Steps

### Phase 1: Expo Module Scaffold (`zatca-crypto`)
> This phase creates the native module shell. All subsequent phases depend on it.

1. **Create the Expo module** using `npx create-expo-module@latest --local zatca-crypto` inside the project. This scaffolds `modules/zatca-crypto/` with Swift (iOS), Kotlin (Android), and TS binding.
   - Files created: `modules/zatca-crypto/expo-module.config.json`, `modules/zatca-crypto/index.ts`, `modules/zatca-crypto/src/ZatcaCryptoModule.ts`, `modules/zatca-crypto/ios/ZatcaCryptoModule.swift`, `modules/zatca-crypto/android/src/main/java/.../ZatcaCryptoModule.kt`

2. **Register the module in `app.json`** under `plugins` — Expo auto-links local modules from `./modules/` but verify the config plugin path is added.

3. **Define the TypeScript interface** in `modules/zatca-crypto/src/ZatcaCryptoModule.ts`:
   - `canonicalizeXml(xmlString: string): string` — C14N of full XML
   - `removeTagsAndCanonicalize(xmlString: string): string` — removes UBLExtensions, Signature, QR AdditionalDocumentReference, then C14N
   - `sha256Hash(data: string): { hex: string; base64: string }` — SHA-256 hash returning both hex and base64
   - `signECDSA(data: string, privateKeyPem: string): { signatureBase64: string; signatureBytes: number[] }` — ECDSA-SHA256 sign
   - `parseCertificate(certPem: string): { issuer: string; serialNumber: string; signatureBase64: string; signatureBytes: number[]; publicKeyBase64: string; publicKeyBytes: number[]; rawBase64: string }` — parse X509 cert
   - `computeCertificateDigest(certContent: string): string` — SHA-256 hex of cert content, then base64 of the hex string (matches C# `getDigestValue`)

### Phase 2: iOS Native Implementation (Swift)
> *Parallel with Phase 3*

4. **Implement XML canonicalization** in `ZatcaCryptoModule.swift`:
   - Use `libxml2` (available on iOS) for C14N — `xmlC14NDocDumpMemory` with `XML_C14N_1_1` mode
   - For tag removal: parse with `XMLDocument`/`XMLParser`, remove matching nodes, serialize, then canonicalize

5. **Implement ECDSA signing**:
   - Parse PEM private key → strip headers → base64 decode → use `SecKeyCreateWithData` with `kSecAttrKeyTypeECSECPrimeRandom`
   - Sign with `SecKeyCreateSignature` using `.ecdsaSignatureMessageX962SHA256`
   - Return DER-encoded signature as base64

6. **Implement X509 certificate parsing**:
   - Use `SecCertificateCreateWithData` to load cert
   - Extract issuer, serial number using `SecCertificateCopyValues` or by parsing the DER ASN.1 structure
   - Extract public key via `SecCertificateCopyKey` → `SecKeyCopyExternalRepresentation`
   - Extract signature bytes from the certificate's ASN.1 structure

7. **Implement SHA-256 hashing**:
   - Use `CryptoKit.SHA256` or `CC_SHA256` from CommonCrypto
   - Return both hex string and base64

### Phase 3: Android Native Implementation (Kotlin)
> *Parallel with Phase 2*

8. **Implement XML canonicalization**:
   - Use `javax.xml.crypto.dsig.TransformService` with `CanonicalizationMethod.INCLUSIVE_WITH_COMMENTS` or use Apache Santuario (`org.apache.xml.security`) which is available on Android
   - Alternative: Bundle `xmlsec` as a dependency in the Android module's `build.gradle`
   - For tag removal: use `javax.xml.parsers.DocumentBuilderFactory` + XPath to remove nodes, then canonicalize

9. **Implement ECDSA signing**:
   - Use `java.security.Signature` with `SHA256withECDSA`
   - Parse PEM private key with `KeyFactory.getInstance("EC")` + `PKCS8EncodedKeySpec`
   - Return DER signature as base64

10. **Implement X509 certificate parsing**:
    - Use `java.security.cert.CertificateFactory` → `X509Certificate`
    - `cert.issuerDN.name`, `cert.serialNumber.toString()`, `cert.signature`, `cert.publicKey.encoded`

11. **Implement SHA-256 hashing**:
    - Use `java.security.MessageDigest.getInstance("SHA-256")`

### Phase 4: TypeScript ZATCA Feature Layer
> *Depends on Phase 1 (TS interface). Can start before Phases 2-3 are complete by mocking the native module.*

12. **Create `src/features/zatca/types/` directory** with ZATCA-specific types:
    - `ZatcaConfig` — certificate, publicKey, privateKey, taxId, companyRegNo, address, abbr
    - `InvoiceParams` — customer, cartItems, tax, totals, date, previousHash, invoiceNumber, discount
    - `InvoiceType` — enum for simplified (0200000) vs standard (0100000)

13. **Create `src/features/zatca/services/zatcaConfig.ts`** — manages ZATCA credentials from local config/AsyncStorage:
    - `getZatcaConfig(): ZatcaConfig`
    - `setZatcaConfig(config: ZatcaConfig): void`

14. **Create `src/features/zatca/services/xmlBuilder.ts`** — builds UBL 2.1 XML invoice as a string:
    - Port `CreateBaseXMLTags`, `CreateAdditionalReferenceXMLTags`, `AddAccountingSupplierParty`, `AddAccountingCustomerParty`, `CreateDeliveryAndPaymentTags`, `CreateAllowanceTags`, `CreateTaxTotalWithSubTotal`, `CreateLegalMonetaryTotalTags`, `CreateItemsTag`, `CreateUBLExtension`, `AddQRTag` logic
    - Use ES6 template literals for XML construction (no DOM library needed — the C# code builds XML programmatically but we can use string templates)
    - Support both simplified (388/0200000) and standard (388/0100000) invoice type codes

15. **Create `src/features/zatca/services/certificateUtils.ts`** — wraps native module certificate functions:
    - `getDigestValue(certContent: string): string` — SHA-256 → hex → base64(utf8(hex)), matching C# logic
    - `getCertificateSignature(certPem: string): string`
    - `signHashWithECDSA(data: string, privateKeyPem: string): { base64: string; bytes: number[] }`
    - `getCertificateInfo(certPem: string): { issuer, serialNumber, publicKeyBase64, signatureBytes }`

16. **Create `src/features/zatca/services/hashUtils.ts`** — hashing orchestration:
    - `generateInvoiceHash(xmlString: string): { hex: string; base64: string }` — calls native `removeTagsAndCanonicalize` → native `sha256Hash`
    - `generateSignedPropertiesHash(signingTime, issuerName, serialNumber, certDigest): string` — builds signed properties XML template → SHA-256 → hex → base64(utf8(hex))

17. **Create `src/features/zatca/services/qrUtils.ts`** — TLV encoding and QR data:
    - `getTlvForValue(tag: number, value: string | Uint8Array): Uint8Array` — TLV encoder matching C# logic
    - `getQRString(xmlHash, date, totalAmount, taxAmount, signature, publicKeyBytes, signatureBytes): string` — builds TLV-encoded base64 QR string with all 9 ZATCA tags
    - Uses `react-native-qrcode-svg` for rendering

18. **Create `src/features/zatca/services/invoiceService.ts`** — main orchestrator (port of C# `XMLHelper.CreateInvoice`):
    - `createInvoice(params: InvoiceParams): Promise<{ xml: string; qrData: string; invoiceHash: string }>` 
    - Flow: build XML → save temp → canonicalize (native) → compute invoice hash → compute signed properties hash → ECDSA sign → insert UBLExtension → insert QR placeholder → canonicalize final XML → compute QR data → update QR in XML → return final XML + QR data + hash for PIH

19. **Create `src/features/zatca/index.ts`** — re-export public API

### Phase 5: Integration with Checkout Flow
> *Depends on Phases 2, 3, 4*

20. **Create `src/features/zatca/hooks/useCreateInvoice.ts`** — React hook wrapping `invoiceService.createInvoice`, handles loading/error state

21. **Integrate into checkout** — modify `app/(protected)/checkout/index.tsx`:
    - After payment confirmation, call `createInvoice` with cart items, customer, totals
    - Store the generated invoice hash as PIH (Previous Invoice Hash) for next invoice
    - Store PIH in AsyncStorage or SQLite (existing drizzle setup)

22. **Add QR display component** — `src/features/zatca/components/InvoiceQR.tsx` using `react-native-qrcode-svg`

### Phase 6: Verification & Testing

23. **Unit test the TLV encoding** — verify byte output matches expected ZATCA format
24. **Test XML structure** — generate a sample invoice and validate XML against ZATCA's XSD schema offline
25. **Test hash chain** — verify invoice hash computation matches C# output for the same input data
26. **Test ECDSA signature** — sign known data with a test key and verify signature on both platforms
27. **Run prebuild and build**:
    - `npx expo prebuild --clean` to generate ios/ and android/ directories
    - `npx expo run:ios` / `npx expo run:android` to verify native module compiles
28. **End-to-end test** — create an invoice through the checkout flow and verify the XML output, QR code, and hash chain

## Relevant Files

### Existing (to modify)
- `app.json` — add `zatca-crypto` module plugin if needed
- `package.json` — add `react-native-qrcode-svg` and `react-native-svg` dependencies
- `app/(protected)/checkout/index.tsx` — integrate invoice creation after payment

### New: Native Module
- `modules/zatca-crypto/expo-module.config.json` — module config
- `modules/zatca-crypto/index.ts` — module entry point
- `modules/zatca-crypto/src/ZatcaCryptoModule.ts` — TS interface defining native methods
- `modules/zatca-crypto/ios/ZatcaCryptoModule.swift` — iOS implementation using Security framework + libxml2 + CryptoKit
- `modules/zatca-crypto/android/src/main/java/expo/modules/zatcacrypto/ZatcaCryptoModule.kt` — Android implementation using java.security + Apache Santuario

### New: TypeScript Feature Layer
- `src/features/zatca/types/index.ts` — ZatcaConfig, InvoiceParams, InvoiceType types
- `src/features/zatca/services/zatcaConfig.ts` — config storage
- `src/features/zatca/services/xmlBuilder.ts` — UBL XML construction
- `src/features/zatca/services/certificateUtils.ts` — certificate operations wrapper
- `src/features/zatca/services/hashUtils.ts` — hashing orchestration
- `src/features/zatca/services/qrUtils.ts` — TLV + QR data generation
- `src/features/zatca/services/invoiceService.ts` — main invoice creation orchestrator
- `src/features/zatca/hooks/useCreateInvoice.ts` — React hook
- `src/features/zatca/components/InvoiceQR.tsx` — QR display component
- `src/features/zatca/index.ts` — public exports

## Verification

1. **Compilation check**: `npx expo prebuild --clean` succeeds, then `npx expo run:ios` and `npx expo run:android` build without errors
2. **Native module loads**: Call `ZatcaCrypto.sha256Hash("test")` from JS and verify it returns the correct hash
3. **C14N validation**: Canonicalize a known XML string and compare output to expected C14N output
4. **Hash compatibility**: Use the same certificate + invoice data as C# app, verify identical `invoiceHash`, `signedPropertiesHash`, and `certificateDigest` values
5. **ECDSA signature verification**: Sign known data, verify with the corresponding public key
6. **Full invoice creation**: Generate an invoice via checkout flow → verify XML structure matches ZATCA UBL schema → verify QR TLV encoding → verify PIH chain for sequential invoices
7. **ZATCA sandbox test** (if API available): Submit generated XML to ZATCA sandbox/reporting API

## Decisions

- **Expo Module (not bare native module)**: Using Expo Modules API for cleaner integration with the managed workflow. Requires `expo prebuild` to generate native projects.
- **String-based XML building (not DOM)**: UBL XML construction uses template literals in TS. The C# code uses `XmlDocument` DOM API, but for creation-only (no querying), string templates are simpler and avoid needing a DOM library in RN.
- **Single native module**: All native crypto ops in one module (`zatca-crypto`) to minimize bridge overhead and simplify maintenance.
- **Both platforms**: iOS (Swift) and Android (Kotlin) implementations.
- **Both invoice types**: Supporting simplified (B2C, 0200000) and standard (B2B, 0100000) invoices.
- **ZATCA credentials in local config**: Stored via AsyncStorage, similar to C# AppSettings pattern.
- **PIH storage**: Previous Invoice Hash stored in SQLite (using existing drizzle/expo-sqlite setup) for invoice chain integrity.

## Further Considerations

1. **XML C14N on Android**: The standard Android SDK doesn't ship Apache Santuario by default. We may need to bundle `org.apache.xml.security:xmlsec` as a Gradle dependency in the Android module, or implement a minimal C14N ourselves. **Recommendation**: Add `xmlsec` dependency — it's well-tested and ensures correct canonicalization.

2. **Certificate storage security**: Currently planned for AsyncStorage (plaintext). For production, consider `expo-secure-store` for private key storage. **Recommendation**: Use `expo-secure-store` for the private key at minimum, AsyncStorage for non-sensitive config.

3. **ZATCA API reporting**: The C# code generates XML but the reporting/clearance API submission isn't shown. Will ZATCA API submission be needed in a later phase? **Recommendation**: Plan for it but exclude from this implementation scope — focus on XML generation first.
