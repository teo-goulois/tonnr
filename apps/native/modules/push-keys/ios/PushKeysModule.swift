import ExpoModulesCore

public class PushKeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PushKeys")

    // The public key, uncompressed, and the secret, as a browser gives its `p256dh` and `auth`.
    AsyncFunction("keys") { () -> [String: String] in
      let (key, secret) = try PushKeyStore.read() ?? PushKeyStore.make()
      return ["p256dh": key.publicKey.x963Representation.base64url, "auth": secret.base64url]
    }

    AsyncFunction("forget") {
      PushKeyStore.forget()
    }

    // The extension writes what a push says itself, in the words the server wrote it in.
    AsyncFunction("setLabels") { (_: [String: String]) in }
  }
}
