const { withPodfile } = require("expo/config-plugins");

/**
 * Expo config plugin that adds `use_modular_headers!` to the Podfile.
 * This is required for Firebase Swift pods (FirebaseCoreInternal,
 * FirebaseCrashlytics, FirebaseSessions) which depend on libraries
 * (GoogleUtilities, GoogleDataTransport, nanopb) that don't define modules.
 */
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults.contents;

    // Only add if not already present
    if (!podfile.includes("use_modular_headers!")) {
      // Insert use_modular_headers! right before the target block
      config.modResults.contents = podfile.replace(
        /^(target\s)/m,
        "use_modular_headers!\n\n$1"
      );
    }

    return config;
  });
};
