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
		Discovered: []metadata.DiscoveredPlugin{{Name: "Reverb", Format: "VST3"}},
		Summary: &ServerSummary{
			Matched: 1, VersionMismatch: 0, Unconfirmed: 0,
			Untracked: 0, Orphaned: 0, Ignored: 0,
		},
	}
	if err := r.Render(run, RenderModeTerminal); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	if !strings.Contains(out, "abc12345") {
		t.Error("expected scan ID in output")
	}
	if !strings.Contains(out, "Matched") {
		t.Error("expected Matched in output")
	}
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
		Discovered:   []metadata.DiscoveredPlugin{{Name: "Synth", Format: "VST3"}},
		SkippedPaths: []string{},
		Summary:      &ServerSummary{Matched: 1},
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
	if _, ok := out["summary"]; !ok {
		t.Error("expected summary field in JSON")
	}
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
