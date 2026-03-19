import ExpoModulesCore
import Foundation
import CryptoKit
import Security
import libxml2

public class ZatcaCryptoModule: Module {
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

    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeyClass as String: kSecAttrKeyClassPrivate,
      kSecAttrKeySizeInBits as String: 256,
    ]

    var error: Unmanaged<CFError>?
    guard let privateKey = SecKeyCreateWithData(keyData as CFData, attributes as CFDictionary, &error) else {
      let err = error?.takeRetainedValue()
      throw NSError(domain: "ZatcaCrypto", code: 31, userInfo: [NSLocalizedDescriptionKey: "Failed to create EC private key: \(err?.localizedDescription ?? "unknown")"])
    }
    return privateKey
  }

  private static func decodePrivateKeyData(_ raw: String) -> Data? {
    let normalized = normalizeEscapedNewlines(raw)

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

  // MARK: - X509 Certificate Parsing

  private static func parseCertificateInfo(pem: String) throws -> [String: Any] {
    guard let certData = decodeCertificateData(pem) else {
      throw NSError(domain: "ZatcaCrypto", code: 40, userInfo: [NSLocalizedDescriptionKey: "Invalid base64 in certificate PEM"])
    }

    guard let secCert = SecCertificateCreateWithData(nil, certData as CFData) else {
      throw NSError(domain: "ZatcaCrypto", code: 41, userInfo: [NSLocalizedDescriptionKey: "Failed to create SecCertificate"])
    }

    // Raw DER data base64
    let rawBase64 = certData.base64EncodedString()

    // Extract summary (common name)
    let summary = SecCertificateCopySubjectSummary(secCert) as String? ?? ""

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

    if let certBody = extractPemBody(
      from: normalized,
      begin: "-----BEGIN CERTIFICATE-----",
      end: "-----END CERTIFICATE-----"
    ) {
      return decodeBase64Lenient(certBody)
    }

    if let decodedText = decodeBase64Text(normalized),
       let certBody = extractPemBody(
         from: decodedText,
         begin: "-----BEGIN CERTIFICATE-----",
         end: "-----END CERTIFICATE-----"
       ) {
      return decodeBase64Lenient(certBody)
    }

    // Handle nested base64 payloads: base64(base64(DER-cert)).
    if let decodedText = decodeBase64Text(normalized),
       let nestedDer = decodeBase64Lenient(decodedText),
       isLikelyDerCertificate(nestedDer) {
      return nestedDer
    }

    let compact = normalized
      .replacingOccurrences(of: "\n", with: "")
      .replacingOccurrences(of: "\r", with: "")
      .replacingOccurrences(of: " ", with: "")

    guard let firstDecode = decodeBase64Lenient(compact) else {
      return nil
    }

    if isLikelyDerCertificate(firstDecode) {
      return firstDecode
    }

    // Final fallback for text-wrapped base64 DER.
    if let nestedText = String(data: firstDecode, encoding: .utf8),
       let secondDecode = decodeBase64Lenient(nestedText),
       isLikelyDerCertificate(secondDecode) {
      return secondDecode
    }

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

  private static func normalizeEscapedNewlines(_ value: String) -> String {
    return value
      .replacingOccurrences(of: "\\n", with: "\n")
      .replacingOccurrences(of: "\\r", with: "\r")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private static func extractPemBody(from value: String, begin: String, end: String) -> String? {
    guard value.contains(begin), value.contains(end) else {
      return nil
    }

    let body = value
      .replacingOccurrences(of: begin, with: "")
      .replacingOccurrences(of: end, with: "")
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
    // Common X.500 attribute OIDs
    let oid = oidBytes.map { String($0) }.joined(separator: ".")

    // Map common OIDs to names
    if oidBytes == [0x55, 0x04, 0x03] { return "CN" }
    if oidBytes == [0x55, 0x04, 0x06] { return "C" }
    if oidBytes == [0x55, 0x04, 0x07] { return "L" }
    if oidBytes == [0x55, 0x04, 0x08] { return "ST" }
    if oidBytes == [0x55, 0x04, 0x0A] { return "O" }
    if oidBytes == [0x55, 0x04, 0x0B] { return "OU" }
    if oidBytes == [0x55, 0x04, 0x05] { return "SERIALNUMBER" }
    if oidBytes == [0x09, 0x92, 0x26, 0x89, 0x93, 0xF2, 0x2C, 0x64, 0x01, 0x19] { return "UID" }
    return "OID.\(oid)"
  }
}

