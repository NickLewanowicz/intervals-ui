require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'WidgetSnapshotBridge'
  s.version        = package['version']
  s.summary        = package['description']
  s.author         = { 'nick' => 'nick@imnick.dev' }
  s.homepage       = 'https://intervals.imnick.dev'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.0'
  s.source         = { path: __dir__ }
  s.source_files   = '**/*.swift'
  s.dependency 'ExpoModulesCore'
end
