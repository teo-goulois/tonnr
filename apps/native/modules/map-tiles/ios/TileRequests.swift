import Foundation

// The tiles asked and not answered yet. One the JavaScript does not hear yet, because nothing
// listens, waits until something does.
final class TileRequests {
  static let shared = TileRequests()

  private let lock = NSLock()
  private var next = 0
  private var open: [String: TileProtocol] = [:]
  private var unheard: [(id: String, url: String)] = []
  private var listening = false
  // Tells the JavaScript of a tile to draw, or of one MapLibre no longer wants.
  var onTile: ((String, String) -> Void)?
  var onCancel: ((String) -> Void)?

  func open(_ request: TileProtocol, url: String) -> String {
    lock.lock()
    next += 1
    let id = String(next)
    open[id] = request
    let heard = listening
    if !heard {
      unheard.append((id, url))
    }
    lock.unlock()
    if heard {
      onTile?(id, url)
    }
    return id
  }

  func close(_ id: String) {
    lock.lock()
    let wasOpen = open.removeValue(forKey: id) != nil
    unheard.removeAll { $0.id == id }
    let heard = listening
    lock.unlock()
    if wasOpen && heard {
      onCancel?(id)
    }
  }

  func answer(_ id: String, status: Int, data: Data?) {
    lock.lock()
    let request = open.removeValue(forKey: id)
    lock.unlock()
    request?.finish(status: status, data: data)
  }

  func listen() {
    lock.lock()
    listening = true
    let waiting = unheard
    unheard.removeAll()
    lock.unlock()
    for request in waiting {
      onTile?(request.id, request.url)
    }
  }

  func stopListening() {
    lock.lock()
    listening = false
    lock.unlock()
  }
}
