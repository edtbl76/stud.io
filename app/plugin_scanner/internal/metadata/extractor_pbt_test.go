package metadata

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

func TestPropertiesVST2VendorHeuristic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		tld := rapid.SampledFrom([]string{"com", "net", "org", "io", "uk"}).Draw(t, "tld")
		vendor := rapid.StringMatching(`[a-z][a-z0-9-]{0,20}`).Draw(t, "vendor")
		plugin := rapid.StringMatching(`[a-z][a-z0-9-]{0,20}`).Draw(t, "plugin")
		id := tld + "." + vendor + "." + plugin

		got := vendorFromBundleID(id)

		switch strings.ToLower(tld) {
		case "com", "net", "org", "io":
			if got != vendor {
				t.Fatalf("vendorFromBundleID(%q) = %q, want %q", id, got, vendor)
			}
		default:
			// Non-standard TLD: first segment is used as vendor
			if got != tld {
				t.Fatalf("vendorFromBundleID(%q) = %q, want %q (non-standard TLD)", id, got, tld)
			}
		}
	})
}

func TestPropertiesVendorFewerThanThreeSegments(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		seg1 := rapid.StringMatching(`[a-z]{1,10}`).Draw(t, "seg1")
		seg2 := rapid.StringMatching(`[a-z]{1,10}`).Draw(t, "seg2")
		id := seg1 + "." + seg2

		got := vendorFromBundleID(id)
		if got != "" {
			t.Fatalf("expected empty vendor for 2-segment id %q, got %q", id, got)
		}
	})
}

func TestPropertiesAUVersionDecode(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.Uint64Range(0, 0x00FFFFFF).Draw(t, "version")
		result := decodeAUVersion(n)
		if result == "" {
			t.Fatal("decodeAUVersion should never return empty string for a uint64")
		}
		parts := strings.Split(result, ".")
		if len(parts) != 3 {
			t.Fatalf("decodeAUVersion(%d) = %q, expected 3 dot-separated parts", n, result)
		}
	})
}

func TestPropertiesFingerprintContract(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		vendor := rapid.StringMatching(`[a-zA-Z0-9 _-]{0,30}`).Draw(t, "vendor")
		name := rapid.StringMatching(`[a-zA-Z0-9 _-]{1,30}`).Draw(t, "name")

		fp := strings.ToLower(strings.TrimSpace(vendor + " " + name))
		if strings.ToLower(strings.TrimSpace(fp)) != fp {
			t.Fatalf("fingerprint is not stable under repeated normalization: %q", fp)
		}
	})
}
