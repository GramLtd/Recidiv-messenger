Pod::Spec.new do |s|
  s.name           = 'RecidivistProxy'
  s.version        = '1.0.0'
  s.summary        = 'In-app HTTP/SOCKS5 proxy for React Native networking'
  s.author         = 'Recidivist'
  s.homepage       = 'https://recidivist.lol'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'React-Core'
  s.source_files = '**/*.{h,m,mm,swift}'
end
