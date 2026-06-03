package scanner

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
)

// randomPlugin generates a DiscoveredPlugin with vendor/name drawn from a small
// alphabet so exclusion matches occur frequently under random testing.
func randomPlugin(t *rapid.T) metadata.DiscoveredPlugin {
	vendors := []string{"Waves", "FabFilter", "iZotope", "", "Native Instruments"}
	names := []string{"SSL", "Pro-Q", "Ozone", "Kontakt", "CLA"}
	return metadata.DiscoveredPlugin{
		Vendor: vendors[rapid.IntRange(0, len(vendors)-1).Draw(t, "vendor_idx")],
		Name:   names[rapid.IntRange(0, len(names)-1).Draw(t, "name_idx")],
	}
}

func randomExclusion(t *rapid.T) Exclusion {
	vendors := []string{"Waves", "FabFilter", "iZotope", "", "Native Instruments"}
	names := []string{"SSL", "Pro-Q", "Ozone", "Kontakt", "CLA"}
	return Exclusion{
		Vendor: vendors[rapid.IntRange(0, len(vendors)-1).Draw(t, "excl_vendor_idx")],
		Name:   names[rapid.IntRange(0, len(names)-1).Draw(t, "excl_name_idx")],
	}
}

func TestFilterExcluded_PBT_Completeness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		plugins := rapid.SliceOf(rapid.Custom(randomPlugin)).Draw(t, "plugins")
		exclusions := rapid.SliceOf(rapid.Custom(randomExclusion)).Draw(t, "exclusions")

		kept, excluded := FilterExcluded(plugins, exclusions)

		if len(kept)+len(excluded) != len(plugins) {
			t.Fatalf("completeness violated: kept(%d) + excluded(%d) != plugins(%d)",
				len(kept), len(excluded), len(plugins))
		}
	})
}

func TestFilterExcluded_PBT_Correctness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		plugins := rapid.SliceOf(rapid.Custom(randomPlugin)).Draw(t, "plugins")
		exclusions := rapid.SliceOf(rapid.Custom(randomExclusion)).Draw(t, "exclusions")

		set := make(map[exclusionKey]struct{}, len(exclusions))
		for _, e := range exclusions {
			set[exclusionKey{Vendor: e.Vendor, Name: e.Name}] = struct{}{}
		}

		kept, excluded := FilterExcluded(plugins, exclusions)

		for _, p := range excluded {
			if _, ok := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; !ok {
				t.Fatalf("correctness violated: excluded plugin %+v has no matching exclusion", p)
			}
		}
		for _, p := range kept {
			if _, ok := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; ok {
				t.Fatalf("correctness violated: kept plugin %+v matches an exclusion", p)
			}
		}
	})
}

func TestFilterExcluded_PBT_Disjointness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		plugins := rapid.SliceOf(rapid.Custom(randomPlugin)).Draw(t, "plugins")
		exclusions := rapid.SliceOf(rapid.Custom(randomExclusion)).Draw(t, "exclusions")

		kept, excluded := FilterExcluded(plugins, exclusions)

		// Index kept by position in the original slice to detect identity overlap.
		keptSet := make(map[int]bool)
		excludedSet := make(map[int]bool)
		ki, ei := 0, 0
		for i := range plugins {
			if ki < len(kept) && plugins[i] == kept[ki] {
				keptSet[i] = true
				ki++
			} else if ei < len(excluded) && plugins[i] == excluded[ei] {
				excludedSet[i] = true
				ei++
			}
		}
		for idx := range keptSet {
			if excludedSet[idx] {
				t.Fatalf("disjointness violated: plugin at index %d appears in both slices", idx)
			}
		}
	})
}

func TestFilterExcluded_PBT_OrderPreservation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		plugins := rapid.SliceOf(rapid.Custom(randomPlugin)).Draw(t, "plugins")
		exclusions := rapid.SliceOf(rapid.Custom(randomExclusion)).Draw(t, "exclusions")

		set := make(map[exclusionKey]struct{}, len(exclusions))
		for _, e := range exclusions {
			set[exclusionKey{Vendor: e.Vendor, Name: e.Name}] = struct{}{}
		}

		kept, excluded := FilterExcluded(plugins, exclusions)

		// Reconstruct expected kept/excluded order from input order.
		wantKept := make([]metadata.DiscoveredPlugin, 0)
		wantExcluded := make([]metadata.DiscoveredPlugin, 0)
		for _, p := range plugins {
			if _, ok := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; ok {
				wantExcluded = append(wantExcluded, p)
			} else {
				wantKept = append(wantKept, p)
			}
		}

		for i := range wantKept {
			if kept[i] != wantKept[i] {
				t.Fatalf("order preservation violated in kept at index %d: got %+v, want %+v",
					i, kept[i], wantKept[i])
			}
		}
		for i := range wantExcluded {
			if excluded[i] != wantExcluded[i] {
				t.Fatalf("order preservation violated in excluded at index %d: got %+v, want %+v",
					i, excluded[i], wantExcluded[i])
			}
		}
	})
}
