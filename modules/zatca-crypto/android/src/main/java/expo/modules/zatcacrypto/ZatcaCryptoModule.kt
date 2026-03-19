package expo.modules.zatcacrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.StringReader
import java.math.BigInteger
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPrivateKeySpec
import java.security.spec.InvalidKeySpecException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.AlgorithmParameters
import java.security.spec.PKCS8EncodedKeySpec
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import javax.xml.transform.TransformerFactory
import javax.xml.transform.dom.DOMSource
import javax.xml.transform.stream.StreamResult
import javax.xml.xpath.XPathConstants
import javax.xml.xpath.XPathFactory
import org.apache.xml.security.Init as XmlSecInit
import org.apache.xml.security.c14n.Canonicalizer
import org.w3c.dom.Document
import org.w3c.dom.Node
import org.w3c.dom.NodeList
import org.xml.sax.InputSource

class ZatcaCryptoModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("ZatcaCryptoModule")

    // Ensure Apache Santuario is initialized
    OnCreate {
      if (!XmlSecInit.isInitialized()) {
        XmlSecInit.init()
      }
    }

    // MARK: canonicalizeXml
    Function("canonicalizeXml") { xmlString: String ->
      canonicalize(xmlString)
    }

    // MARK: removeTagsAndCanonicalize
    Function("removeTagsAndCanonicalize") { xmlString: String ->
      val cleaned = removeTags(xmlString)
      canonicalize(cleaned)
    }

    // MARK: sha256Hash
    Function("sha256Hash") { data: String ->
      val bytes = data.toByteArray(Charsets.UTF_8)
      val md = MessageDigest.getInstance("SHA-256")
      val hashBytes = md.digest(bytes)
      val hexString = hashBytes.joinToString("") { "%02x".format(it) }
      val base64String = android.util.Base64.encodeToString(hashBytes, android.util.Base64.NO_WRAP)
      mapOf("hex" to hexString, "base64" to base64String)
    }

    // MARK: signECDSA
    Function("signECDSA") { data: String, privateKeyPem: String ->
      val dataBytes = data.toByteArray(Charsets.UTF_8)
      val privateKey = loadECPrivateKey(privateKeyPem)

      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(privateKey)
      signer.update(dataBytes)
      val signatureBytes = signer.sign()

      val base64 = android.util.Base64.encodeToString(signatureBytes, android.util.Base64.NO_WRAP)
      val byteList = signatureBytes.map { it.toInt() and 0xFF }
      mapOf("signatureBase64" to base64, "signatureBytes" to byteList)
    }

    // MARK: parseCertificate
    Function("parseCertificate") { certPem: String ->
      parseCertificateInfo(certPem)
    }

    // MARK: computeCertificateDigest
    Function("computeCertificateDigest") { certContent: String ->
      val bytes = certContent.toByteArray(Charsets.UTF_8)
      val md = MessageDigest.getInstance("SHA-256")
      val hashBytes = md.digest(bytes)
      val hexString = hashBytes.joinToString("") { "%02x".format(it) }
      val hexBytes = hexString.toByteArray(Charsets.UTF_8)
      android.util.Base64.encodeToString(hexBytes, android.util.Base64.NO_WRAP)
    }
  }

  // --- XML Canonicalization ---

  private fun canonicalize(xmlString: String): String {
    val doc = parseXmlDocument(xmlString)
    val canonicalizer = Canonicalizer.getInstance(Canonicalizer.ALGO_ID_C14N11_OMIT_COMMENTS)
    val output = ByteArrayOutputStream()
    canonicalizer.canonicalizeSubtree(doc, output)
    return output.toString(Charsets.UTF_8.name())
  }

  // --- Remove UBLExtensions, Signature, QR AdditionalDocumentReference ---

  private fun removeTags(xmlString: String): String {
    val doc = parseXmlDocument(xmlString)

    val xpath = XPathFactory.newInstance().newXPath()
    xpath.namespaceContext = object : javax.xml.namespace.NamespaceContext {
      override fun getNamespaceURI(prefix: String): String = when (prefix) {
        "cac" -> "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
        "cbc" -> "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
        "ext" -> "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
        else -> javax.xml.XMLConstants.NULL_NS_URI
      }
      override fun getPrefix(uri: String): String? = null
      override fun getPrefixes(uri: String): Iterator<String> = emptyList<String>().iterator()
    }

    // Remove UBLExtensions
    val ublExtNodes = xpath.evaluate("//*[local-name()='UBLExtensions']", doc, XPathConstants.NODESET) as NodeList
    for (i in 0 until ublExtNodes.length) {
      val node = ublExtNodes.item(i)
      node.parentNode?.removeChild(node)
    }

    // Remove Signature (direct child of Invoice)
    val sigNodes = xpath.evaluate("//*[local-name()='Invoice']/*[local-name()='Signature']", doc, XPathConstants.NODESET) as NodeList
    for (i in 0 until sigNodes.length) {
      val node = sigNodes.item(i)
      node.parentNode?.removeChild(node)
    }

    // Remove AdditionalDocumentReference where ID = 'QR'
    val qrNodes = xpath.evaluate(
      "//*[local-name()='AdditionalDocumentReference'][*[local-name()='ID' and text()='QR']]",
      doc, XPathConstants.NODESET
    ) as NodeList
    for (i in 0 until qrNodes.length) {
      val node = qrNodes.item(i)
      node.parentNode?.removeChild(node)
    }

    return documentToString(doc)
  }

  private fun parseXmlDocument(xmlString: String): Document {
    val factory = DocumentBuilderFactory.newInstance().apply {
      isNamespaceAware = true
      isExpandEntityReferences = false
      trySetFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
      trySetFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
      trySetFeature("http://xml.org/sax/features/external-general-entities", false)
      trySetFeature("http://xml.org/sax/features/external-parameter-entities", false)
    }

    val builder = factory.newDocumentBuilder()
    return builder.parse(InputSource(StringReader(xmlString)))
  }

  private fun DocumentBuilderFactory.trySetFeature(feature: String, enabled: Boolean) {
    try {
      setFeature(feature, enabled)
    } catch (_: Exception) {
      // Some Android parser implementations do not support all features.
      // Ignore unsupported flags and continue with available protections.
    }
  }

  private fun documentToString(doc: Document): String {
    val transformer = TransformerFactory.newInstance().newTransformer()
    transformer.setOutputProperty(javax.xml.transform.OutputKeys.OMIT_XML_DECLARATION, "yes")
    val writer = java.io.StringWriter()
    transformer.transform(DOMSource(doc), StreamResult(writer))
    return writer.toString()
  }

  // --- EC Private Key Loading ---

  private fun loadECPrivateKey(pem: String): java.security.PrivateKey {
    val keyFactory = KeyFactory.getInstance("EC")

    val normalizedPem = pem.trim()
    val isSec1Pem = normalizedPem.contains("-----BEGIN EC PRIVATE KEY-----")
    val isPkcs8Pem = normalizedPem.contains("-----BEGIN PRIVATE KEY-----")

    if (isSec1Pem) {
      val sec1Bytes = decodePemBody(
        normalizedPem,
        "-----BEGIN EC PRIVATE KEY-----",
        "-----END EC PRIVATE KEY-----",
      )
      try {
        return loadSec1ECPrivateKey(sec1Bytes, keyFactory)
      } catch (e: Exception) {
        throw IllegalArgumentException("Failed to parse SEC1 EC private key: ${e.message}", e)
      }
    }

    if (isPkcs8Pem) {
      val pkcs8Bytes = decodePemBody(
        normalizedPem,
        "-----BEGIN PRIVATE KEY-----",
        "-----END PRIVATE KEY-----",
      )
      try {
        return loadPkcs8ECPrivateKey(pkcs8Bytes, keyFactory)
      } catch (e: Exception) {
        throw IllegalArgumentException("Failed to parse PKCS#8 EC private key: ${e.message}", e)
      }
    }

    // Unknown/no header: try PKCS#8 first, then SEC1 as fallback.
    val stripped = normalizedPem
      .replace("-----BEGIN EC PRIVATE KEY-----", "")
      .replace("-----END EC PRIVATE KEY-----", "")
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace("\n", "")
      .replace("\r", "")
      .trim()

    val keyBytes = android.util.Base64.decode(stripped, android.util.Base64.DEFAULT)
    try {
      return loadPkcs8ECPrivateKey(keyBytes, keyFactory)
    } catch (pkcs8Error: Exception) {
      try {
        return loadSec1ECPrivateKey(keyBytes, keyFactory)
      } catch (sec1Error: Exception) {
        throw IllegalArgumentException(
          "Failed to parse EC private key (tried PKCS#8 then SEC1). PKCS#8 error: ${pkcs8Error.message}; SEC1 error: ${sec1Error.message}",
          sec1Error,
        )
      }
    }
  }

  private fun decodePemBody(pem: String, begin: String, end: String): ByteArray {
    val stripped = pem
      .replace(begin, "")
      .replace(end, "")
      .replace("\n", "")
      .replace("\r", "")
      .trim()
    return android.util.Base64.decode(stripped, android.util.Base64.DEFAULT)
  }

  private fun loadPkcs8ECPrivateKey(pkcs8Bytes: ByteArray, keyFactory: KeyFactory): java.security.PrivateKey {
    val keySpec = PKCS8EncodedKeySpec(pkcs8Bytes)
    return keyFactory.generatePrivate(keySpec)
  }

  private fun loadSec1ECPrivateKey(sec1Bytes: ByteArray, keyFactory: KeyFactory): java.security.PrivateKey {
    val privateScalar = extractSec1PrivateScalar(sec1Bytes)
    val curveName = extractSec1CurveName(sec1Bytes)

    // Try curve from SEC1 params first; fallback to common curves used in practice.
    val curveCandidates = buildList {
      if (curveName != null) add(curveName)
      add("secp256k1")
      add("secp256r1")
    }.distinct()

    var lastError: Exception? = null
    for (candidate in curveCandidates) {
      try {
        val parameters = AlgorithmParameters.getInstance("EC")
        parameters.init(ECGenParameterSpec(candidate))
        val ecSpec = parameters.getParameterSpec(ECParameterSpec::class.java)

        val keySpec = ECPrivateKeySpec(BigInteger(1, privateScalar), ecSpec)
        return keyFactory.generatePrivate(keySpec)
      } catch (e: Exception) {
        lastError = e
      }
    }

    throw IllegalArgumentException(
      "Failed to build SEC1 EC private key for curves: ${curveCandidates.joinToString(",")}. Last error: ${lastError?.message}",
      lastError,
    )
  }

  private fun extractSec1PrivateScalar(sec1Bytes: ByteArray): ByteArray {
    var offset = 0

    // ECPrivateKey ::= SEQUENCE { version INTEGER, privateKey OCTET STRING, ... }
    require(offset < sec1Bytes.size && sec1Bytes[offset].toInt() == 0x30) {
      "Invalid EC private key (SEC1): expected SEQUENCE"
    }
    offset += 1
    val (seqLen, seqStart) = readDerLength(sec1Bytes, offset)
    val seqEnd = seqStart + seqLen
    offset = seqStart

    require(offset < sec1Bytes.size && sec1Bytes[offset].toInt() == 0x02) {
      "Invalid EC private key (SEC1): expected version INTEGER"
    }
    offset += 1
    val (verLen, verStart) = readDerLength(sec1Bytes, offset)
    offset = verStart + verLen

    require(offset < seqEnd && sec1Bytes[offset].toInt() == 0x04) {
      "Invalid EC private key (SEC1): expected privateKey OCTET STRING"
    }
    offset += 1
    val (pkLen, pkStart) = readDerLength(sec1Bytes, offset)
    val pkEnd = pkStart + pkLen

    require(pkEnd <= sec1Bytes.size) {
      "Invalid EC private key (SEC1): truncated private key bytes"
    }

    return sec1Bytes.copyOfRange(pkStart, pkEnd)
  }

  private fun extractSec1CurveName(sec1Bytes: ByteArray): String? {
    var offset = 0

    if (offset >= sec1Bytes.size || sec1Bytes[offset].toInt() != 0x30) return null
    offset += 1
    val (seqLen, seqStart) = readDerLength(sec1Bytes, offset)
    val seqEnd = seqStart + seqLen
    offset = seqStart

    // Skip version INTEGER
    if (offset >= seqEnd || sec1Bytes[offset].toInt() != 0x02) return null
    offset += 1
    val (verLen, verStart) = readDerLength(sec1Bytes, offset)
    offset = verStart + verLen

    // Skip privateKey OCTET STRING
    if (offset >= seqEnd || sec1Bytes[offset].toInt() != 0x04) return null
    offset += 1
    val (pkLen, pkStart) = readDerLength(sec1Bytes, offset)
    offset = pkStart + pkLen

    // Parse optional fields and find [0] parameters containing namedCurve OID.
    while (offset < seqEnd) {
      val tag = sec1Bytes[offset].toInt() and 0xFF
      offset += 1
      val (len, contentStart) = readDerLength(sec1Bytes, offset)
      val contentEnd = contentStart + len
      if (contentEnd > seqEnd) return null

      if (tag == 0xA0 && contentStart < contentEnd) {
        val innerTag = sec1Bytes[contentStart].toInt() and 0xFF
        if (innerTag == 0x06) {
          val (oidLen, oidStart) = readDerLength(sec1Bytes, contentStart + 1)
          val oidEnd = oidStart + oidLen
          if (oidEnd <= contentEnd) {
            val oidBytes = sec1Bytes.copyOfRange(oidStart, oidEnd)
            val oid = decodeOid(oidBytes)
            return when (oid) {
              "1.3.132.0.10" -> "secp256k1"
              "1.2.840.10045.3.1.7" -> "secp256r1"
              else -> null
            }
          }
        }
      }

      offset = contentEnd
    }

    return null
  }

  private fun decodeOid(oidBytes: ByteArray): String {
    if (oidBytes.isEmpty()) return ""

    val first = oidBytes[0].toInt() and 0xFF
    val firstArc = first / 40
    val secondArc = first % 40
    val arcs = mutableListOf(firstArc.toString(), secondArc.toString())

    var value = 0L
    for (i in 1 until oidBytes.size) {
      val b = oidBytes[i].toInt() and 0xFF
      value = (value shl 7) or (b and 0x7F).toLong()
      if ((b and 0x80) == 0) {
        arcs.add(value.toString())
        value = 0
      }
    }

    return arcs.joinToString(".")
  }

  private fun readDerLength(bytes: ByteArray, offset: Int): Pair<Int, Int> {
    require(offset < bytes.size) { "Invalid DER: missing length" }

    val first = bytes[offset].toInt() and 0xFF
    if (first and 0x80 == 0) {
      return Pair(first, offset + 1)
    }

    val lengthByteCount = first and 0x7F
    require(lengthByteCount in 1..4) { "Invalid DER: unsupported length byte count" }
    require(offset + 1 + lengthByteCount <= bytes.size) { "Invalid DER: truncated length" }

    var length = 0
    for (i in 0 until lengthByteCount) {
      length = (length shl 8) or (bytes[offset + 1 + i].toInt() and 0xFF)
    }

    return Pair(length, offset + 1 + lengthByteCount)
  }

  // --- X509 Certificate Parsing ---

  private fun parseCertificateInfo(certPem: String): Map<String, Any> {
    val stripped = certPem
      .replace("-----BEGIN CERTIFICATE-----", "")
      .replace("-----END CERTIFICATE-----", "")
      .replace("\n", "")
      .replace("\r", "")
      .trim()

    val certBytes = android.util.Base64.decode(stripped, android.util.Base64.DEFAULT)
    val certFactory = CertificateFactory.getInstance("X.509")
    val cert = certFactory.generateCertificate(ByteArrayInputStream(certBytes)) as X509Certificate

    val issuer = cert.issuerDN.name
    val serialNumber = cert.serialNumber.toString()
    val signatureBytes = cert.signature
    val signatureBase64 = android.util.Base64.encodeToString(signatureBytes, android.util.Base64.NO_WRAP)

    val publicKeyEncoded = cert.publicKey.encoded
    val publicKeyBase64 = android.util.Base64.encodeToString(publicKeyEncoded, android.util.Base64.NO_WRAP)
    val publicKeyByteList = publicKeyEncoded.map { it.toInt() and 0xFF }
    val signatureByteList = signatureBytes.map { it.toInt() and 0xFF }
    val rawBase64 = android.util.Base64.encodeToString(certBytes, android.util.Base64.NO_WRAP)

    return mapOf(
      "issuer" to issuer,
      "serialNumber" to serialNumber,
      "signatureBase64" to signatureBase64,
      "signatureBytes" to signatureByteList,
      "publicKeyBase64" to publicKeyBase64,
      "publicKeyBytes" to publicKeyByteList,
      "rawBase64" to rawBase64,
    )
  }
}
