import CryptoKit
import Foundation

// Opens a push as the iPhone's extension opens it, on a Mac: `open-push <private key> <secret>
// <body>`, each in base64url, prints what the push says. The test of packages/push compiles it
// with targets/notifications/NotificationService.swift and gives it pushes. Decision 072.
let arguments = CommandLine.arguments
guard arguments.count == 4,
  let raw = Data(base64url: arguments[1]),
  let auth = Data(base64url: arguments[2]),
  let body = Data(base64url: arguments[3])
else {
  FileHandle.standardError.write(Data("open-push <private key> <secret> <body>\n".utf8))
  exit(2)
}
do {
  let key = try P256.KeyAgreement.PrivateKey(rawRepresentation: raw)
  let said = try NotificationService.decrypt(body: body, key: key, auth: auth)
  FileHandle.standardOutput.write(said)
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  exit(1)
}
