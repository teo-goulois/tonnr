package app.tonnr.sheetscroll

import android.app.Activity
import android.view.KeyboardShortcutGroup
import android.view.Menu
import android.view.MotionEvent
import android.view.Window
import androidx.annotation.RequiresApi
import com.google.android.material.bottomsheet.SheetScrollingChild
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Each press on the screen first has every form sheet find the scroll view it shows, so that the
// sheet lets that one scroll: `SheetScrollingChild` says why. The module has nothing to say to the
// JavaScript, which needs nothing of it.
class SheetScrollModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SheetScroll")

    OnActivityEntersForeground { appContext.currentActivity?.let(::watch) }
  }
}

private fun watch(activity: Activity) {
  val window = activity.window ?: return
  val callback = window.callback ?: return
  if (callback !is FindsScrollingChild) window.callback = FindsScrollingChild(window, callback)
}

// The window's own callback, the activity's, with a look at the sheets before each press.
private class FindsScrollingChild(
  private val window: Window,
  private val base: Window.Callback,
) : Window.Callback by base {
  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) SheetScrollingChild.refresh(window.decorView)
    return base.dispatchTouchEvent(event)
  }

  // Kotlin's delegation leaves out the interface's default methods: these two are the activity's.
  @RequiresApi(24)
  override fun onProvideKeyboardShortcuts(
    data: MutableList<KeyboardShortcutGroup>?,
    menu: Menu?,
    deviceId: Int,
  ) = base.onProvideKeyboardShortcuts(data, menu, deviceId)

  @RequiresApi(26)
  override fun onPointerCaptureChanged(hasCapture: Boolean) = base.onPointerCaptureChanged(hasCapture)
}
