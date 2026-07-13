// Package license implements Grabify's offline entitlement layer: a signed
// entitlement certificate issued by the licensing backend after activation, its
// verification against a baked-in Ed25519 public key, and the Policy that maps
// an entitlement to the concrete limits the download engine enforces.
//
// The desktop app holds ONLY the public verification key — it can validate an
// entitlement fully offline but can never mint one. Every capability limit lives
// here in one place so the Go engine (never the Vue UI) is the source of truth
// for what Free and Pro may do.
package license

// Tier names. These are stable identifiers persisted in certificates and
// surfaced to the UI; do not rename without a migration.
const (
	TierFree = "free"
	TierPro  = "pro"
)

// Policy is the resolved set of limits for the current entitlement. The engine
// reads a Policy at every enforcement point (scheduler concurrency, per-download
// connections, throttling, proxy, queues, scheduling, credentials, video) so a
// lapse back to Free automatically re-clamps new actions without touching stored
// data.
type Policy struct {
	Tier string `json:"tier"`

	// Headline numeric limits.
	MaxActiveDownloads        int `json:"maxActiveDownloads"`        // simultaneous running downloads
	MaxConnectionsPerDownload int `json:"maxConnectionsPerDownload"` // parallel segments per download

	// Feature gates.
	AllowCustomQueues        bool `json:"allowCustomQueues"`        // queues beyond the single default queue
	AllowScheduling          bool `json:"allowScheduling"`          // per-queue / global time-window scheduling
	AllowCompletionActions   bool `json:"allowCompletionActions"`   // shutdown/sleep/hibernate on completion
	AllowPerScopeBandwidth   bool `json:"allowPerScopeBandwidth"`   // per-download and per-queue speed limits
	AllowProxy               bool `json:"allowProxy"`               // custom proxy URL
	AllowHostProfiles        bool `json:"allowHostProfiles"`        // per-host connection rules
	AllowStoredCredentials   bool `json:"allowStoredCredentials"`   // persisting HTTP auth credentials
	AllowVideoFormatChoice   bool `json:"allowVideoFormatChoice"`   // explicit format selection / high resolution
	AllowConcurrentFragments bool `json:"allowConcurrentFragments"` // parallel video fragment download

	// MaxVideoHeight caps the vertical resolution the engine will fetch. 0 means
	// unlimited. Free is capped at 720p.
	MaxVideoHeight int `json:"maxVideoHeight"`

	// MaxDevices is how many devices this entitlement may activate. Free never
	// activates (0); Pro Lifetime allows 3.
	MaxDevices int `json:"maxDevices"`
}

// FreePolicy is the default entitlement: what an unlicensed install — or a
// lapsed/expired/revoked license — is allowed to do.
func FreePolicy() Policy {
	return Policy{
		Tier:                      TierFree,
		MaxActiveDownloads:        3,
		MaxConnectionsPerDownload: 4,
		AllowCustomQueues:         false,
		AllowScheduling:           false,
		AllowCompletionActions:    false,
		AllowPerScopeBandwidth:    false,
		AllowProxy:                false,
		AllowHostProfiles:         false,
		AllowStoredCredentials:    false,
		AllowVideoFormatChoice:    false,
		AllowConcurrentFragments:  false,
		MaxVideoHeight:            720,
		MaxDevices:                0,
	}
}

// ProPolicy is the Grabify Pro Lifetime entitlement.
func ProPolicy() Policy {
	return Policy{
		Tier:                      TierPro,
		MaxActiveDownloads:        16,
		MaxConnectionsPerDownload: 16,
		AllowCustomQueues:         true,
		AllowScheduling:           true,
		AllowCompletionActions:    true,
		AllowPerScopeBandwidth:    true,
		AllowProxy:                true,
		AllowHostProfiles:         true,
		AllowStoredCredentials:    true,
		AllowVideoFormatChoice:    true,
		AllowConcurrentFragments:  true,
		MaxVideoHeight:            0,
		MaxDevices:                3,
	}
}

// IsPro reports whether the policy grants Pro-tier limits.
func (p Policy) IsPro() bool { return p.Tier == TierPro }
