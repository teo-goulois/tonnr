package com.google.android.material.bottomsheet

import android.view.View
import android.view.ViewGroup
import androidx.coordinatorlayout.widget.CoordinatorLayout
import java.lang.ref.WeakReference

// Material's bottom sheet, which react-native-screens shows a form sheet in, lets one scroll view
// in it scroll, the first it finds as it lays itself out, and takes for itself every drag that
// begins outside that view. It looks again only when it is laid out again, which React Native
// never asks of it: a sheet whose scroll view came after its first layout, or a place's sheet
// that shows another tab, keeps the view it found first, and then scrolls nothing else. This
// finds it again as the sheet would, from the package whose members it reads.
internal object SheetScrollingChild {
  /** Points each bottom sheet under `view` at the scroll view it now holds. */
  fun refresh(view: View) {
    if (view !is ViewGroup) return
    if (view is CoordinatorLayout) {
      for (index in 0 until view.childCount) {
        val sheet = view.getChildAt(index)
        val behavior = (sheet.layoutParams as? CoordinatorLayout.LayoutParams)?.behavior
        if (behavior is BottomSheetBehavior<*>) {
          behavior.nestedScrollingChildRef = WeakReference<View>(behavior.findScrollingChild(sheet))
        }
      }
    }
    for (index in 0 until view.childCount) refresh(view.getChildAt(index))
  }
}
