package app.tonnr.liveactivities

import android.annotation.SuppressLint
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** What the app writes of a session in progress, every word in its language already. */
class SessionNotice : Record {
  @Field val title: String = ""
  @Field val text: String = ""
  // When the session began, and when its timer stops, in milliseconds since 1970.
  @Field val startedAt: Double = 0.0
  @Field val endsBy: Double = 0.0
  @Field val endLabel: String = ""
  // The routes a press opens, read as links of the app's scheme.
  @Field val openPath: String = ""
  @Field val endPath: String = ""
}

/**
 * The session in progress on Android, decision 074: an ongoing notification on the channel
 * `sessions` of decision 072, with a chronometer from the start and an action that ends it, which
 * asks to be promoted as a Live Update. Google allows it because the person started it and follows
 * it, as a workout. Android 16 promotes it when it judges fit; below Android 16, or when it does
 * not, it is an ordinary ongoing notification. It goes by itself when the timer stops, eight hours
 * after the start, as iOS ends a Live Activity.
 */
object SessionNotification {
  private const val CHANNEL = "sessions"
  private const val TAG = "session-in-progress"
  private const val ID = 74

  /** Posts the notification, or posts it again in its place. False where it cannot be posted. */
  @SuppressLint("MissingPermission")
  fun post(context: Context, notice: SessionNotice): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    // The channel is the app's, made as it starts: a notification of an unknown one is dropped.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
      return false
    }
    val startedAt = notice.startedAt.toLong()
    val left = notice.endsBy.toLong() - System.currentTimeMillis()
    if (left <= 0) return false
    val builder = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(notice.title)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_WORKOUT)
      .setWhen(startedAt)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .setTimeoutAfter(left)
      .setRequestPromotedOngoing(true)
      .setContentIntent(open(context, notice.openPath, 0))
      .addAction(0, notice.endLabel, open(context, notice.endPath, 1))
    if (notice.text.isNotEmpty()) {
      builder.setContentText(notice.text).setStyle(NotificationCompat.BigTextStyle().bigText(notice.text))
    }
    return runCatching { manager.notify(TAG, ID, builder.build()) }.isSuccess
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(TAG, ID)
  }

  /** Whether the notification is still shown: its person may have swiped it away. */
  fun isShown(context: Context): Boolean {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return manager.activeNotifications.any { it.tag == TAG && it.id == ID }
  }

  /**
   * The app's mark in white on nothing, which the expo-notifications plugin writes as the drawable
   * `notification_icon`: Android draws a small icon by its alpha alone, and the app's icon, which
   * has none, would be a white square. The app's icon in a build made before it.
   */
  @SuppressLint("DiscouragedApi")
  private fun smallIcon(context: Context): Int {
    val mark = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (mark != 0) mark else context.applicationInfo.icon
  }

  /** What a press opens: the app, at a route of its own, read as a link of its scheme. */
  private fun open(context: Context, path: String, request: Int): PendingIntent {
    // The app's scheme is its package (decision 069).
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${context.packageName}://${path.trimStart('/')}"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
      context,
      ID * 4 + request,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }
}
