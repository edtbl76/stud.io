package scanner

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
)

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

func makeExclusionSet(exclusions []Exclusion) map[exclusionKey]struct{} {
	set := make(map[exclusionKey]struct{}, len(exclusions))
	for _, e := range exclusions {
		set[exclusionKey{Vendor: e.Vendor, Name: e.Name}] = struct{}{}
	}
	return set
}

func assertAllExcludedMatch(t *rapid.T, set map[exclusionKey]struct{}, excluded []metadata.DiscoveredPlugin) {
	t.Helper()
	for _, p := range excluded {
		if _, ok := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; !ok {
			t.Fatalf("correctness: excluded plugin %+v has no matching exclusion", p)
		}
	}
}

func assertNoneKeptMatch(t *rapid.T, set map[exclusionKey]struct{}, kept []metadata.DiscoveredPlugin) {
	t.Helper()
	for _, p := range kept {
		if _, ok := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; ok {
			t.Fatalf("correctness: kept plugin %+v matches an exclusion", p)
		}
	}
}

func assertDisjointSlices(t *rapid.T, kept, excluded []metadata.DiscoveredPlugin) {
	t.Helper()
	inExcluded := make(map[metadata.DiscoveredPlugin]bool, len(excluded))
	for _, p := range excluded {
		inExcluded[p] = true
	}
	for _, p := range kept {
		if inExcluded[p] {
			t.Fatalf("disjointness violated: plugin %+v appears in both slices", p)
		}
	}
}

func partitionBySet(plugins []metadata.DiscoveredPlugin, set map[exclusionKey]struct{}) (kept, excluded []metadata.DiscoveredPlugin) {
	for _, p := range plugins {
		if _, ok := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; ok {
			excluded = append(excluded, p)
		} else {
			kept = append(kept, p)
		}
	}
	return kept, excluded
}

func assertOrderMatches(t *rapid.T, label string, got, want []metadata.DiscoveredPlugin) {
	t.Helper()
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("order preservation violated in %s at index %d: got %+v, want %+v", label, i, got[i], want[i])
		}
	}
}

// TestFilterExcluded_PBT verifies all four properties (completeness, correctness,
// disjointness, order preservation) in a single rapid.Check pass.
func TestFilterExcluded_PBT(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		plugins := rapid.SliceOf(rapid.Custom(randomPlugin)).Draw(t, "plugins")
		exclusions := rapid.SliceOf(rapid.Custom(randomExclusion)).Draw(t, "exclusions")
		kept, excluded := FilterExcluded(plugins, exclusions)
		set := makeExclusionSet(exclusions)
		wantKept, wantExcluded := partitionBySet(plugins, set)

		if len(kept)+len(excluded) != len(plugins) {
			t.Fatalf("completeness violated: kept(%d)+excluded(%d) != plugins(%d)", len(kept), len(excluded), len(plugins))
		}
		assertAllExcludedMatch(t, set, excluded)
		assertNoneKeptMatch(t, set, kept)
		assertDisjointSlices(t, kept, excluded)
		assertOrderMatches(t, "kept", kept, wantKept)
		assertOrderMatches(t, "excluded", excluded, wantExcluded)
	})
}
