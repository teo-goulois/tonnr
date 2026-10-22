import ExpoModulesCore

// MapLibre reads its session configuration once, as its first map or its offline storage is made,
// which a module of MapLibre React Native may do as the JavaScript loads: the protocol is put in
// before anything of the app runs.
public class MapTilesAppDelegate: BaseExpoAppDelegateSubscriber, ExpoAppDelegateSubscriberProtocol {
  @MainActor
  public func subscriberDidRegister() {
    TileProtocol.install()
  }
}
