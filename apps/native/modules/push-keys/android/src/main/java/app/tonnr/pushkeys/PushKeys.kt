package app.tonnr.pushkeys

import java.math.BigInteger
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey

/**
 * The phone's keys for push: the P-256 pair and the secret of RFC 8291. Written without Android,
 * so that a test on a computer opens a push with what the phone opens it with. Decision 072.
 */
data class PushKeys(val private: ECPrivateKey, val public: ECPublicKey, val auth: ByteArray) {
  /** The public key as a browser writes its `p256dh`: the uncompressed point, 65 bytes. */
  fun publicPoint(): ByteArray {
    fun fixed(value: BigInteger): ByteArray {
      val bytes = value.toByteArray()
      return when {
        bytes.size == 32 -> bytes
        bytes.size > 32 -> bytes.copyOfRange(bytes.size - 32, bytes.size)
        else -> ByteArray(32 - bytes.size) + bytes
      }
    }
    return byteArrayOf(4) + fixed(public.w.affineX) + fixed(public.w.affineY)
  }
}
