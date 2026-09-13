# Instructions for assetlinks.json (not served — see assetlinks.json)
#
# Fill sha256_cert_fingerprints from your release (or Play App Signing) cert:
#
#   keytool -list -v -keystore android/keystore/grocer-release.jks
#
# Copy the SHA-256 fingerprint (colon-separated hex), replace
# REPLACE_WITH_RELEASE_KEYSTORE_SHA256 in assetlinks.json, then deploy so
# https://<your-host>/.well-known/assetlinks.json is publicly reachable.
#
# If using Play App Signing, also (or instead) use the **App signing key
# certificate** SHA-256 from Play Console → App integrity.
