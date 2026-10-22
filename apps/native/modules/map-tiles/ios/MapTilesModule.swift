import ExpoModulesCore

// The JavaScript's side of `TileProtocol`: it hears each tile MapLibre asks of the reserved host,
// and answers it with the PNG it drew. Decision 077.
public class MapTilesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MapTiles")

    Events("onTile", "onCancel")

    OnCreate {
      TileProtocol.install()
      TileRequests.shared.onTile = { [weak self] id, url in
        self?.sendEvent("onTile", ["id": id, "url": url])
      }
      TileRequests.shared.onCancel = { [weak self] id in
        self?.sendEvent("onCancel", ["id": id])
      }
    }

    OnStartObserving("onTile") {
      TileRequests.shared.listen()
    }

    OnStopObserving("onTile") {
      TileRequests.shared.stopListening()
    }

    // `status` is an HTTP status, as MapLibre reads one: 200 with the image, 204 for a tile with
    // nothing to draw, 404 for one that never will, and another for one it asks again later.
    AsyncFunction("answer") { (id: String, status: Int, data: Data?) in
      TileRequests.shared.answer(id, status: status, data: data)
    }
  }
}
