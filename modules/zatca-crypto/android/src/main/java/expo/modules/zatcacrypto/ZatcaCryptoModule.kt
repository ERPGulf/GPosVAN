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
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
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
    val canonicalizer = Canonicalizer.getInstance(Canonicalizer.ALGO_ID_C14N11_OMIT_COMMENTS)
    val xmlBytes = xmlString.toByteArray(Charsets.UTF_8)
    val output = ByteArrayOutputStream()
    canonicalizer.canonicalize(xmlBytes, output, false)
    return output.toString(Charsets.UTF_8.name())
  }

  // --- Remove UBLExtensions, Signature, QR AdditionalDocumentReference ---

  private fun removeTags(xmlString: String): String {
    val factory = DocumentBuilderFactory.newInstance().apply {
      isNamespaceAware = true
    }
    val builder = factory.newDocumentBuilder()
    val doc = builder.parse(InputSource(StringReader(xmlString)))

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

  private fun documentToString(doc: Document): String {
    val transformer = TransformerFactory.newInstance().newTransformer()
    transformer.setOutputProperty(javax.xml.transform.OutputKeys.OMIT_XML_DECLARATION, "yes")
    val writer = java.io.StringWriter()
    transformer.transform(DOMSource(doc), StreamResult(writer))
    return writer.toString()
  }

  // --- EC Private Key Loading ---

  private fun loadECPrivateKey(pem: String): java.security.PrivateKey {
    val stripped = pem
      .replace("-----BEGIN EC PRIVATE KEY-----", "")
      .replace("-----END EC PRIVATE KEY-----", "")
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace("\n", "")
      .replace("\r", "")
      .trim()

    val keyBytes = android.util.Base64.decode(stripped, android.util.Base64.DEFAULT)
    val keySpec = PKCS8EncodedKeySpec(keyBytes)
    val keyFactory = KeyFactory.getInstance("EC")
    return keyFactory.generatePrivate(keySpec)
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
