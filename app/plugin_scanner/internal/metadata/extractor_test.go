package metadata

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// makePlist writes a minimal XML plist to path.
func makePlist(t *testing.T, dir, filename, content string) string {
	t.Helper()
	path := filepath.Join(dir, filename)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

// ---------------------------------------------------------------------------
// VST3
// ---------------------------------------------------------------------------

func makeVST3Bundle(t *testing.T, dir, name string) string {
	t.Helper()
	bundle := filepath.Join(dir, name+".vst3")
	os.MkdirAll(filepath.Join(bundle, "Contents", "Resources"), 0755)
	return bundle
}

func makeAUBundle(t *testing.T, dir, name string) string {
	t.Helper()
	bundle := filepath.Join(dir, name+".component")
	os.MkdirAll(filepath.Join(bundle, "Contents"), 0755)
	return bundle
}

type wantPlugin struct{ name, vendor, source string }

func assertPlugin(t *testing.T, p DiscoveredPlugin, want wantPlugin) {
	t.Helper()
	if p.Name != want.name {
		t.Errorf("Name = %q, want %q", p.Name, want.name)
	}
	if p.Vendor != want.vendor {
		t.Errorf("Vendor = %q, want %q", p.Vendor, want.vendor)
	}
	if p.MetadataSource != want.source {
		t.Errorf("MetadataSource = %q, want %q", p.MetadataSource, want.source)
	}
}

func TestVST3_ModuleInfoPreferred(t *testing.T) {
	bundle := makeVST3Bundle(t, t.TempDir(), "Reverb")
	os.WriteFile(filepath.Join(bundle, "Contents", "Resources", "moduleinfo.json"),
		[]byte(`{"name":"Reverb Pro","version":"2.1.0","vendor":"Acme Audio"}`), 0644)
	makePlist(t, filepath.Join(bundle, "Contents"), "Info.plist", vst3Plist("OldName", "1.0.0"))

	p, err := (&VST3Extractor{}).Extract(BundlePath(bundle))
	if err != nil {
		t.Fatal(err)
	}
	assertPlugin(t, p, wantPlugin{"Reverb Pro", "Acme Audio", "moduleinfo.json"})
	if p.Version != "2.1.0" {
		t.Errorf("Version = %q, want 2.1.0", p.Version)
	}
}

func TestVST3_FallsBackToPlist(t *testing.T) {
	bundle := makeVST3Bundle(t, t.TempDir(), "Compressor")
	makePlist(t, filepath.Join(bundle, "Contents"), "Info.plist", vst3Plist("Compressor X", "3.0.0"))

	p, err := (&VST3Extractor{}).Extract(BundlePath(bundle))
	if err != nil {
		t.Fatal(err)
	}
	assertPlugin(t, p, wantPlugin{"Compressor X", "", "Info.plist"})
}

func TestVST3_FallbackWhenNoPlist(t *testing.T) {
	bundle := makeVST3Bundle(t, t.TempDir(), "Mystery")
	p, _ := (&VST3Extractor{}).Extract(BundlePath(bundle))
	assertPlugin(t, p, wantPlugin{"Mystery", "", "bundle-filename"})
}

// ---------------------------------------------------------------------------
// AU
// ---------------------------------------------------------------------------

func TestAU_NameSplitOnColon(t *testing.T) {
	bundle := makeAUBundle(t, t.TempDir(), "Plugin")
	makePlist(t, filepath.Join(bundle, "Contents"), "Info.plist", auPlist("Waves: Q10", 0x00010200))

	p, err := (&AUExtractor{}).Extract(BundlePath(bundle))
	if err != nil {
		t.Fatal(err)
	}
	if p.Vendor != "Waves" || p.Name != "Q10" {
		t.Errorf("vendor=%q name=%q, want Waves / Q10", p.Vendor, p.Name)
	}
	if p.Version != "1.2.0" {
		t.Errorf("version = %q, want 1.2.0", p.Version)
	}
}

func TestAU_NoColonInName(t *testing.T) {
	bundle := makeAUBundle(t, t.TempDir(), "Plugin")
	makePlist(t, filepath.Join(bundle, "Contents"), "Info.plist", auPlist("SimpleEQ", 0x00010000))

	p, _ := (&AUExtractor{}).Extract(BundlePath(bundle))
	if p.Vendor != "" || p.Name != "SimpleEQ" {
		t.Errorf("vendor=%q name=%q, want empty vendor / SimpleEQ", p.Vendor, p.Name)
	}
}

func TestAU_FallbackOnMissingPlist(t *testing.T) {
	bundle := makeAUBundle(t, t.TempDir(), "NoMeta")
	p, _ := (&AUExtractor{}).Extract(BundlePath(bundle))
	assertPlugin(t, p, wantPlugin{"NoMeta", "", "bundle-filename"})
}

// ---------------------------------------------------------------------------
// AU version decode
// ---------------------------------------------------------------------------

func TestDecodeAUVersion(t *testing.T) {
	cases := []struct {
		input uint64
		want  string
	}{
		{0x00010200, "1.2.0"},
		{0x00030405, "3.4.5"},
		{0x00000000, "0.0.0"},
	}
	for _, c := range cases {
		got := decodeAUVersion(c.input)
		if got != c.want {
			t.Errorf("decodeAUVersion(%#x) = %q, want %q", c.input, got, c.want)
		}
	}
}

// ---------------------------------------------------------------------------
// VST2
// ---------------------------------------------------------------------------

func TestVST2_VendorFromBundleID(t *testing.T) {
	cases := []struct {
		id     string
		vendor string
	}{
		{"com.fabfilter.pro-q-3", "fabfilter"},
		{"net.waves.q10", "waves"},
		{"io.pluginco.synth", "pluginco"},
		{"com.vendor", ""},
		{"toolong", ""},
	}
	for _, c := range cases {
		got := vendorFromBundleID(c.id)
		if got != c.vendor {
			t.Errorf("vendorFromBundleID(%q) = %q, want %q", c.id, got, c.vendor)
		}
	}
}

func TestVST2_FallbackOnMissingPlist(t *testing.T) {
	dir := t.TempDir()
	bundle := filepath.Join(dir, "OldPlug.vst")
	os.MkdirAll(filepath.Join(bundle, "Contents"), 0755)

	p, _ := (&VST2Extractor{}).Extract(BundlePath(bundle))
	if p.MetadataSource != "bundle-filename" {
		t.Errorf("MetadataSource = %q, want bundle-filename", p.MetadataSource)
	}
	if p.Name != "OldPlug" {
		t.Errorf("Name = %q, want OldPlug", p.Name)
	}
}

// ---------------------------------------------------------------------------
// ExtractorFor routing
// ---------------------------------------------------------------------------

func TestExtractorFor(t *testing.T) {
	if _, ok := ExtractorFor("Plugin.vst3").(*VST3Extractor); !ok {
		t.Error("expected VST3Extractor for .vst3")
	}
	if _, ok := ExtractorFor("Plugin.component").(*AUExtractor); !ok {
		t.Error("expected AUExtractor for .component")
	}
	if _, ok := ExtractorFor("Plugin.vst").(*VST2Extractor); !ok {
		t.Error("expected VST2Extractor for .vst")
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const plistHeader = `<?xml version="1.0" encoding="UTF-8"?>` +
	"\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n" +
	`<plist version="1.0"><dict>`

const plistFooter = `</dict></plist>`

func vst3Plist(name, version string) string {
	return plistHeader +
		"\n  <key>CFBundleName</key><string>" + name + "</string>" +
		"\n  <key>CFBundleVersion</key><string>" + version + "</string>" +
		"\n" + plistFooter
}

func auPlist(name string, version uint64) string {
	return plistHeader +
		"\n  <key>AudioComponents</key><array><dict>" +
		"\n    <key>name</key><string>" + name + "</string>" +
		"\n    <key>version</key><integer>" + fmt.Sprintf("%d", version) + "</integer>" +
		"\n  </dict></array>" +
		"\n" + plistFooter
}
