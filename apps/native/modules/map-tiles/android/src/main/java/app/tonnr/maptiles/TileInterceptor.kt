package app.tonnr.maptiles

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.Call
import okhttp3.Dispatcher
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import java.util.concurrent.TimeUnit

// MapLibre fetches every tile through the OkHttp client its `HttpRequestUtil` holds. This
// interceptor takes the requests for `HOST` and hands each to the JavaScript, which draws the
// tile and answers it; every other request goes to the network as before. Decision 077.
object TileInterceptor : Interceptor {
  // A name that no DNS answers, RFC 2606: a request the interceptor missed fails at once.
  const val HOST = "map-tiles.invalid"

  // How long a tile waits for its answer before MapLibre is told to ask again.
  private const val WAIT_SECONDS = 30L
  private val PNG = "image/png".toMediaType()

  @Volatile private var installed = false

  /**
   * Gives MapLibre a client with the interceptor, on the main thread, as MapLibre React Native
   * gives its own. MapLibre React Native sets one only when the JavaScript adds a transform of the
   * requests, which the app never does. MapLibre is reached through reflection, since the module
   * does not depend on it: `MapLibre.getInstance` first, which MapLibre React Native calls too and
   * which its requests need before the client is set, then `HttpRequestUtil.setOkHttpClient`,
   * which takes an OkHttp `Call.Factory`.
   */
  fun install(context: Context) {
    Handler(Looper.getMainLooper()).post {
      if (installed) return@post
      val client =
        OkHttpClient.Builder()
          .addInterceptor(this)
          // As many requests at once to a host as MapLibre's own client allows.
          .dispatcher(Dispatcher().apply { maxRequestsPerHost = 20 })
          .build()
      try {
        Class.forName("org.maplibre.android.MapLibre")
          .getMethod("getInstance", Context::class.java)
          .invoke(null, context.applicationContext)
        Class.forName("org.maplibre.android.module.http.HttpRequestUtil")
          .getMethod("setOkHttpClient", Call.Factory::class.java)
          .invoke(null, client)
        installed = true
      } catch (error: ReflectiveOperationException) {
        Log.e("MapTiles", "MapLibre could not be given the client that draws its tiles", error)
      }
    }
  }

  override fun intercept(chain: Interceptor.Chain): Response {
    val request = chain.request()
    if (request.url.host != HOST) return chain.proceed(request)

    val pending = TileRequests.open(request.url.toString())
    var waited = 0L
    // The thread waits for the answer, and gives up when MapLibre cancels the call.
    while (!pending.latch.await(250, TimeUnit.MILLISECONDS)) {
      waited += 250
      if (chain.call().isCanceled() || waited >= WAIT_SECONDS * 1000) {
        TileRequests.close(pending.id)
        return answer(request, if (chain.call().isCanceled()) 499 else 503, null)
      }
    }
    return answer(request, pending.status, pending.data)
  }

  private fun answer(request: okhttp3.Request, status: Int, data: ByteArray?): Response {
    val builder =
      Response.Builder()
        .request(request)
        .protocol(Protocol.HTTP_1_1)
        .code(status)
        .message(if (status == 200) "OK" else "Tile")
        .body((data ?: ByteArray(0)).toResponseBody(PNG))
    // An address says all that its tile is drawn from, so MapLibre may keep the tile as long as it
    // keeps any.
    if (status == 200) builder.header("Cache-Control", "max-age=604800")
    return builder.build()
  }
}
