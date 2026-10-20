import CryptoKit
import Foundation
import Security

// Where the phone's keys for push are kept: one item of the keychain, in the group the app shares
// with its notification extension, which reads it to open a push. Readable once the phone has
// been unlocked after it started, since a push comes while it is locked. Decision 072. The
// extension's own copy of these names is in targets/notifications/NotificationService.swift.
enum PushKeyStore {
  // The app's group is `group.` and its bundle, as app.config.ts writes it for the app and its
  // extension, so that an app built with identifiers of its own keeps its keys in its own group.
  static let group = "group.\(Bundle.main.bundleIdentifier ?? "")"
  static let service = "app.tonnr.push"
  static let account = "keys"

  /// The private key, raw, then the secret: 32 and 16 bytes.
  static func read() -> (P256.KeyAgreement.PrivateKey, Data)? {
    var query = base()
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data, data.count == 48,
      let key = try? P256.KeyAgreement.PrivateKey(rawRepresentation: data.prefix(32))
    else { return nil }
    return (key, data.suffix(16))
  }

  static func make() throws -> (P256.KeyAgreement.PrivateKey, Data) {
    let key = P256.KeyAgreement.PrivateKey()
    var secret = Data(count: 16)
    let status = secret.withUnsafeMutableBytes {
      SecRandomCopyBytes(kSecRandomDefault, 16, $0.baseAddress!)
    }
    guard status == errSecSuccess else { throw PushKeyError.random }
    forget()
    var item = base()
    item[kSecValueData as String] = key.rawRepresentation + secret
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let added = SecItemAdd(item as CFDictionary, nil)
    guard added == errSecSuccess else { throw PushKeyError.keychain(added) }
    return (key, secret)
  }

  static func forget() {
    SecItemDelete(base() as CFDictionary)
  }

  private static func base() -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
    ]
  }
}

enum PushKeyError: Error {
  case random
  case keychain(OSStatus)
}

extension Data {
  /// Base64url without padding, as RFC 8291's keys are written.
  var base64url: String {
    base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
