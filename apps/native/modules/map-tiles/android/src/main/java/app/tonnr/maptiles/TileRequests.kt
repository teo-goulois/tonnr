package app.tonnr.maptiles

import java.util.concurrent.CountDownLatch

// The tiles asked and not answered yet. One the JavaScript does not hear yet, because nothing
// listens, waits until something does.
object TileRequests {
  class Pending(val id: String, val url: String) {
    val latch = CountDownLatch(1)
    @Volatile var status = 503
    @Volatile var data: ByteArray? = null
  }

  private var next = 0
  private val open = HashMap<String, Pending>()
  private val unheard = ArrayList<Pending>()
  private var listening = false
  // Tells the JavaScript of a tile to draw, or of one MapLibre no longer wants.
  @Volatile var onTile: ((String, String) -> Unit)? = null
  @Volatile var onCancel: ((String) -> Unit)? = null

  fun open(url: String): Pending {
    val pending: Pending
    val heard: Boolean
    synchronized(this) {
      next += 1
      pending = Pending(next.toString(), url)
      open[pending.id] = pending
      heard = listening
      if (!heard) unheard.add(pending)
    }
    if (heard) onTile?.invoke(pending.id, url)
    return pending
  }

  fun close(id: String) {
    val wasOpen: Boolean
    val heard: Boolean
    synchronized(this) {
      wasOpen = open.remove(id) != null
      unheard.removeAll { it.id == id }
      heard = listening
    }
    if (wasOpen && heard) onCancel?.invoke(id)
  }

  fun answer(id: String, status: Int, data: ByteArray?) {
    val pending = synchronized(this) { open.remove(id) } ?: return
    pending.status = status
    pending.data = data
    pending.latch.countDown()
  }

  fun listen() {
    val waiting: List<Pending>
    synchronized(this) {
      listening = true
      waiting = unheard.toList()
      unheard.clear()
    }
    for (pending in waiting) onTile?.invoke(pending.id, pending.url)
  }

  fun stopListening() {
    synchronized(this) { listening = false }
  }
}
