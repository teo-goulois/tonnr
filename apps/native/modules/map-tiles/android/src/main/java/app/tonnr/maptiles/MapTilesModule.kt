package app.tonnr.maptiles

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The JavaScript's side of `TileInterceptor`: it hears each tile MapLibre asks of the reserved
// host, and answers it with the PNG it drew. Decision 077.
class MapTilesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MapTiles")

    Events("onTile", "onCancel")

    OnCreate {
      appContext.reactContext?.let { TileInterceptor.install(it) }
      TileRequests.onTile = { id, url -> sendEvent("onTile", mapOf("id" to id, "url" to url)) }
      TileRequests.onCancel = { id -> sendEvent("onCancel", mapOf("id" to id)) }
    }

    OnStartObserving("onTile") { TileRequests.listen() }

    OnStopObserving("onTile") { TileRequests.stopListening() }

    // `status` is an HTTP status, as MapLibre reads one: 200 with the image, 204 for a tile with
    // nothing to draw, 404 for one that never will, and another for one it asks again later.
    AsyncFunction("answer") { id: String, status: Int, data: ByteArray? ->
      TileRequests.answer(id, status, data)
    }
  }
}
