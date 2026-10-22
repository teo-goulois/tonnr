import Foundation

// MapLibre fetches every tile through one URLSession, made from the session configuration of its
// `MLNNetworkConfiguration`. This protocol is put first in that configuration, before the first
// map is made: it takes the requests for `host` and hands each to the JavaScript, which draws the
// tile and answers it. Every other request goes to the network as before. Decision 077.
final class TileProtocol: URLProtocol {
  // A name that no DNS answers, RFC 2606: a request the protocol missed fails at once.
  static let host = "map-tiles.invalid"

  private static var installed = false

  /// Puts the protocol in MapLibre's session configuration. MapLibre is not a dependency the
  /// module can import, so it is reached through the Objective-C runtime.
  static func install() {
    guard !installed else { return }
    installed = true
    guard
      let type = NSClassFromString("MLNNetworkConfiguration") as AnyObject?,
      let manager = type.perform(NSSelectorFromString("sharedManager"))?.takeUnretainedValue()
        as? NSObject
    else {
      NSLog("[MapTiles] MapLibre's network configuration was not found")
      return
    }
    let current = manager.value(forKey: "sessionConfiguration") as? URLSessionConfiguration
    let configuration =
      (current?.copy() as? URLSessionConfiguration) ?? URLSessionConfiguration.default
    configuration.protocolClasses = [TileProtocol.self] + (configuration.protocolClasses ?? [])
    manager.setValue(configuration, forKey: "sessionConfiguration")
  }

  override class func canInit(with request: URLRequest) -> Bool {
    request.url?.host == host
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  private var id: String?
  // The client is told on the thread that started the request, as URLProtocol asks.
  private var thread: Thread?
  private var modes: [String] = [RunLoop.Mode.default.rawValue]
  // Set once the request is stopped, or answered: the client is told nothing more. Read and
  // written on `thread` alone.
  private var stopped = false

  override func startLoading() {
    thread = Thread.current
    if let mode = RunLoop.current.currentMode {
      modes = [mode.rawValue]
    }
    guard let url = request.url?.absoluteString else {
      client?.urlProtocol(self, didFailWithError: URLError(.badURL))
      return
    }
    id = TileRequests.shared.open(self, url: url)
  }

  override func stopLoading() {
    stopped = true
    if let id {
      TileRequests.shared.close(id)
    }
  }

  /// Gives MapLibre the JavaScript's answer: an image, nothing, or a failure it tries again.
  func finish(status: Int, data: Data?) {
    guard let thread else { return }
    perform(
      #selector(deliver(_:)),
      on: thread,
      with: TileAnswer(status: status, data: data),
      waitUntilDone: false,
      modes: modes
    )
  }

  @objc private func deliver(_ answer: TileAnswer) {
    // MapLibre may have stopped the request after the JavaScript answered it.
    guard !stopped, let url = request.url else { return }
    stopped = true
    var headers = ["Content-Type": "image/png"]
    // An address says all that its tile is drawn from, so MapLibre may keep the tile as long as
    // it keeps any.
    if answer.status == 200 {
      headers["Cache-Control"] = "max-age=604800"
    }
    guard
      let response = HTTPURLResponse(
        url: url, statusCode: answer.status, httpVersion: "HTTP/1.1", headerFields: headers)
    else { return }
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    if let data = answer.data {
      client?.urlProtocol(self, didLoad: data)
    }
    client?.urlProtocolDidFinishLoading(self)
  }
}

final class TileAnswer: NSObject {
  let status: Int
  let data: Data?

  init(status: Int, data: Data?) {
    self.status = status
    self.data = data
  }
}
