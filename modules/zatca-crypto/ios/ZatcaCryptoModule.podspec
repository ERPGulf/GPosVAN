Pod::Spec.new do |s|
  s.name           = 'ZatcaCryptoModule'
  s.version        = '1.0.0'
  s.summary        = 'ZATCA e-invoicing crypto operations for Expo'
  s.description    = 'Native module providing XML C14N canonicalization, ECDSA signing, X509 certificate parsing, and SHA-256 hashing for ZATCA e-invoicing compliance.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'OTHER_LDFLAGS' => '-lxml2',
    'HEADER_SEARCH_PATHS' => '$(SDKROOT)/usr/include/libxml2',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.libraries = 'xml2'
end
