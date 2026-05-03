package metadata

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"howett.net/plist"
)

// DiscoveredPlugin is the result of extracting metadata from a plugin bundle.
type DiscoveredPlugin struct {
	Name           string
	Vendor         string
	Version        string
	Format         string
	Path           string
	MetadataSource string
}

// BundlePath is the absolute path to a plugin bundle directory on disk.
type BundlePath string

// MetadataExtractor extracts plugin metadata from a bundle directory.
type MetadataExtractor interface {
	Extract(bundlePath BundlePath) (DiscoveredPlugin, error)
}

// ExtractorFor returns the appropriate extractor based on file extension.
func ExtractorFor(path string) MetadataExtractor {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".vst3":
		return &VST3Extractor{}
	case ".component":
		return &AUExtractor{}
	case ".vst":
		return &VST2Extractor{}
	default:
		return &FallbackExtractor{}
	}
}

// FallbackExtractor uses the bundle filename as the plugin name.
type FallbackExtractor struct{}

func (f *FallbackExtractor) Extract(bundlePath BundlePath) (DiscoveredPlugin, error) {
	p := string(bundlePath)
	name := strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))
	return DiscoveredPlugin{
		Name:           name,
		MetadataSource: "bundle-filename",
		Path:           p,
		Format:         formatFromPath(p),
	}, nil
}

// ---------------------------------------------------------------------------
// VST3
// ---------------------------------------------------------------------------

type moduleInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Vendor  string `json:"vendor"`
}

// VST3Extractor reads moduleinfo.json first, falls back to Info.plist.
type VST3Extractor struct{}

func (e *VST3Extractor) Extract(bundlePath BundlePath) (DiscoveredPlugin, error) {
	p := string(bundlePath)
	mi, miErr := readModuleInfo(filepath.Join(p, "Contents", "Resources", "moduleinfo.json"))
	pi, piErr := readInfoPlist(filepath.Join(p, "Contents", "Info.plist"))

	if miErr == nil {
		warnIfVST3Conflict(bundlePath, mi, pi, piErr)
		return vst3FromModuleInfo(bundlePath, mi), nil
	}
	if piErr == nil {
		return vst3FromPlist(bundlePath, pi), nil
	}
	return (&FallbackExtractor{}).Extract(bundlePath)
}

func warnIfVST3Conflict(bundlePath BundlePath, mi moduleInfo, pi plistInfo, piErr error) {
	if piErr != nil {
		return
	}
	if mi.Name != pi.name || mi.Vendor != pi.vendor {
		fmt.Fprintf(os.Stderr, "warning: %s moduleinfo.json and Info.plist disagree (using moduleinfo.json)\n", filepath.Base(string(bundlePath)))
	}
}

func vst3FromModuleInfo(bundlePath BundlePath, mi moduleInfo) DiscoveredPlugin {
	return DiscoveredPlugin{
		Name: mi.Name, Vendor: mi.Vendor, Version: mi.Version,
		Format: "VST3", Path: string(bundlePath), MetadataSource: "moduleinfo.json",
	}
}

func vst3FromPlist(bundlePath BundlePath, pi plistInfo) DiscoveredPlugin {
	return DiscoveredPlugin{
		Name: pi.name, Vendor: pi.vendor, Version: pi.version,
		Format: "VST3", Path: string(bundlePath), MetadataSource: "Info.plist",
	}
}

func readModuleInfo(path string) (moduleInfo, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return moduleInfo{}, err
	}
	var mi moduleInfo
	return mi, json.Unmarshal(data, &mi)
}

// ---------------------------------------------------------------------------
// AU
// ---------------------------------------------------------------------------

// AUExtractor reads AudioComponents from Info.plist.
type AUExtractor struct{}

func (e *AUExtractor) Extract(bundlePath BundlePath) (DiscoveredPlugin, error) {
	p := string(bundlePath)
	data, err := os.ReadFile(filepath.Join(p, "Contents", "Info.plist"))
	if err != nil {
		return (&FallbackExtractor{}).Extract(bundlePath)
	}

	var info map[string]any
	if _, err := plist.Unmarshal(data, &info); err != nil {
		return (&FallbackExtractor{}).Extract(bundlePath)
	}

	components, ok := info["AudioComponents"].([]any)
	if !ok || len(components) == 0 {
		return (&FallbackExtractor{}).Extract(bundlePath)
	}
	comp, ok := components[0].(map[string]any)
	if !ok {
		return (&FallbackExtractor{}).Extract(bundlePath)
	}

	fullName, _ := comp["name"].(string)
	vendor, name := splitAUName(fullName)
	version := decodeAUVersion(comp["version"])

	return DiscoveredPlugin{
		Name: name, Vendor: vendor, Version: version,
		Format: "AU", Path: p, MetadataSource: "Info.plist",
	}, nil
}

func splitAUName(full string) (vendor, name string) {
	idx := strings.Index(full, ": ")
	if idx < 0 {
		return "", strings.TrimSpace(full)
	}
	return strings.TrimSpace(full[:idx]), strings.TrimSpace(full[idx+2:])
}

// decodeAUVersion converts a 32-bit AU version integer to a dotted string.
// High byte = major, next = minor, low two bytes = patch.
func decodeAUVersion(v any) string {
	var n uint64
	switch val := v.(type) {
	case uint64:
		n = val
	case int64:
		n = uint64(val)
	default:
		return ""
	}
	major := (n >> 16) & 0xFF
	minor := (n >> 8) & 0xFF
	patch := n & 0xFF
	return fmt.Sprintf("%d.%d.%d", major, minor, patch)
}

// ---------------------------------------------------------------------------
// VST2
// ---------------------------------------------------------------------------

// VST2Extractor reads Info.plist from a .vst bundle.
type VST2Extractor struct{}

func (e *VST2Extractor) Extract(bundlePath BundlePath) (DiscoveredPlugin, error) {
	p := string(bundlePath)
	pi, err := readInfoPlist(filepath.Join(p, "Contents", "Info.plist"))
	if err != nil {
		return (&FallbackExtractor{}).Extract(bundlePath)
	}
	return DiscoveredPlugin{
		Name: pi.name, Vendor: pi.vendor, Version: pi.version,
		Format: "VST2", Path: p, MetadataSource: "Info.plist",
	}, nil
}

// ---------------------------------------------------------------------------
// Shared plist helpers
// ---------------------------------------------------------------------------

type plistInfo struct {
	name    string
	vendor  string
	version string
}

func readInfoPlist(path string) (plistInfo, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return plistInfo{}, err
	}
	var info map[string]any
	if _, err := plist.Unmarshal(data, &info); err != nil {
		return plistInfo{}, err
	}
	name, _ := info["CFBundleName"].(string)
	version, _ := info["CFBundleVersion"].(string)
	bundleID, _ := info["CFBundleIdentifier"].(string)
	vendor := vendorFromBundleID(bundleID)
	return plistInfo{name: name, vendor: vendor, version: version}, nil
}

// vendorFromBundleID extracts vendor from a reverse-DNS identifier.
// Skips the TLD prefix (com/net/org/io) and takes the next segment.
// Returns "" if fewer than 3 segments remain after the split.
func vendorFromBundleID(id string) string {
	parts := strings.Split(id, ".")
	if len(parts) < 3 {
		return ""
	}
	start := 0
	switch strings.ToLower(parts[0]) {
	case "com", "net", "org", "io":
		start = 1
	}
	if start >= len(parts) {
		return ""
	}
	return parts[start]
}

func formatFromPath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".vst3":
		return "VST3"
	case ".component":
		return "AU"
	case ".vst":
		return "VST2"
	default:
		return ""
	}
}
