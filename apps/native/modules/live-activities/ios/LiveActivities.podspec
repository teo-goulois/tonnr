Pod::Spec.new do |s|
  s.name           = 'LiveActivities'
  s.version        = '1.0.0'
  s.summary        = 'What the app reads of its Live Activities that expo-widgets does not say (decision 074).'
  s.description    = 'Whether the system lets the app show Live Activities, and which run, with what they show.'
  s.license        = 'AGPL-3.0'
  s.author         = 'Tonnr'
  s.homepage       = 'https://tonnr.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'ActivityKit'
  s.source_files = '**/*.swift'
end
