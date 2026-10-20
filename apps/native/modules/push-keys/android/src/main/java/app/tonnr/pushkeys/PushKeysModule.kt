package app.tonnr.pushkeys

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PushKeysModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  private fun base64url(bytes: ByteArray) =
    Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  override fun definition() = ModuleDefinition {
    Name("PushKeys")

    // The public key, uncompressed, and the secret, as a browser gives its `p256dh` and `auth`.
    AsyncFunction("keys") {
      val keys = PushKeyStore.read(context) ?: PushKeyStore.make(context)
      mapOf("p256dh" to base64url(keys.publicPoint()), "auth" to base64url(keys.auth))
    }

    AsyncFunction("forget") { PushKeyStore.forget(context) }

    AsyncFunction("setLabels") { labels: Map<String, String> -> PushKeyStore.setLabels(context, labels) }
  }
}
