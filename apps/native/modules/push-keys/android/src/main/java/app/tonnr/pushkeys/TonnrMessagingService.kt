package app.tonnr.pushkeys

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

/**
 * Receives every message of Firebase, whether the app is open or not. A push of the instance
 * carries what it says encrypted in `encrypted`: this opens it with the phone's keys and posts
 * its notification on the channel of its moment, under its tag so that a newer word takes the
 * older one's place. What it cannot open is posted as the line that stands in for it, never
 * dropped. Any other message goes on to expo-notifications. Decision 072.
 */
class TonnrMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val sealed = remoteMessage.data["encrypted"] ?: return super.onMessageReceived(remoteMessage)
    val labels = PushKeyStore.labels(this)
    val push = runCatching {
      val keys = requireNotNull(PushKeyStore.read(this))
      val body = Base64.decode(sealed, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      JSONObject(String(WebPush.decrypt(body, keys)))
    }.getOrNull()
    post(push, labels)
  }

  private fun post(push: JSONObject?, labels: Map<String, String>) {
    val manager = NotificationManagerCompat.from(this)
    if (!manager.areNotificationsEnabled()) return
    val tag = push?.optString("tag")?.takeIf { it.isNotEmpty() }
    val category = push?.optString("category")
    val channel = when {
      category == "begins" -> "begins"
      push?.optString("level") == "passive" -> "evening"
      tag?.startsWith("report-") == true -> "reports"
      else -> "alerts"
    }
    val builder = NotificationCompat.Builder(this, channel)
      .setSmallIcon(smallIcon())
      .setAutoCancel(true)
      .setContentTitle(push?.optString("title") ?: labels["standIn"])
      .setContentIntent(open(push?.optString("url"), 0))
    push?.optString("body")?.takeIf { it.isNotEmpty() }?.let {
      builder.setContentText(it).setStyle(NotificationCompat.BigTextStyle().bigText(it))
    }
    push?.optString("thread")?.takeIf { it.isNotEmpty() }?.let { builder.setGroup(it) }
    // "It is on" goes by itself when the last window it tells ends, which the push says: Google
    // allows no alert as a Live Update (decision 074). One that comes late still shows a minute.
    if (channel == "begins") endsIn(push?.optString("endsAt"))?.let { builder.setTimeoutAfter(it) }
    push?.optString("image")?.takeIf { it.isNotEmpty() }?.let { address ->
      picture(address)?.let {
        builder.setStyle(NotificationCompat.BigPictureStyle().bigPicture(it)).setLargeIcon(it)
      }
    }
    if (push != null) actions(push, labels).forEach { (label, address, request) ->
      builder.addAction(0, label, open(address, request))
    }
    runCatching { manager.notify(tag, 0, builder.build()) }
  }

  /**
   * The app's mark in white on nothing, which the expo-notifications plugin writes as the drawable
   * `notification_icon`: Android draws a small icon by its alpha alone, and the app's icon, which
   * has none, would be a white square. The app's icon in a build made before it.
   */
  @SuppressLint("DiscouragedApi")
  private fun smallIcon(): Int {
    val mark = resources.getIdentifier("notification_icon", "drawable", packageName)
    return if (mark != 0) mark else applicationInfo.icon
  }

  /** What a long press offers: "Not today" on an alert's push of today, "Log a session" on "it is on". */
  private fun actions(push: JSONObject, labels: Map<String, String>): List<Triple<String?, String, Int>> {
    val alert = push.optJSONObject("ids")?.optString("alert")?.takeIf { it.isNotEmpty() }
    return when (push.optString("category")) {
      "today" -> if (alert == null) emptyList() else {
        val until = push.optString("pauseUntil")
        listOf(Triple(labels["notToday"], "pause-alert?alert=${Uri.encode(alert)}&until=${Uri.encode(until)}", 1))
      }
      "begins" -> placeOf(push.optString("url"))?.let {
        listOf(Triple(labels["logSession"], "session/new?place=$it", 2))
      } ?: emptyList()
      else -> emptyList()
    }
  }

  /** A report's photo, which a push names by its address: left out when it does not come in time. */
  private fun picture(address: String) = runCatching {
    val connection = URL(address).openConnection().apply {
      connectTimeout = 5_000
      readTimeout = 5_000
    }
    connection.getInputStream().use { BitmapFactory.decodeStream(it) }
  }.getOrNull()

  /** What a press opens: the app, at the address the push names, read as a link of its scheme. */
  private fun open(address: String?, request: Int): PendingIntent {
    val path = address?.let { Uri.parse(it) }?.let { uri ->
      if (uri.scheme == "http" || uri.scheme == "https") {
        (uri.encodedPath ?: "") + (uri.encodedQuery?.let { "?$it" } ?: "")
      } else address
    } ?: ""
    // The app's scheme is its package (decision 069).
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("$packageName://${path.trimStart('/')}"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
      this,
      (address ?: "").hashCode() * 4 + request,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  /**
   * How long until a moment as the worker writes one, `Date.toISOString()` in UTC, a minute at
   * least, or null for no moment. `java.time` waits for Android 8, which the app does not ask.
   */
  private fun endsIn(moment: String?): Long? {
    if (moment.isNullOrEmpty()) return null
    val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    val at = runCatching { format.parse(moment)?.time }.getOrNull() ?: return null
    return maxOf(at - System.currentTimeMillis(), 60_000L)
  }

  /** The place a push's address names: `break:<id>` or `spot:<id>`. */
  private fun placeOf(address: String): String? {
    val uri = runCatching { Uri.parse(address) }.getOrNull() ?: return null
    uri.getQueryParameter("break")?.let { return "break:$it" }
    uri.getQueryParameter("spot")?.let { return "spot:$it" }
    return null
  }
}
