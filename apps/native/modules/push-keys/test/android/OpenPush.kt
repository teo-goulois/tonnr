import app.tonnr.pushkeys.PushKeys
import app.tonnr.pushkeys.WebPush
import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPrivateKeySpec
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import kotlin.system.exitProcess

// Opens a push as the Android app's service opens it, on a computer: `OpenPush <private key>
// <public key> <secret> <body>`, each in base64url, prints what the push says. The test of
// packages/push compiles it with WebPush.kt and PushKeys.kt and gives it pushes. Decision 072.
fun main(arguments: Array<String>) {
  if (arguments.size != 4) {
    System.err.println("OpenPush <private key> <public key> <secret> <body>")
    exitProcess(2)
  }
  val (raw, point, auth, body) = arguments.map { Base64.getUrlDecoder().decode(it) }
  val curve = AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
    .getParameterSpec(ECParameterSpec::class.java)
  val factory = KeyFactory.getInstance("EC")
  val private = factory.generatePrivate(ECPrivateKeySpec(BigInteger(1, raw), curve)) as ECPrivateKey
  val at = ECPoint(BigInteger(1, point.copyOfRange(1, 33)), BigInteger(1, point.copyOfRange(33, 65)))
  val public = factory.generatePublic(ECPublicKeySpec(at, curve)) as ECPublicKey
  System.out.write(WebPush.decrypt(body, PushKeys(private, public, auth)))
  System.out.flush()
}
