package scanner

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
)

func assertJSONKeysPresent(t *testing.T, obj map[string]any, keys []string) {
	t.Helper()
	for _, key := range keys {
		if _, ok := obj[key]; !ok {
			t.Errorf("expected key %q in JSON object", key)
		}
	}
}

func assertJSONKeysAbsent(t *testing.T, obj map[string]any, keys []string) {
	t.Helper()
	for _, key := range keys {
		if _, ok := obj[key]; ok {
			t.Errorf("stale key %q must not appear in JSON object", key)
		}
	}
}

func assertTerminalLabelsPresent(t *testing.T, out string, labels []string) {
	t.Helper()
	for _, label := range labels {
		if !strings.Contains(out, label) {
			t.Errorf("expected label %q in terminal output", label)
		}
	}
}

func assertTerminalLabelsAbsent(t *testing.T, out string, labels []string) {
	t.Helper()
	for _, label := range labels {
		if strings.Contains(out, label) {
			t.Errorf("stale label %q must not appear in terminal output", label)
		}
	}
}

func makeBundle(t *testing.T, dir, name, ext string) string {
	t.Helper()
	bundle := filepath.Join(dir, name+ext)
	contents := filepath.Join(bundle, "Contents")
	if err := os.MkdirAll(contents, 0755); err != nil {
		t.Fatal(err)
	}
	plist := `<?xml version="1.0"?><plist version="1.0"><dict>
		<key>CFBundleName</key><string>` + name + `</string>
		<key>CFBundleVersion</key><string>1.0.0</string>
		<key>CFBundleIdentifier</key><string>com.test.` + name + `</string>
	</dict></plist>`
	os.WriteFile(filepath.Join(contents, "Info.plist"), []byte(plist), 0644)
	return bundle
}

// ---------------------------------------------------------------------------
// FilterExcluded
// ---------------------------------------------------------------------------

func assertPluginSliceEqual(t *testing.T, label string, got, want []metadata.DiscoveredPlugin) {
	t.Helper()
	if len(got) != len(want) {
		t.Errorf("%s: got %d plugins, want %d", label, len(got), len(want))
		return
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("%s[%d]: got %+v, want %+v", label, i, got[i], want[i])
		}
	}
}

func p(vendor, name string) metadata.DiscoveredPlugin {
	return metadata.DiscoveredPlugin{Vendor: vendor, Name: name}
}

func ex(vendor, name string) Exclusion {
	return Exclusion{Vendor: vendor, Name: name}
}

func TestFilterExcluded_EmptyExclusions(t *testing.T) {
	kept, excluded := FilterExcluded(
		[]metadata.DiscoveredPlugin{p("Waves", "SSL"), p("FabFilter", "Pro-Q")},
		[]Exclusion{},
	)
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{p("Waves", "SSL"), p("FabFilter", "Pro-Q")})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{})
}

func TestFilterExcluded_EmptyPlugins(t *testing.T) {
	kept, excluded := FilterExcluded([]metadata.DiscoveredPlugin{}, []Exclusion{ex("Waves", "SSL")})
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{})
}

func TestFilterExcluded_AllMatch(t *testing.T) {
	kept, excluded := FilterExcluded(
		[]metadata.DiscoveredPlugin{p("Waves", "SSL"), p("Waves", "CLA")},
		[]Exclusion{ex("Waves", "SSL"), ex("Waves", "CLA")},
	)
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{p("Waves", "SSL"), p("Waves", "CLA")})
}

func TestFilterExcluded_NoMatch(t *testing.T) {
	kept, excluded := FilterExcluded(
		[]metadata.DiscoveredPlugin{p("Waves", "SSL"), p("FabFilter", "Pro-Q")},
		[]Exclusion{ex("Ozone", "Imager")},
	)
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{p("Waves", "SSL"), p("FabFilter", "Pro-Q")})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{})
}

func TestFilterExcluded_Mixed(t *testing.T) {
	kept, excluded := FilterExcluded(
		[]metadata.DiscoveredPlugin{p("Waves", "SSL"), p("FabFilter", "Pro-Q"), p("Waves", "CLA")},
		[]Exclusion{ex("Waves", "SSL"), ex("Waves", "CLA")},
	)
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{p("FabFilter", "Pro-Q")})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{p("Waves", "SSL"), p("Waves", "CLA")})
}

func TestFilterExcluded_CaseSensitive(t *testing.T) {
	kept, excluded := FilterExcluded(
		[]metadata.DiscoveredPlugin{p("waves", "ssl"), p("Waves", "SSL")},
		[]Exclusion{ex("Waves", "SSL")},
	)
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{p("waves", "ssl")})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{p("Waves", "SSL")})
}

func TestFilterExcluded_EmptyVendorMatchesOnly(t *testing.T) {
	kept, excluded := FilterExcluded(
		[]metadata.DiscoveredPlugin{p("", "NoVendor"), p("Waves", "NoVendor")},
		[]Exclusion{ex("", "NoVendor")},
	)
	assertPluginSliceEqual(t, "kept", kept, []metadata.DiscoveredPlugin{p("Waves", "NoVendor")})
	assertPluginSliceEqual(t, "excluded", excluded, []metadata.DiscoveredPlugin{p("", "NoVendor")})
}

func TestScan_DiscoversBundlesAcrossPaths(t *testing.T) {
	dir := t.TempDir()
	path1 := filepath.Join(dir, "vst3")
	path2 := filepath.Join(dir, "au")
	os.MkdirAll(path1, 0755)
	os.MkdirAll(path2, 0755)
	makeBundle(t, path1, "Reverb", ".vst3")
	makeBundle(t, path2, "EQ", ".component")

	s := New(os.Stdout, true, false)
	plugins, skipped, err := s.Scan(context.Background(), []string{path1, path2})
	if err != nil {
		t.Fatal(err)
	}
	if len(plugins) != 2 {
		t.Errorf("expected 2 plugins, got %d", len(plugins))
	}
	if len(skipped) != 0 {
		t.Errorf("expected no skipped paths, got %v", skipped)
	}
}

func TestScan_NonExistentPathAddedToSkipped(t *testing.T) {
	dir := t.TempDir()
	path1 := filepath.Join(dir, "vst3")
	os.MkdirAll(path1, 0755)
	makeBundle(t, path1, "Synth", ".vst3")
	missing := filepath.Join(dir, "missing")

	s := New(os.Stdout, true, false)
	plugins, skipped, _ := s.Scan(context.Background(), []string{path1, missing})
	if len(plugins) != 1 {
		t.Errorf("expected 1 plugin, got %d", len(plugins))
	}
	if len(skipped) != 1 || skipped[0] != missing {
		t.Errorf("expected missing path in skipped, got %v", skipped)
	}
}

func TestScan_AllPathsSkipped_ReturnsEmpty(t *testing.T) {
	s := New(os.Stdout, true, false)
	plugins, skipped, _ := s.Scan(context.Background(), []string{"/nonexistent/a", "/nonexistent/b"})
	if len(plugins) != 0 {
		t.Errorf("expected 0 plugins, got %d", len(plugins))
	}
	if len(skipped) != 2 {
		t.Errorf("expected 2 skipped paths, got %d", len(skipped))
	}
}

func TestScan_ContextCancellation(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(dir, 0755)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	s := New(os.Stdout, true, false)
	_, _, err := s.Scan(ctx, []string{dir})
	// Should return quickly without hanging; error may or may not be set
	_ = err
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

func TestRenderer_TerminalOutput(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:     "abc12345-0000-0000-0000-000000000000",
		Discovered: []metadata.DiscoveredPlugin{{Name: "Reverb", Format: "vst3"}},
		Summary: &ServerSummary{
			Known: 0, Unlinked: 2, Orphaned: 0, NeedsReview: 1, Excluded: 0,
		},
	}
	if err := r.Render(run, RenderModeTerminal); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "abc12345") {
		t.Error("expected scan ID in output")
	}
	assertTerminalLabelsPresent(t, out, []string{"Known", "Unlinked", "Orphaned", "Needs Review", "Excluded", "Total on disk", "Excluded (pre-upload)"})
	assertTerminalLabelsAbsent(t, out, []string{"Matched", "Conflicted", "Unconfirmed", "Untracked", "Ignored"})
}

func TestRenderer_TerminalOutput_ExcludedPreUpload_ShowsWhenZero(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:          "x",
		Discovered:      []metadata.DiscoveredPlugin{{Name: "Synth", Format: "vst3"}},
		ExcludedPlugins: []metadata.DiscoveredPlugin{},
		Summary:         &ServerSummary{},
	}
	r.Render(run, RenderModeTerminal) //nolint:errcheck
	out := buf.String()
	assertTerminalLabelsPresent(t, out, []string{"Excluded (pre-upload)"})
	if !strings.Contains(out, "Excluded (pre-upload)") || !strings.Contains(out, "0") {
		t.Error("expected Excluded (pre-upload) line with count 0")
	}
}

func TestRenderer_TerminalOutput_ExcludedPreUpload_ShowsCount(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:     "x",
		Discovered: []metadata.DiscoveredPlugin{{Name: "A"}, {Name: "B"}, {Name: "C"}},
		ExcludedPlugins: []metadata.DiscoveredPlugin{
			{Name: "A", Vendor: "Waves"},
			{Name: "B", Vendor: "Waves"},
		},
		Summary: &ServerSummary{},
	}
	r.Render(run, RenderModeTerminal) //nolint:errcheck
	out := buf.String()
	if !strings.Contains(out, "2") {
		t.Error("expected count 2 in output")
	}
	assertTerminalLabelsPresent(t, out, []string{"Excluded (pre-upload)"})
}

func TestRenderer_DryRunPrefix(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{ScanID: "dry-run-id", Discovered: []metadata.DiscoveredPlugin{}}
	r.Render(run, RenderModeDryRun)
	if !strings.Contains(buf.String(), "[dry-run]") {
		t.Error("expected [dry-run] prefix")
	}
}

func TestRenderer_JSONOutput(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:       "test-id",
		Discovered:   []metadata.DiscoveredPlugin{{Name: "Synth", Format: "vst3"}},
		SkippedPaths: []string{},
		Summary:      &ServerSummary{Unlinked: 3, NeedsReview: 1},
	}
	if err := r.Render(run, RenderModeJSON); err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v — output: %s", err, buf.String())
	}
	if _, ok := out["discovered"]; !ok {
		t.Error("expected discovered field in JSON")
	}
	assertJSONKeysPresent(t, out, []string{"pre_filter_excluded"})
	summary, ok := out["summary"].(map[string]any)
	if !ok {
		t.Fatal("expected summary to be a JSON object")
	}
	assertJSONKeysPresent(t, summary, []string{"unlinked", "orphaned", "needs_review", "excluded"})
	assertJSONKeysAbsent(t, summary, []string{"matched", "conflicted"})
}

func TestRenderer_JSONOutput_PreFilterExcluded_EmptyArrayWhenNone(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:          "test-id",
		Discovered:      []metadata.DiscoveredPlugin{{Name: "Synth", Format: "vst3"}},
		SkippedPaths:    []string{},
		ExcludedPlugins: nil,
	}
	if err := r.Render(run, RenderModeJSON); err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	val, ok := out["pre_filter_excluded"]
	if !ok {
		t.Fatal("expected pre_filter_excluded key in JSON")
	}
	arr, ok := val.([]any)
	if !ok {
		t.Fatalf("expected pre_filter_excluded to be an array, got %T", val)
	}
	if len(arr) != 0 {
		t.Errorf("expected empty array, got %d elements", len(arr))
	}
}

func TestRenderer_JSONOutput_PreFilterExcluded_FullObjects(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:     "test-id",
		Discovered: []metadata.DiscoveredPlugin{{Name: "Synth"}, {Name: "EQ"}},
		ExcludedPlugins: []metadata.DiscoveredPlugin{
			{Name: "Synth", Vendor: "Waves", Format: "vst3", Version: "14.0"},
		},
	}
	if err := r.Render(run, RenderModeJSON); err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	if err := json.Unmarshal(buf.Bytes(), &out); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	arr, ok := out["pre_filter_excluded"].([]any)
	if !ok {
		t.Fatal("expected pre_filter_excluded to be an array")
	}
	if len(arr) != 1 {
		t.Fatalf("expected 1 excluded plugin, got %d", len(arr))
	}
	obj, ok := arr[0].(map[string]any)
	if !ok {
		t.Fatal("expected excluded entry to be a JSON object")
	}
	if obj["Name"] != "Synth" {
		t.Errorf("expected Name=Synth, got %v", obj["Name"])
	}
	if obj["Vendor"] != "Waves" {
		t.Errorf("expected Vendor=Waves, got %v", obj["Vendor"])
	}
}

func TestServerSummary_JSONRoundTrip(t *testing.T) {
	s := ServerSummary{
		ScanID:      "test-scan-id",
		Known:       5,
		Unlinked:    3,
		Orphaned:    1,
		NeedsReview: 2,
		Excluded:    4,
	}
	data, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	assertJSONKeysPresent(t, got, []string{"known", "unlinked", "orphaned", "needs_review", "excluded"})
	assertJSONKeysAbsent(t, got, []string{"matched", "conflicted", "unconfirmed", "untracked", "ignored"})
}

func TestRenderer_SkippedPathsShown(t *testing.T) {
	var buf bytes.Buffer
	r := NewRenderer(&buf, true)
	run := ScanRun{
		ScanID:       "x",
		Discovered:   []metadata.DiscoveredPlugin{},
		SkippedPaths: []string{"/missing/path"},
	}
	r.Render(run, RenderModeTerminal)
	if !strings.Contains(buf.String(), "/missing/path") {
		t.Error("expected skipped path in output")
	}
}
