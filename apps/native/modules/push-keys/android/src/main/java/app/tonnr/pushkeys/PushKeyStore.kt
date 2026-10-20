package app.tonnr.pushkeys

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.SecureRandom
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Where the phone's keys for push are kept: the P-256 pair and the secret of RFC 8291, encrypted
 * under an AES key of the Android Keystore, in the app's own preferences, where the service that
 * opens a push reads them. Decision 072.
 */
object PushKeyStore {
  private const val PREFS = "app.tonnr.push"
  private const val ALIAS = "app.tonnr.push"
  private const val KEYS = "keys"

  fun read(context: Context): PushKeys? {
    val sealed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEYS, null)
      ?: return null
    return runCatching {
      val plain = java.nio.ByteBuffer.wrap(open(Base64.decode(sealed, Base64.NO_WRAP)))
      fun next(): ByteArray = ByteArray(plain.short.toInt()).also { plain.get(it) }
      val pkcs8 = next()
      val x509 = next()
      val auth = ByteArray(16).also { plain.get(it) }
      val factory = KeyFactory.getInstance("EC")
      val private = factory.generatePrivate(PKCS8EncodedKeySpec(pkcs8)) as ECPrivateKey
      val public = factory.generatePublic(X509EncodedKeySpec(x509)) as ECPublicKey
      PushKeys(private, public, auth)
    }.getOrNull()
  }

  fun make(context: Context): PushKeys {
    val generator = KeyPairGenerator.getInstance("EC")
    generator.initialize(ECGenParameterSpec("secp256r1"))
    val pair = generator.generateKeyPair()
    val auth = ByteArray(16).also { SecureRandom().nextBytes(it) }
    // Each key with its length before it, then the secret.
    val private = pair.private.encoded
    val public = pair.public.encoded
    val plain = java.nio.ByteBuffer.allocate(4 + private.size + public.size + auth.size)
      .putShort(private.size.toShort()).put(private)
      .putShort(public.size.toShort()).put(public)
      .put(auth)
      .array()
    val sealed = seal(plain)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEYS, Base64.encodeToString(sealed, Base64.NO_WRAP))
      .apply()
    return PushKeys(pair.private as ECPrivateKey, pair.public as ECPublicKey, auth)
  }

  fun forget(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEYS).apply()
  }

  /** What the service writes with, which the app gives it in its language. */
  fun labels(context: Context): Map<String, String> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return listOf("standIn", "notToday", "logSession").associateWith { prefs.getString(it, "") ?: "" }
  }

  fun setLabels(context: Context, labels: Map<String, String>) {
    val edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
    labels.forEach { (name, value) -> edit.putString(name, value) }
    edit.apply()
  }

  private fun secretKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build(),
    )
    return generator.generateKey()
  }

  private fun seal(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, secretKey())
    return cipher.iv + cipher.doFinal(plain)
  }

  private fun open(sealed: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, sealed.copyOfRange(0, 12)))
    return cipher.doFinal(sealed.copyOfRange(12, sealed.size))
  }
}
