import ActivityKit
import ExpoModulesCore
import Foundation

// The attributes expo-widgets declares for every Live Activity it draws, written again as its
// version 58.0.21 writes them in `ios/Widgets/WidgetLiveActivity.swift`: ActivityKit knows a kind
// of activity by the name of its attributes, which is why a push that starts one names them by
// "LiveActivityAttributes" alone, so this type reads the activities expo-widgets started and
// those Apple's pushes started. Its content is the activity's name and what it shows, as a
// string of JSON. Decision 074.
struct LiveActivityAttributes: ActivityAttributes {
  var url: String?

  public struct ContentState: Codable, Hashable {
    var name: String
    var props: String?
  }
}

/**
 * What the app reads of its Live Activities that expo-widgets 58 does not give: whether the
 * system lets the app show them, which run and what each shows, among them the notification an
 * activity of a window is of, and an event each time iOS starts one or one changes, so that the
 * app, which iOS wakes as it starts one by a push, gives the API its token. Decision 074.
 */
public class LiveActivitiesModule: Module {
  private let lock = NSLock()
  private var watching: Task<Void, Never>?
  private var followed: [String: Task<Void, Never>] = [:]

  public func definition() -> ModuleDefinition {
    Name("LiveActivities")

    Events("onActivity")

    // The system's own switch for the app's Live Activities, in its settings.
    Function("areEnabled") { () -> Bool in
      ActivityAuthorizationInfo().areActivitiesEnabled
    }

    // Whether Apple's push can start one here: iOS 17.2 and later.
    Function("startByPush") { () -> Bool in
      if #available(iOS 17.2, *) {
        return true
      }
      return false
    }

    // The activities of that name that run, on the lock screen or in the Dynamic Island.
    Function("running") { (name: String) -> [[String: String]] in
      Activity<LiveActivityAttributes>.activities
        .filter { $0.content.state.name == name }
        .filter { $0.activityState == .active || $0.activityState == .stale }
        .map { activity in
          var entry = ["id": activity.id]
          if let props = activity.content.state.props {
            entry["props"] = props
          }
          return entry
        }
    }

    OnStartObserving("onActivity") {
      for activity in Activity<LiveActivityAttributes>.activities {
        self.follow(activity)
      }
      let task = Task { [weak self] in
        for await activity in Activity<LiveActivityAttributes>.activityUpdates {
          self?.follow(activity)
          self?.sendEvent("onActivity", ["id": activity.id])
        }
      }
      self.lock.lock()
      self.watching?.cancel()
      self.watching = task
      self.lock.unlock()
    }

    OnStopObserving("onActivity") {
      self.lock.lock()
      self.watching?.cancel()
      self.watching = nil
      for task in self.followed.values {
        task.cancel()
      }
      self.followed.removeAll()
      self.lock.unlock()
    }
  }

  // Tells the app each time an activity's state changes: dismissed by its person, ended, stale.
  private func follow(_ activity: Activity<LiveActivityAttributes>) {
    let id = activity.id
    lock.lock()
    defer { lock.unlock() }
    guard followed[id] == nil else {
      return
    }
    followed[id] = Task { [weak self] in
      for await _ in activity.activityStateUpdates {
        self?.sendEvent("onActivity", ["id": id])
      }
    }
  }
}
