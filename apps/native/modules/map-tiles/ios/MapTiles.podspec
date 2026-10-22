Pod::Spec.new do |s|
  s.name           = 'MapTiles'
  s.version        = '1.0.0'
  s.summary        = 'The tiles of the map that the app draws itself (decision 077).'
  s.description    = 'Answers the tiles MapLibre asks of a reserved host with what the JavaScript draws.'
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
