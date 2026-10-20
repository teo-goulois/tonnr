import CryptoKit
import Foundation
import ImageIO
import Security
import UniformTypeIdentifiers
import UserNotifications

// Opens a push of the instance before iOS shows it: what it says comes encrypted for this phone
// by RFC 8291, in `encrypted`, beside a line that stands in for it, which is what is shown when
// the push cannot be opened in time. Decision 072.
class NotificationService: UNNotificationServiceExtension {
  private var handler: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    handler = contentHandler
    let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
    self.content = content
    guard let sealed = request.content.userInfo["encrypted"] as? String,
      let push = Self.open(sealed)
    else { return contentHandler(content) }

    content.title = push["title"] as? String ?? content.title
    content.body = push["body"] as? String ?? ""
    if let thread = push["thread"] as? String { content.threadIdentifier = thread }
    if let category = push["category"] as? String { content.categoryIdentifier = category }
    if let badge = push["badge"] as? Int { content.badge = NSNumber(value: badge) }
    switch push["level"] as? String {
    case "passive": content.interruptionLevel = .passive
    case "time-sensitive": content.interruptionLevel = .timeSensitive
    default: content.interruptionLevel = .active
    }
    // What the app reads when the notification is pressed, under `body`, the one key of a remote
    // push that expo-notifications gives the app as its data.
    var info = content.userInfo
    info.removeValue(forKey: "encrypted")
    var said: [String: Any] = [:]
    for key in ["url", "ids", "pauseUntil", "tag"] { if let value = push[key] { said[key] = value } }
    info["body"] = said
    content.userInfo = info

    guard let image = push["image"] as? String, let address = URL(string: image) else {
      return contentHandler(content)
    }
    // A report's photo, written again as a JPEG, which a notification attaches: a picture that
    // does not come in time is left out, and the words are shown without it.
    URLSession.shared.downloadTask(with: address) { file, _, _ in
      if let file, let attachment = Self.attachment(from: file) {
        content.attachments = [attachment]
      }
      contentHandler(content)
    }.resume()
  }

  override func serviceExtensionTimeWillExpire() {
    if let handler, let content { handler(content) }
  }

  // MARK: Opening a push

  // The app's group, `group.` and the app's bundle, which is the extension's without its last part.
  private static let group: String = {
    let bundle = Bundle.main.bundleIdentifier ?? ""
    let suffix = ".notifications"
    return "group." + (bundle.hasSuffix(suffix) ? String(bundle.dropLast(suffix.count)) : bundle)
  }()
  private static let service = "app.tonnr.push"
  private static let account = "keys"

  /// What a push says, or nil when it cannot be opened: a key not readable before the first
  /// unlock, a body that does not decrypt.
  static func open(_ sealed: String) -> [String: Any]? {
    guard let keys = readKeys(), let body = Data(base64url: sealed),
      let plain = try? decrypt(body: body, key: keys.0, auth: keys.1)
    else { return nil }
    return (try? JSONSerialization.jsonObject(with: plain)) as? [String: Any]
  }

  private static func readKeys() -> (P256.KeyAgreement.PrivateKey, Data)? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
      let data = item as? Data, data.count == 48,
      let key = try? P256.KeyAgreement.PrivateKey(rawRepresentation: data.prefix(32))
    else { return nil }
    return (key, Data(data.suffix(16)))
  }

  /// RFC 8291 in the content coding aes128gcm of RFC 8188, one record, as packages/push writes it.
  static func decrypt(body: Data, key: P256.KeyAgreement.PrivateKey, auth: Data) throws -> Data {
    let bytes = [UInt8](body)
    guard bytes.count > 21 else { throw OpenError.short }
    let salt = Data(bytes[0..<16])
    let keyLength = Int(bytes[20])
    guard bytes.count > 21 + keyLength + 16 else { throw OpenError.short }
    let senderPoint = Data(bytes[21..<(21 + keyLength)])
    let sealed = Data(bytes[(21 + keyLength)...])

    let sender = try P256.KeyAgreement.PublicKey(x963Representation: senderPoint)
    let shared = try key.sharedSecretFromKeyAgreement(with: sender)
    let info = Data("WebPush: info".utf8) + Data([0]) + key.publicKey.x963Representation + senderPoint
    let ikm = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: auth, sharedInfo: info, outputByteCount: 32)
    let cek = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: ikm, salt: salt,
      info: Data("Content-Encoding: aes128gcm".utf8) + Data([0]), outputByteCount: 16)
    let nonce = HKDF<SHA256>.deriveKey(
      inputKeyMaterial: ikm, salt: salt,
      info: Data("Content-Encoding: nonce".utf8) + Data([0]), outputByteCount: 12)
    let nonceData = nonce.withUnsafeBytes { Data($0) }
    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: nonceData), ciphertext: sealed.dropLast(16), tag: sealed.suffix(16))
    var plain = [UInt8](try AES.GCM.open(box, using: cek))
    // The last record ends with the delimiter 2, then padding of zeros.
    while plain.last == 0 { plain.removeLast() }
    guard plain.last == 2 else { throw OpenError.padding }
    plain.removeLast()
    return Data(plain)
  }

  private static func attachment(from file: URL) -> UNNotificationAttachment? {
    guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else { return nil }
    let jpeg = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".jpg")
    guard let destination = CGImageDestinationCreateWithURL(jpeg as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
    else { return nil }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else { return nil }
    return try? UNNotificationAttachment(identifier: "photo", url: jpeg)
  }

  enum OpenError: Error { case short, padding }
}

extension Data {
  init?(base64url: String) {
    var written = base64url.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while written.count % 4 != 0 { written += "=" }
    self.init(base64Encoded: written)
  }
}
