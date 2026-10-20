package app.tonnr.liveactivities

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The phone's side of decision 074 that no library gives: on Android, the notification of a
 * session in progress, which asks to be promoted as a Live Update. What reads ActivityKit is
 * iOS's, and answers here as a phone without Live Activities would.
 */
class LiveActivitiesModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("LiveActivities")

    Events("onActivity")

    Function("areEnabled") { false }

    Function("startByPush") { false }

    Function("running") { _: String -> emptyList<Map<String, String>>() }

    AsyncFunction("showSession") { notice: SessionNotice -> SessionNotification.post(context, notice) }

    AsyncFunction("hideSession") { SessionNotification.cancel(context) }

    AsyncFunction("isSessionShown") { SessionNotification.isShown(context) }
  }
}
