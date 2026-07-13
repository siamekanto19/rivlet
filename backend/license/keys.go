package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"os"
	"strings"
	"sync"
)

// KeySet is the collection of Ed25519 public keys the app trusts to have signed
// entitlement certificates, indexed by key id (KID). Certificates carry their
// signing KID in the header so keys can be rotated: ship a client that trusts
// both the old and new key, then retire the old one later.
type KeySet map[string]ed25519.PublicKey

// Lookup returns the public key for a KID.
func (k KeySet) Lookup(kid string) (ed25519.PublicKey, bool) {
	pub, ok := k[kid]
	return pub, ok && len(pub) == ed25519.PublicKeySize
}

// productionPublicKeyB64 is the standard-base64 Ed25519 public key that verifies
// production certificates. It is intentionally EMPTY until launch: the private
// half is generated during Track 4 (Paddle + live deploy) and stored only in a
// Cloudflare Worker secret; the public half is pasted here (or injected at build
// time via -ldflags "-X rivlet/backend/license.productionPublicKeyB64=...").
//
// While empty, the app trusts no production key and therefore stays Free-only —
// the correct fail-closed default before the licensing backend exists.
//
// Set to the raw Ed25519 public key (base64) whose private half signs
// entitlements in the deployed Worker (Cloudflare secret CERT_SIGNING_KEY).
// The current production KID deliberately remains "grabify-prod-1": a KID is
// an opaque cryptographic identifier, not product-facing copy. Keeping it
// preserves certificates issued before the Rivlet rebrand.
var productionPublicKeyB64 = "njDlv+mdUu6eFjwAPzFuBKEUnGE5i5qnR0bCIFuBCdI="

// ProductionKID is the KID the Worker stamps on production certificates.
const ProductionKID = "grabify-prod-1"

// DevKID is the KID used for certificates minted by the local dev signing tool
// (cmd/rivlet-licgen) against a key supplied via RIVLET_LICENSE_PUBKEY. This
// lets the whole entitlement path be exercised end-to-end before any real key
// exists, without ever trusting a dev key in a shipped build (the env var is not
// set on end-user machines).
const DevKID = "rivlet-dev"

var (
	trustedOnce sync.Once
	trusted     KeySet
)

// TrustedKeys returns the verification key set: the baked-in production key (if
// present) plus, when RIVLET_LICENSE_PUBKEY is set, a dev key for local
// testing. The result is cached after first use.
func TrustedKeys() KeySet {
	trustedOnce.Do(func() {
		trusted = KeySet{}
		if pub := decodePublicKey(productionPublicKeyB64); pub != nil {
			trusted[ProductionKID] = pub
		}
		pubKey := os.Getenv("RIVLET_LICENSE_PUBKEY")
		if pubKey == "" {
			pubKey = os.Getenv("GRABIFY_LICENSE_PUBKEY") // compatibility for existing dev setups
		}
		if pub := decodePublicKey(pubKey); pub != nil {
			trusted[DevKID] = pub
		}
	})
	return trusted
}

// decodePublicKey parses a base64 (standard or raw-url) encoded Ed25519 public
// key, returning nil for empty or malformed input.
func decodePublicKey(encoded string) ed25519.PublicKey {
	encoded = strings.TrimSpace(encoded)
	if encoded == "" {
		return nil
	}
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding, base64.RawURLEncoding, base64.URLEncoding} {
		if raw, err := enc.DecodeString(encoded); err == nil && len(raw) == ed25519.PublicKeySize {
			return ed25519.PublicKey(raw)
		}
	}
	return nil
}
