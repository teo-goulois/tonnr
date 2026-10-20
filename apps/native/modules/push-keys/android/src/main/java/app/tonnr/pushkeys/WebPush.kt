package app.tonnr.pushkeys

import java.math.BigInteger
import java.nio.ByteBuffer
import java.security.KeyFactory
import java.security.interfaces.ECPublicKey
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Opens what a push says, encrypted for this phone by RFC 8291 in the content coding aes128gcm of
 * RFC 8188, as `encryptPush` in packages/push writes it for a browser. Decision 072.
 */
object WebPush {
  fun decrypt(body: ByteArray, keys: PushKeys): ByteArray {
    val header = ByteBuffer.wrap(body)
    val salt = ByteArray(16).also { header.get(it) }
    header.int // The size of a record: one record holds the whole push.
    val keyLength = header.get().toInt() and 0xff
    val senderPoint = ByteArray(keyLength).also { header.get(it) }
    val sealed = ByteArray(header.remaining()).also { header.get(it) }

    val sender = publicKeyOf(senderPoint, keys.public)
    val agreement = KeyAgreement.getInstance("ECDH")
    agreement.init(keys.private)
    agreement.doPhase(sender, true)
    val shared = agreement.generateSecret()

    val info = "WebPush: info".toByteArray() + byteArrayOf(0) + keys.publicPoint() + senderPoint
    val ikm = hkdf(salt = keys.auth, ikm = shared, info = info, length = 32)
    val cek = hkdf(salt = salt, ikm = ikm, info = "Content-Encoding: aes128gcm".toByteArray() + byteArrayOf(0), length = 16)
    val nonce = hkdf(salt = salt, ikm = ikm, info = "Content-Encoding: nonce".toByteArray() + byteArrayOf(0), length = 12)

    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(cek, "AES"), GCMParameterSpec(128, nonce))
    val padded = cipher.doFinal(sealed)
    // The last record ends with the delimiter 2, then padding of zeros.
    var end = padded.size
    while (end > 0 && padded[end - 1].toInt() == 0) end--
    require(end > 0 && padded[end - 1].toInt() == 2) { "not the last record of a push" }
    return padded.copyOfRange(0, end - 1)
  }

  private fun publicKeyOf(point: ByteArray, like: ECPublicKey): ECPublicKey {
    require(point.size == 65 && point[0].toInt() == 4) { "not an uncompressed point" }
    val x = BigInteger(1, point.copyOfRange(1, 33))
    val y = BigInteger(1, point.copyOfRange(33, 65))
    val spec = ECPublicKeySpec(ECPoint(x, y), like.params)
    return KeyFactory.getInstance("EC").generatePublic(spec) as ECPublicKey
  }

  private fun hkdf(salt: ByteArray, ikm: ByteArray, info: ByteArray, length: Int): ByteArray {
    val extract = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(salt, "HmacSHA256")) }
    val prk = extract.doFinal(ikm)
    val expand = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(prk, "HmacSHA256")) }
    // One block is enough for 32 bytes or fewer.
    val block = expand.doFinal(info + byteArrayOf(1))
    return block.copyOfRange(0, length)
  }
}
