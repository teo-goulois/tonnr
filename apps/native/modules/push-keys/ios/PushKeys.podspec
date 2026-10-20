Pod::Spec.new do |s|
  s.name           = 'PushKeys'
  s.version        = '1.0.0'
  s.summary        = 'The keys a push to the app is encrypted for (decision 072).'
  s.description    = 'Makes and keeps the P-256 pair and the secret of RFC 8291 in the keychain.'
  s.license        = 'AGPL-3.0'
  s.author         = 'Tonnr'
  s.homepage       = 'https://tonnr.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
