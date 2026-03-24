import ExpoModulesCore
import Foundation
import CryptoKit
import Security
import libxml2

public class ZatcaCryptoModule: Module {
  private static let tag = "ZatcaCryptoModule"

  public func definition() -> ModuleDefinition {
    Name("ZatcaCryptoModule")

    // MARK: - canonicalizeXml
    Function("canonicalizeXml") { (xmlString: String) -> String in
      return try Self.canonicalize(xmlString)
    }

    // MARK: - removeTagsAndCanonicalize
    Function("removeTagsAndCanonicalize") { (xmlString: String) -> String in
      let cleaned = try Self.removeTags(from: xmlString)
      return try Self.canonicalize(cleaned)
    }

    // MARK: - sha256Hash
    Function("sha256Hash") { (data: String) -> [String: Any] in
      guard let bytes = data.data(using: .utf8) else {
        throw NSError(domain: "ZatcaCrypto", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid UTF-8 string"])
      }
      let digest = SHA256.hash(data: bytes)
      let hexString = digest.map { String(format: "%02x", $0) }.joined()
      let base64String = Data(digest).base64EncodedString()
      return ["hex": hexString, "base64": base64String]
    }

    // MARK: - signECDSA
    Function("signECDSA") { (data: String, privateKeyPem: String) -> [String: Any] in
      guard let dataBytes = data.data(using: .utf8) else {
        throw NSError(domain: "ZatcaCrypto", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid UTF-8 data"])
      }
      let privateKey = try Self.loadECPrivateKey(pem: privateKeyPem)
      var error: Unmanaged<CFError>?
      guard let signatureData = SecKeyCreateSignature(
        privateKey,
        .ecdsaSignatureMessageX962SHA256,
        dataBytes as CFData,
        &error
      ) as Data? else {
        let err = error?.takeRetainedValue()
        throw NSError(domain: "ZatcaCrypto", code: 3, userInfo: [NSLocalizedDescriptionKey: "ECDSA signing failed: \(err?.localizedDescription ?? "unknown")"])
      }
      let base64 = signatureData.base64EncodedString()
      let bytes = [UInt8](signatureData).map { Int($0) }
      return ["signatureBase64": base64, "signatureBytes": bytes]
    }

    // MARK: - parseCertificate
    Function("parseCertificate") { (certPem: String) -> [String: Any] in
      return try Self.parseCertificateInfo(pem: certPem)
    }

    // MARK: - computeCertificateDigest
    Function("computeCertificateDigest") { (certContent: String) -> String in
      guard let bytes = certContent.data(using: .utf8) else {
        throw NSError(domain: "ZatcaCrypto", code: 6, userInfo: [NSLocalizedDescriptionKey: "Invalid UTF-8 cert content"])
      }
      let digest = SHA256.hash(data: bytes)
      let hexString = digest.map { String(format: "%02x", $0) }.joined()
      guard let hexBytes = hexString.data(using: .utf8) else {
        throw NSError(domain: "ZatcaCrypto", code: 7, userInfo: [NSLocalizedDescriptionKey: "Failed to encode hex as UTF-8"])
      }
      return hexBytes.base64EncodedString()
    }

    // MARK: - createPemBundle
    Function("createPemBundle") { (certificate: String, publicKey: String, privateKey: String) -> String in
      return try Self.createPemBundle(certificate: certificate, publicKey: publicKey, privateKey: privateKey)
    }
  }

  // MARK: - XML Canonicalization via libxml2

  private static func canonicalize(_ xmlString: String) throws -> String {
    guard let xmlData = xmlString.data(using: .utf8) else {
      throw NSError(domain: "ZatcaCrypto", code: 10, userInfo: [NSLocalizedDescriptionKey: "Invalid UTF-8 XML"])
    }

    let doc = xmlData.withUnsafeBytes { (rawBuffer: UnsafeRawBufferPointer) -> xmlDocPtr? in
      let ptr = rawBuffer.baseAddress?.assumingMemoryBound(to: CChar.self)
      return xmlParseMemory(ptr, Int32(rawBuffer.count))
    }

    guard let doc = doc else {
      throw NSError(domain: "ZatcaCrypto", code: 11, userInfo: [NSLocalizedDescriptionKey: "Failed to parse XML"])
    }
    defer { xmlFreeDoc(doc) }

    var outputBuf: UnsafeMutablePointer<xmlChar>? = nil
    var outputLen: Int32 = 0

    // XML_C14N_1_1 = 2
    let result = xmlC14NDocDumpMemory(doc, nil, 2, nil, 0, &outputBuf)

    guard result >= 0, let buf = outputBuf else {
      throw NSError(domain: "ZatcaCrypto", code: 12, userInfo: [NSLocalizedDescriptionKey: "XML canonicalization failed"])
    }
    defer { xmlFree(buf) }

    let canonicalizedData = Data(bytes: buf, count: Int(result))
    guard let canonicalized = String(data: canonicalizedData, encoding: .utf8) else {
      throw NSError(domain: "ZatcaCrypto", code: 13, userInfo: [NSLocalizedDescriptionKey: "Failed to convert C14N output to string"])
    }
    return canonicalized
  }

  // MARK: - Remove tags (UBLExtensions, Signature, QR AdditionalDocumentReference)

  private static func removeTags(from xmlString: String) throws -> String {
    guard let xmlData = xmlString.data(using: .utf8) else {
      throw NSError(domain: "ZatcaCrypto", code: 20, userInfo: [NSLocalizedDescriptionKey: "Invalid UTF-8 XML"])
    }

    let doc = xmlData.withUnsafeBytes { (rawBuffer: UnsafeRawBufferPointer) -> xmlDocPtr? in
      let ptr = rawBuffer.baseAddress?.assumingMemoryBound(to: CChar.self)
      return xmlParseMemory(ptr, Int32(rawBuffer.count))
    }

    guard let doc = doc else {
      throw NSError(domain: "ZatcaCrypto", code: 21, userInfo: [NSLocalizedDescriptionKey: "Failed to parse XML for tag removal"])
    }
    defer { xmlFreeDoc(doc) }

    try Self.removeNodes(matchingXPath: "//*[local-name()='UBLExtensions']", in: doc)
    try Self.removeNodes(matchingXPath: "//*[local-name()='Invoice']/*[local-name()='Signature']", in: doc)
    try Self.removeNodes(matchingXPath: "//*[local-name()='AdditionalDocumentReference'][*[local-name()='ID' and text()='QR']]", in: doc)

    var outputBuf: UnsafeMutablePointer<xmlChar>? = nil
    var outputLen: Int32 = 0
    xmlDocDumpMemoryEnc(doc, &outputBuf, &outputLen, "UTF-8")

    guard let buf = outputBuf, outputLen >= 0 else {
      throw NSError(domain: "ZatcaCrypto", code: 22, userInfo: [NSLocalizedDescriptionKey: "Failed to serialize XML after tag removal"])
    }
    defer { xmlFree(buf) }

    let outputData = Data(bytes: buf, count: Int(outputLen))
    guard let output = String(data: outputData, encoding: .utf8) else {
      throw NSError(domain: "ZatcaCrypto", code: 23, userInfo: [NSLocalizedDescriptionKey: "Failed to convert XML output to string"])
    }

    return output
  }

  private static func removeNodes(matchingXPath xpath: String, in doc: xmlDocPtr) throws {
    guard let context = xmlXPathNewContext(doc) else {
      throw NSError(domain: "ZatcaCrypto", code: 24, userInfo: [NSLocalizedDescriptionKey: "Failed to create XPath context"])
    }
    defer { xmlXPathFreeContext(context) }

    let xpathObject: xmlXPathObjectPtr? = xpath.utf8CString.withUnsafeBufferPointer { buffer in
      guard let baseAddress = buffer.baseAddress else { return nil }
      let expression = UnsafeRawPointer(baseAddress).assumingMemoryBound(to: xmlChar.self)
      return xmlXPathEvalExpression(expression, context)
    }

    guard let xpathObject = xpathObject else {
      throw NSError(domain: "ZatcaCrypto", code: 25, userInfo: [NSLocalizedDescriptionKey: "Invalid XPath expression: \(xpath)"])
    }
    defer { xmlXPathFreeObject(xpathObject) }

    guard let nodeSet = xpathObject.pointee.nodesetval,
          nodeSet.pointee.nodeNr > 0,
          let nodeTab = nodeSet.pointee.nodeTab else {
      return
    }

    let count = Int(nodeSet.pointee.nodeNr)
    for index in stride(from: count - 1, through: 0, by: -1) {
      if let node = nodeTab[index] {
        xmlUnlinkNode(node)
        xmlFreeNode(node)
      }
    }
  }

  // MARK: - EC Private Key Loading

  private static func loadECPrivateKey(pem: String) throws -> SecKey {
    guard let keyData = decodePrivateKeyData(pem) else {
      throw NSError(domain: "ZatcaCrypto", code: 30, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 in private key PEM"])
    }

    // SecKeyCreateWithData for EC keys expects raw ANSI x9.63 key data.
    // We need to extract the raw private scalar from PKCS#8 or SEC1 DER wrappers.
    let rawKeyData = try Self.extractRawECPrivateKeyData(keyData)

    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
      kSecAttrKeySizeInBits as String: 256,
    ]

    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateWithData(rawKeyData as CFData, attributes as CFDictionary, &error) else {
      let err = error?.takeRetainedValue()
      throw NSError(domain: "ZatcaCrypto", code: 31, userInfo: [NSLocalizedDescriptionKey: "Failed to create EC private key: \(err?.localizedDescription ?? "unknown")"])
    }
    return privateKey
  }

  /// Extract raw EC private key bytes from PKCS#8 or SEC1 DER structures.
  /// SecKeyCreateWithData expects ANSI x9.63 format for EC keys.
  /// For a private-only key, that is just the raw 32-byte scalar.
  /// If a public key point is present in the SEC1 structure, we include it
  /// in x9.63 format: 04 || X || Y || D (65 + 32 = 97 bytes).
  private static func extractRawECPrivateKeyData(_ data: Data) throws -> Data {
    let bytes = [UInt8](data)

    // If it's already 32 bytes (raw scalar) or 97 bytes (x9.63 with public key), use directly
    if bytes.count == 32 || bytes.count == 97 {
      return data
    }

    // Try to detect if this is PKCS#8 or SEC1 by looking at ASN.1 structure
    guard bytes.count > 2, bytes[0] == 0x30 else {
      // Not an ASN.1 SEQUENCE; try passing raw bytes as-is
      return data
    }

    // Try PKCS#8 first (PrivateKeyInfo ::= SEQUENCE { version, algorithm, privateKey })
    if let sec1Bytes = try? Self.unwrapPkcs8ToSec1(bytes) {
      return try Self.extractSec1PrivateKey(sec1Bytes)
    }

    // Try SEC1 directly (ECPrivateKey ::= SEQUENCE { version, privateKey, ... })
    if let result = try? Self.extractSec1PrivateKey(bytes) {
      return result
    }

    // Fallback: return as-is and let SecKeyCreateWithData attempt to handle it
    return data
  }

  /// Unwrap PKCS#8 PrivateKeyInfo to get the inner SEC1 ECPrivateKey bytes.
  /// PKCS#8: SEQUENCE { INTEGER (version), SEQUENCE (algorithm), OCTET STRING (privateKey) }
  private static func unwrapPkcs8ToSec1(_ bytes: [UInt8]) throws -> [UInt8] {
    var offset = 0

    // Outer SEQUENCE
    guard bytes[offset] == 0x30 else {
      throw NSError(domain: "ZatcaCrypto", code: 33, userInfo: [NSLocalizedDescriptionKey: "PKCS#8: expected SEQUENCE"])
    }
    let (_, seqContentStart) = try Self.readLength(bytes, offset: offset + 1)
    offset = seqContentStart

    // Version INTEGER
    guard offset < bytes.count, bytes[offset] == 0x02 else {
      throw NSError(domain: "ZatcaCrypto", code: 33, userInfo: [NSLocalizedDescriptionKey: "PKCS#8: expected version INTEGER"])
    }
    let (verLen, verContentStart) = try Self.readLength(bytes, offset: offset + 1)
    offset = verContentStart + verLen

    // AlgorithmIdentifier SEQUENCE
    guard offset < bytes.count, bytes[offset] == 0x30 else {
      throw NSError(domain: "ZatcaCrypto", code: 33, userInfo: [NSLocalizedDescriptionKey: "PKCS#8: expected AlgorithmIdentifier SEQUENCE"])
    }
    let (algLen, algContentStart) = try Self.readLength(bytes, offset: offset + 1)
    offset = algContentStart + algLen

    // PrivateKey OCTET STRING (contains the SEC1 ECPrivateKey)
    guard offset < bytes.count, bytes[offset] == 0x04 else {
      throw NSError(domain: "ZatcaCrypto", code: 33, userInfo: [NSLocalizedDescriptionKey: "PKCS#8: expected privateKey OCTET STRING"])
    }
    let (pkLen, pkContentStart) = try Self.readLength(bytes, offset: offset + 1)
    let pkEnd = pkContentStart + pkLen

    guard pkEnd <= bytes.count else {
      throw NSError(domain: "ZatcaCrypto", code: 33, userInfo: [NSLocalizedDescriptionKey: "PKCS#8: truncated privateKey"])
    }

    return Array(bytes[pkContentStart..<pkEnd])
  }

  /// Extract raw EC private key data from SEC1 ECPrivateKey DER structure.
  /// ECPrivateKey ::= SEQUENCE { version INTEGER, privateKey OCTET STRING, [0] parameters, [1] publicKey }
  /// Returns either the 32-byte scalar or 97-byte x9.63 (04 || pubX || pubY || privD) format.
  private static func extractSec1PrivateKey(_ bytes: [UInt8]) throws -> Data {
    var offset = 0

    // Outer SEQUENCE
    guard bytes[offset] == 0x30 else {
      throw NSError(domain: "ZatcaCrypto", code: 34, userInfo: [NSLocalizedDescriptionKey: "SEC1: expected SEQUENCE"])
    }
    let (seqLen, seqContentStart) = try Self.readLength(bytes, offset: offset + 1)
    let seqEnd = seqContentStart + seqLen
    offset = seqContentStart

    // Version INTEGER
    guard offset < seqEnd, bytes[offset] == 0x02 else {
      throw NSError(domain: "ZatcaCrypto", code: 34, userInfo: [NSLocalizedDescriptionKey: "SEC1: expected version INTEGER"])
    }
    let (verLen, verContentStart) = try Self.readLength(bytes, offset: offset + 1)
    offset = verContentStart + verLen

    // Private key OCTET STRING
    guard offset < seqEnd, bytes[offset] == 0x04 else {
      throw NSError(domain: "ZatcaCrypto", code: 34, userInfo: [NSLocalizedDescriptionKey: "SEC1: expected privateKey OCTET STRING"])
    }
    let (pkLen, pkContentStart) = try Self.readLength(bytes, offset: offset + 1)
    let pkEnd = pkContentStart + pkLen
    guard pkEnd <= bytes.count else {
      throw NSError(domain: "ZatcaCrypto", code: 34, userInfo: [NSLocalizedDescriptionKey: "SEC1: truncated private key"])
    }

    let privateScalar = Array(bytes[pkContentStart..<pkEnd])
    offset = pkEnd

    // Look for optional [1] public key (tag 0xA1)
    var publicKeyPoint: [UInt8]? = nil
    while offset < seqEnd {
      let tag = bytes[offset]
      offset += 1
      let (len, contentStart) = try Self.readLength(bytes, offset: offset)
      let contentEnd = contentStart + len

      if tag == 0xA1, contentStart < contentEnd {
        // Public key is a BIT STRING inside the [1] context tag
        if bytes[contentStart] == 0x03 { // BIT STRING
          let (bsLen, bsContentStart) = try Self.readLength(bytes, offset: contentStart + 1)
          // Skip the "unused bits" byte (first byte of BIT STRING content)
          if bsContentStart + 1 < contentStart + 1 + bsLen {
            publicKeyPoint = Array(bytes[(bsContentStart + 1)..<(bsContentStart + bsLen)])
          }
        }
      }

      offset = contentEnd
    }

    // If we have the public key point (65 bytes: 04 || X || Y), build x9.63 format
    if let pubKey = publicKeyPoint, pubKey.count == 65, pubKey[0] == 0x04 {
      // x9.63 private key: 04 || X (32) || Y (32) || D (32) = 97 bytes
      var x963 = Data(pubKey)       // 04 || X || Y (65 bytes)
      x963.append(contentsOf: privateScalar)  // D (32 bytes)
      return x963
    }

    // No public key available; just return the raw scalar
    return Data(privateScalar)
  }

  private static func normalizePrivateKeyInput(_ rawValue: String) -> String {
    let direct = normalizeEscapedNewlines(rawValue)
    if isEcPrivateKeyPem(direct) {
      return direct
    }

    let decodedText = decodeBase64Text(direct)?.trimmingCharacters(in: .whitespacesAndNewlines)
    if let decodedText, isEcPrivateKeyPem(decodedText) {
      return normalizeEscapedNewlines(decodedText)
    }

    let decodedTwiceText = decodedText
      .flatMap { decodeBase64Text($0) }
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    if let decodedTwiceText, isEcPrivateKeyPem(decodedTwiceText) {
      return normalizeEscapedNewlines(decodedTwiceText)
    }

    return direct
  }

  private static func isEcPrivateKeyPem(_ value: String) -> Bool {
    return value.contains("-----BEGIN EC PRIVATE KEY-----") || value.contains("-----BEGIN PRIVATE KEY-----")
  }

  private static func decodePrivateKeyData(_ raw: String) -> Data? {
    let normalized = normalizePrivateKeyInput(raw)

    if let pemBody = extractPemBody(
      from: normalized,
      begin: "-----BEGIN PRIVATE KEY-----",
      end: "-----END PRIVATE KEY-----"
    ) {
      return decodeBase64Lenient(pemBody)
    }

    if let pemBody = extractPemBody(
      from: normalized,
      begin: "-----BEGIN EC PRIVATE KEY-----",
      end: "-----END EC PRIVATE KEY-----"
    ) {
      return decodeBase64Lenient(pemBody)
    }

    if let decodedText = decodeBase64Text(normalized) {
      if let pemBody = extractPemBody(
        from: decodedText,
        begin: "-----BEGIN PRIVATE KEY-----",
        end: "-----END PRIVATE KEY-----"
      ) {
        return decodeBase64Lenient(pemBody)
      }

      if let pemBody = extractPemBody(
        from: decodedText,
        begin: "-----BEGIN EC PRIVATE KEY-----",
        end: "-----END EC PRIVATE KEY-----"
      ) {
        return decodeBase64Lenient(pemBody)
      }
    }

    let compact = normalized
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")

    return decodeBase64Lenient(compact)
  }

  // MARK: - C# parity: certificate.pem content

  private static func createPemBundle(certificate: String, publicKey: String, privateKey: String) throws -> String {
    let certificateContent = try decodeUtf8FromBase64Strict(certificate, fieldName: "certificate")
    let publicKeyContent = try decodeUtf8FromBase64Strict(publicKey, fieldName: "public key")
    let privateKeyContent = try decodeUtf8FromBase64Strict(privateKey, fieldName: "private key")

    let certificateBody = extractCertificateBody(certificateContent)
    var lines: [String] = ["-----BEGIN CERTIFICATE-----"]

    var start = certificateBody.startIndex
    while start < certificateBody.endIndex {
      let end = certificateBody.index(start, offsetBy: 64, limitedBy: certificateBody.endIndex) ?? certificateBody.endIndex
      lines.append(String(certificateBody[start..<end]))
      start = end
    }

    lines.append("-----END CERTIFICATE-----")
    return lines.joined(separator: "\n") + "\n" + publicKeyContent + privateKeyContent
  }

  private static func decodeUtf8FromBase64Strict(_ value: String, fieldName: String) throws -> String {
    let normalized = normalizeEscapedNewlines(value).trimmingCharacters(in: .whitespacesAndNewlines)
    guard let decodedBytes = Data(base64Encoded: normalized),
          let decoded = String(data: decodedBytes, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) else {
      throw NSError(
        domain: "ZatcaCrypto",
        code: 32,
        userInfo: [NSLocalizedDescriptionKey: "Invalid ZATCA \(fieldName): expected base64-encoded UTF-8 content"]
      )
    }

    return decoded
  }

  private static func extractCertificateBody(_ value: String) -> String {
    return normalizeEscapedNewlines(value)
      .replacingOccurrences(of: "-----BEGIN CERTIFICATE-----", with: "")
      .replacingOccurrences(of: "-----END CERTIFICATE-----", with: "")
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // MARK: - X509 Certificate Parsing

  private static func parseCertificateInfo(pem: String) throws -> [String: Any] {
    guard let certData = decodeCertificateData(pem) else {
      throw NSError(domain: "ZatcaCrypto", code: 40, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 in certificate PEM"])
    }

    logCertDecode(
      stage: "parseCertificateInfo.inputBytes",
      details: "len=\(certData.count), der=\(isLikelyDerCertificate(certData)), prefixHex=\(bytePrefixHex(certData))"
    )

    guard let secCert = SecCertificateCreateWithData(nil, certData as CFData) else {
      logCertDecode(
        stage: "parseCertificateInfo.failure",
        details: "len=\(certData.count), der=\(isLikelyDerCertificate(certData)), prefixHex=\(bytePrefixHex(certData)), msg=Failed to create SecCertificate"
      )
      throw NSError(domain: "ZatcaCrypto", code: 41, userInfo: [NSLocalizedDescriptionKey: "Failed to create SecCertificate"])
    }

    // Raw DER data base64
    let rawBase64 = certData.base64EncodedString()

    // Parse the DER structure for issuer, serial number, and signature
    let parsed = try Self.parseDER(certData)

    // Extract public key
    var publicKeyBase64 = ""
    var publicKeyBytes: [Int] = []
    if let pubKey = SecCertificateCopyKey(secCert) {
      var error: Unmanaged<CFError>?
      if let pubKeyData = SecKeyCopyExternalRepresentation(pubKey, &error) as Data? {
        publicKeyBase64 = pubKeyData.base64EncodedString()
        publicKeyBytes = [UInt8](pubKeyData).map { Int($0) }
      }
    }

    logCertDecode(
      stage: "parseCertificateInfo.success",
      details: "issuerLen=\(parsed.issuer.count), serialLen=\(parsed.serialNumber.count)"
    )

    return [
      "issuer": parsed.issuer,
      "serialNumber": parsed.serialNumber,
      "signatureBase64": parsed.signatureBase64,
      "signatureBytes": parsed.signatureBytes,
      "publicKeyBase64": publicKeyBase64,
      "publicKeyBytes": publicKeyBytes,
      "rawBase64": rawBase64,
    ]
  }

  private static func decodeCertificateData(_ raw: String) -> Data? {
    let normalized = normalizeEscapedNewlines(raw)

    logCertDecode(
      stage: "input",
      details: "rawLen=\(raw.count), normalizedLen=\(normalized.count), hasPem=\(normalized.contains(\"BEGIN CERTIFICATE\")), prefix=\(textPrefix(normalized))"
    )

    let directPemBody = extractPemBody(
      from: normalized,
      begin: "-----BEGIN CERTIFICATE-----",
      end: "-----END CERTIFICATE-----"
    )
    logCertDecode(
      stage: "directPemBody",
      details: "present=\(directPemBody != nil), len=\(directPemBody?.count ?? 0)"
    )

    if let directPemBody {
      let firstDecode = decodeBase64Lenient(directPemBody)
      logCertDecode(
        stage: "directPemBody.firstDecode",
        details: "decoded=\(firstDecode != nil), len=\(firstDecode?.count ?? 0), der=\(firstDecode.map(isLikelyDerCertificate) ?? false), prefixHex=\(firstDecode.map(bytePrefixHex) ?? \"\")"
      )

      if let firstDecode {
        if isLikelyDerCertificate(firstDecode) {
          logCertDecode(stage: "directPemBody.firstDecode", details: "using direct DER bytes")
          return firstDecode
        }

        let nestedText = String(data: firstDecode, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        logCertDecode(
          stage: "directPemBody.nestedText",
          details: "len=\(nestedText.count), hasPem=\(nestedText.contains(\"BEGIN CERTIFICATE\")), prefix=\(textPrefix(nestedText))"
        )

        let nestedPemBody = extractPemBody(
          from: nestedText,
          begin: "-----BEGIN CERTIFICATE-----",
          end: "-----END CERTIFICATE-----"
        )
        if let nestedPemBody {
          let nestedPemDer = decodeBase64Lenient(nestedPemBody)
          logCertDecode(
            stage: "directPemBody.nestedPemDer",
            details: "decoded=\(nestedPemDer != nil), len=\(nestedPemDer?.count ?? 0), der=\(nestedPemDer.map(isLikelyDerCertificate) ?? false), prefixHex=\(nestedPemDer.map(bytePrefixHex) ?? \"\")"
          )

          if let nestedPemDer, isLikelyDerCertificate(nestedPemDer) {
            logCertDecode(stage: "directPemBody.nestedPemDer", details: "using nested PEM DER bytes")
            return nestedPemDer
          }
        }

        let nestedDer = decodeBase64Lenient(nestedText)
        logCertDecode(
          stage: "directPemBody.nestedDer",
          details: "decoded=\(nestedDer != nil), len=\(nestedDer?.count ?? 0), der=\(nestedDer.map(isLikelyDerCertificate) ?? false), prefixHex=\(nestedDer.map(bytePrefixHex) ?? \"\")"
        )

        if let nestedDer, isLikelyDerCertificate(nestedDer) {
          logCertDecode(stage: "directPemBody.nestedDer", details: "using nested base64 DER bytes")
          return nestedDer
        }

        logCertDecode(stage: "directPemBody", details: "falling back to firstDecode bytes (non-DER)")
        return firstDecode
      }
    }

    let decodedText = decodeBase64Text(normalized)
    logCertDecode(
      stage: "decodedText",
      details: "decoded=\(decodedText != nil), len=\(decodedText?.count ?? 0), hasPem=\(decodedText?.contains(\"BEGIN CERTIFICATE\") ?? false), prefix=\(decodedText.map(textPrefix) ?? \"\")"
    )

    if let decodedText {
      let nestedPemBody = extractPemBody(
        from: decodedText,
        begin: "-----BEGIN CERTIFICATE-----",
        end: "-----END CERTIFICATE-----"
      )

      if let nestedPemBody {
        let firstDecode = decodeBase64Lenient(nestedPemBody)
        logCertDecode(
          stage: "decodedText.firstDecode",
          details: "decoded=\(firstDecode != nil), len=\(firstDecode?.count ?? 0), der=\(firstDecode.map(isLikelyDerCertificate) ?? false), prefixHex=\(firstDecode.map(bytePrefixHex) ?? \"\")"
        )

        if let firstDecode {
          if isLikelyDerCertificate(firstDecode) {
            logCertDecode(stage: "decodedText.firstDecode", details: "using direct DER bytes")
            return firstDecode
          }

          let nestedText = String(data: firstDecode, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
          logCertDecode(
            stage: "decodedText.nestedText",
            details: "len=\(nestedText.count), hasPem=\(nestedText.contains(\"BEGIN CERTIFICATE\")), prefix=\(textPrefix(nestedText))"
          )

          let nestedPemBody2 = extractPemBody(
            from: nestedText,
            begin: "-----BEGIN CERTIFICATE-----",
            end: "-----END CERTIFICATE-----"
          )
          if let nestedPemBody2 {
            let nestedPemDer2 = decodeBase64Lenient(nestedPemBody2)
            logCertDecode(
              stage: "decodedText.nestedPemDer2",
              details: "decoded=\(nestedPemDer2 != nil), len=\(nestedPemDer2?.count ?? 0), der=\(nestedPemDer2.map(isLikelyDerCertificate) ?? false), prefixHex=\(nestedPemDer2.map(bytePrefixHex) ?? \"\")"
            )

            if let nestedPemDer2, isLikelyDerCertificate(nestedPemDer2) {
              logCertDecode(stage: "decodedText.nestedPemDer2", details: "using nested PEM DER bytes")
              return nestedPemDer2
            }
          }

          let nestedDer = decodeBase64Lenient(nestedText)
          logCertDecode(
            stage: "decodedText.nestedDer",
            details: "decoded=\(nestedDer != nil), len=\(nestedDer?.count ?? 0), der=\(nestedDer.map(isLikelyDerCertificate) ?? false), prefixHex=\(nestedDer.map(bytePrefixHex) ?? \"\")"
          )

          if let nestedDer, isLikelyDerCertificate(nestedDer) {
            logCertDecode(stage: "decodedText.nestedDer", details: "using nested base64 DER bytes")
            return nestedDer
          }

          logCertDecode(stage: "decodedText", details: "falling back to firstDecode bytes (non-DER)")
          return firstDecode
        }
      }
    }

    let compact = normalized
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")

    guard let firstDecode = decodeBase64Lenient(compact) else {
      return nil
    }

    logCertDecode(
      stage: "compact.firstDecode",
      details: "len=\(firstDecode.count), der=\(isLikelyDerCertificate(firstDecode)), prefixHex=\(bytePrefixHex(firstDecode))"
    )

    if isLikelyDerCertificate(firstDecode) {
      logCertDecode(stage: "compact.firstDecode", details: "using compact DER bytes")
      return firstDecode
    }

    let nestedText = String(data: firstDecode, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let nestedPemBody = extractPemBody(
      from: nestedText,
      begin: "-----BEGIN CERTIFICATE-----",
      end: "-----END CERTIFICATE-----"
    )
    if let nestedPemBody {
      let nestedPemDer = decodeBase64Lenient(nestedPemBody)
      logCertDecode(
        stage: "compact.nestedPemDer",
        details: "decoded=\(nestedPemDer != nil), len=\(nestedPemDer?.count ?? 0), der=\(nestedPemDer.map(isLikelyDerCertificate) ?? false), prefixHex=\(nestedPemDer.map(bytePrefixHex) ?? \"\")"
      )

      if let nestedPemDer, isLikelyDerCertificate(nestedPemDer) {
        logCertDecode(stage: "compact.nestedPemDer", details: "using nested PEM DER bytes")
        return nestedPemDer
      }
    }

    let secondDecode = decodeBase64Lenient(nestedText)
    logCertDecode(
      stage: "compact.secondDecode",
      details: "decoded=\(secondDecode != nil), len=\(secondDecode?.count ?? 0), der=\(secondDecode.map(isLikelyDerCertificate) ?? false), prefixHex=\(secondDecode.map(bytePrefixHex) ?? \"\")"
    )

    if let secondDecode, isLikelyDerCertificate(secondDecode) {
      logCertDecode(stage: "compact.secondDecode", details: "using second decode DER bytes")
      return secondDecode
    }

    logCertDecode(stage: "fallback", details: "returning firstDecode non-DER bytes len=\(firstDecode.count)")
    return firstDecode
  }

  private static func decodeBase64Text(_ value: String) -> String? {
    guard let data = decodeBase64Lenient(value) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func decodeBase64Lenient(_ value: String) -> Data? {
    var sanitized = value
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: "\t", with: "")
      .replacingOccurrences(of: " ", with: "")
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")

    sanitized = sanitized.filter { char in
      char.isASCII && (char.isLetter || char.isNumber || char == "+" || char == "/" || char == "=")
    }

    guard !sanitized.isEmpty else {
      return nil
    }

    let remainder = sanitized.count % 4
    if remainder != 0 {
      sanitized += String(repeating: "=", count: 4 - remainder)
    }

    return Data(base64Encoded: sanitized, options: [.ignoreUnknownCharacters])
  }

  private static func isLikelyDerCertificate(_ data: Data) -> Bool {
    // X.509 DER certificate starts with ASN.1 SEQUENCE (0x30).
    guard data.count > 64 else { return false }
    let bytes = [UInt8](data)
    return bytes[0] == 0x30 && (bytes[1] == 0x81 || bytes[1] == 0x82 || bytes[1] < 0x80)
  }

  private static func bytePrefixHex(_ data: Data, maxBytes: Int = 8) -> String {
    let bytes = [UInt8](data.prefix(maxBytes))
    guard !bytes.isEmpty else { return "" }
    return bytes.map { String(format: "%02x", $0) }.joined(separator: " ")
  }

  private static func textPrefix(_ value: String, maxLen: Int = 48) -> String {
    return value
      .replacingOccurrences(of: "\n", with: "\\n")
      .replacingOccurrences(of: "\r", with: "\\r")
      .prefix(maxLen)
      .description
  }

  private static func logCertDecode(stage: String, details: String) {
    NSLog("[\(tag)][CERT_DECODE] \(stage) | \(details)")
  }

  private static func normalizeEscapedNewlines(_ value: String) -> String {
    return value
      .replacingOccurrences(of: "\\n", with: "\n")
      .replacingOccurrences(of: "\\r", with: "\r")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func extractPemBody(from value: String, begin: String, end: String) -> String? {
    guard let beginRange = value.range(of: begin) else {
      return nil
    }

    let contentStart = beginRange.upperBound
    guard let endRange = value.range(of: end, range: contentStart..<value.endIndex) else {
      return nil
    }

    let body = value
      .substring(with: contentStart..<endRange.lowerBound)
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")

    return body.isEmpty ? nil : body
  }

  // MARK: - Minimal ASN.1 DER Parser for X509

  private struct ParsedCert {
    var issuer: String
    var serialNumber: String
    var signatureBase64: String
    var signatureBytes: [Int]
  }

  private static func parseDER(_ data: Data) throws -> ParsedCert {
    // Use Security framework to get issuer string
    // For more robust parsing, we walk the DER ASN.1 structure
    let bytes = [UInt8](data)

    // X.509 Certificate structure:
    // SEQUENCE {
    //   SEQUENCE { tbsCertificate }
    //   SEQUENCE { signatureAlgorithm }
    //   BIT STRING { signatureValue }
    // }

    var offset = 0

    // Outer SEQUENCE
    guard bytes[offset] == 0x30 else {
      throw NSError(domain: "ZatcaCrypto", code: 50, userInfo: [NSLocalizedDescriptionKey: "Invalid DER: expected SEQUENCE"])
    }
    let (_, outerContentStart) = try Self.readLength(bytes, offset: offset + 1)
    offset = outerContentStart

    // TBS Certificate SEQUENCE
    guard bytes[offset] == 0x30 else {
      throw NSError(domain: "ZatcaCrypto", code: 51, userInfo: [NSLocalizedDescriptionKey: "Invalid DER: expected TBS SEQUENCE"])
    }
    let (tbsLen, tbsContentStart) = try Self.readLength(bytes, offset: offset + 1)
    let tbsEnd = tbsContentStart + tbsLen

    // Parse inside TBS Certificate
    var tbsOffset = tbsContentStart

    // Version (explicit tag [0] if present)
    var serialNumber = ""
    if bytes[tbsOffset] == 0xA0 {
      let (vLen, vContentStart) = try Self.readLength(bytes, offset: tbsOffset + 1)
      tbsOffset = vContentStart + vLen
    }

    // Serial Number (INTEGER)
    if bytes[tbsOffset] == 0x02 {
      let (snLen, snContentStart) = try Self.readLength(bytes, offset: tbsOffset + 1)
      let snBytes = Array(bytes[snContentStart..<(snContentStart + snLen)])
      // Convert to decimal string (like BigInteger)
      serialNumber = Self.bytesToDecimalString(snBytes)
      tbsOffset = snContentStart + snLen
    }

    // Signature Algorithm (SEQUENCE) - skip
    if bytes[tbsOffset] == 0x30 {
      let (saLen, saContentStart) = try Self.readLength(bytes, offset: tbsOffset + 1)
      tbsOffset = saContentStart + saLen
    }

    // Issuer (SEQUENCE)
    var issuerString = ""
    if bytes[tbsOffset] == 0x30 {
      let (issuerLen, issuerContentStart) = try Self.readLength(bytes, offset: tbsOffset + 1)
      let issuerData = Data(bytes[tbsOffset..<(issuerContentStart + issuerLen)])
      issuerString = Self.parseDistinguishedName(Array(bytes[issuerContentStart..<(issuerContentStart + issuerLen)]))
      tbsOffset = issuerContentStart + issuerLen
    }

    // Now get the signature at the end of the certificate
    offset = tbsEnd

    // Signature Algorithm SEQUENCE - skip
    if bytes[offset] == 0x30 {
      let (saLen, saContentStart) = try Self.readLength(bytes, offset: offset + 1)
      offset = saContentStart + saLen
    }

    // Signature BIT STRING
    var signatureBase64 = ""
    var signatureBytes: [Int] = []
    if bytes[offset] == 0x03 {
      let (sigLen, sigContentStart) = try Self.readLength(bytes, offset: offset + 1)
      // First byte of BIT STRING is the number of unused bits (usually 0)
      let sigData = Array(bytes[(sigContentStart + 1)..<(sigContentStart + sigLen)])
      signatureBase64 = Data(sigData).base64EncodedString()
      signatureBytes = sigData.map { Int($0) }
    }

    return ParsedCert(
      issuer: issuerString,
      serialNumber: serialNumber,
      signatureBase64: signatureBase64,
      signatureBytes: signatureBytes
    )
  }

  private static func readLength(_ bytes: [UInt8], offset: Int) throws -> (Int, Int) {
    guard offset < bytes.count else {
      throw NSError(domain: "ZatcaCrypto", code: 52, userInfo: [NSLocalizedDescriptionKey: "DER: unexpected end of data"])
    }
    let first = bytes[offset]
    if first < 0x80 {
      return (Int(first), offset + 1)
    }
    let numLenBytes = Int(first & 0x7F)
    guard offset + 1 + numLenBytes <= bytes.count else {
      throw NSError(domain: "ZatcaCrypto", code: 53, userInfo: [NSLocalizedDescriptionKey: "DER: length bytes overflow"])
    }
    var length = 0
    for i in 0..<numLenBytes {
      length = (length << 8) | Int(bytes[offset + 1 + i])
    }
    return (length, offset + 1 + numLenBytes)
  }

  private static func bytesToDecimalString(_ bytes: [UInt8]) -> String {
    // Convert big-endian bytes to decimal string
    var result: [UInt8] = [0]
    for byte in bytes {
      var carry = Int(byte)
      for i in (0..<result.count).reversed() {
        let val = Int(result[i]) * 256 + carry
        result[i] = UInt8(val % 10)
        carry = val / 10
      }
      while carry > 0 {
        result.insert(UInt8(carry % 10), at: 0)
        carry /= 10
      }
    }
    // Remove leading zeros
    while result.count > 1 && result[0] == 0 {
      result.removeFirst()
    }
    return result.map { String($0) }.joined()
  }

  private static func parseDistinguishedName(_ bytes: [UInt8]) -> String {
    // Parse X.500 Distinguished Name from DER-encoded SEQUENCE content
    // Returns RFC 2253-style string like "CN=..., O=..., C=..."
    var components: [String] = []
    var offset = 0

    while offset < bytes.count {
      // SET
      guard bytes[offset] == 0x31 else { break }
      let (setLen, setContentStart) = (try? Self.readLength(bytes, offset: offset + 1)) ?? (0, offset + 1)
      let setEnd = setContentStart + setLen

      // SEQUENCE inside SET
      var innerOffset = setContentStart
      if innerOffset < setEnd && bytes[innerOffset] == 0x30 {
        let (seqLen, seqContentStart) = (try? Self.readLength(bytes, offset: innerOffset + 1)) ?? (0, innerOffset + 1)

        // OID
        var oidString = ""
        var valueString = ""
        var seqOffset = seqContentStart

        if seqOffset < bytes.count && bytes[seqOffset] == 0x06 {
          let (oidLen, oidContentStart) = (try? Self.readLength(bytes, offset: seqOffset + 1)) ?? (0, seqOffset + 1)
          let oidBytes = Array(bytes[oidContentStart..<min(oidContentStart + oidLen, bytes.count)])
          oidString = Self.oidToName(oidBytes)
          seqOffset = oidContentStart + oidLen
        }

        // Value (UTF8String, PrintableString, etc.)
        if seqOffset < bytes.count {
          let tag = bytes[seqOffset]
          if tag == 0x0C || tag == 0x13 || tag == 0x16 || tag == 0x1E {
            let (valLen, valContentStart) = (try? Self.readLength(bytes, offset: seqOffset + 1)) ?? (0, seqOffset + 1)
            let valBytes = Array(bytes[valContentStart..<min(valContentStart + valLen, bytes.count)])
            valueString = String(bytes: valBytes, encoding: .utf8) ?? ""
          }
        }

        if !oidString.isEmpty {
          components.append("\(oidString)=\(valueString)")
        }
      }

      offset = setEnd
    }

    return components.reversed().joined(separator: ", ")
  }

  private static func oidToName(_ oidBytes: [UInt8]) -> String {
    // Common X.500 / LDAP attribute OIDs
    let oid = oidBytes.map { String($0) }.joined(separator: ".")

    // Map common OIDs to names (matching Java's X509Certificate.issuerDN.name output)
    if oidBytes == [0x55, 0x04, 0x03] { return "CN" }
    if oidBytes == [0x55, 0x04, 0x06] { return "C" }
    if oidBytes == [0x55, 0x04, 0x07] { return "L" }
    if oidBytes == [0x55, 0x04, 0x08] { return "ST" }
    if oidBytes == [0x55, 0x04, 0x0A] { return "O" }
    if oidBytes == [0x55, 0x04, 0x0B] { return "OU" }
    if oidBytes == [0x55, 0x04, 0x05] { return "SERIALNUMBER" }
    // OID 0.9.2342.19200300.100.1.25 = domainComponent (DC)
    // DER encoding: 09 92 26 89 93 F2 2C 64 01 19
    if oidBytes == [0x09, 0x92, 0x26, 0x89, 0x93, 0xF2, 0x2C, 0x64, 0x01, 0x19] { return "DC" }
    // OID 0.9.2342.19200300.100.1.1 = userId (UID)
    // DER encoding: 09 92 26 89 93 F2 2C 64 01 01
    if oidBytes == [0x09, 0x92, 0x26, 0x89, 0x93, 0xF2, 0x2C, 0x64, 0x01, 0x01] { return "UID" }
    // OID 1.2.840.113549.1.9.1 = emailAddress (E / EMAILADDRESS)
    if oidBytes == [0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x09, 0x01] { return "E" }
    return "OID.\(oid)"
  }
}

