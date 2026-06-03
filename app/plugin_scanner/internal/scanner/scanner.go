package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/studiocontrolroom/plugin_scanner/internal/metadata"
)

const discoveryChannelBuffer = 256

// RenderMode controls how results are displayed.
type RenderMode int

const (
	RenderModeTerminal RenderMode = iota
	RenderModeJSON
	RenderModeDryRun
)

// ScanRun holds the full result of a scan operation.
type ScanRun struct {
	Discovered      []metadata.DiscoveredPlugin
	SkippedPaths    []string
	Summary         *ServerSummary
	ScanID          string
	ExcludedPlugins []metadata.DiscoveredPlugin
}

// Exclusion is a vendor+name pair fetched from the server used to pre-filter plugins before upload.
type Exclusion struct {
	Vendor string
	Name   string
}

type exclusionKey struct {
	Vendor string
	Name   string
}

// FilterExcluded splits plugins into those matching an exclusion entry and those that don't.
// Input slices are not mutated. Order within each output slice mirrors the input order.
func FilterExcluded(plugins []metadata.DiscoveredPlugin, exclusions []Exclusion) (kept, excluded []metadata.DiscoveredPlugin) {
	set := make(map[exclusionKey]struct{}, len(exclusions))
	for _, e := range exclusions {
		set[exclusionKey{Vendor: e.Vendor, Name: e.Name}] = struct{}{}
	}
	kept = make([]metadata.DiscoveredPlugin, 0, len(plugins))
	excluded = make([]metadata.DiscoveredPlugin, 0)
	for _, p := range plugins {
		if _, match := set[exclusionKey{Vendor: p.Vendor, Name: p.Name}]; match {
			excluded = append(excluded, p)
		} else {
			kept = append(kept, p)
		}
	}
	return kept, excluded
}

// ServerSummary mirrors the ScanSummary returned by the API.
type ServerSummary struct {
	ScanID      string `json:"scan_id"`
	Known       int    `json:"known"`
	Unlinked    int    `json:"unlinked"`
	Orphaned    int    `json:"orphaned"`
	NeedsReview int    `json:"needs_review"`
	Excluded    int    `json:"excluded"`
}

// Scanner discovers plugins across configured scan paths.
type Scanner struct {
	NoColor bool
	JSON    bool
	out     io.Writer
}

// New creates a Scanner writing progress to out.
func New(out io.Writer, noColor, jsonMode bool) *Scanner {
	return &Scanner{out: out, NoColor: noColor, JSON: jsonMode}
}

// Scan walks all paths concurrently and returns discovered plugins and skipped paths.
func (s *Scanner) Scan(ctx context.Context, paths []string) ([]metadata.DiscoveredPlugin, []string, error) {
	ch := make(chan metadata.DiscoveredPlugin, discoveryChannelBuffer)
	skipped := []string{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	var count atomic.Int64

	for _, path := range paths {
		if _, err := os.Stat(path); err != nil {
			mu.Lock()
			skipped = append(skipped, path)
			mu.Unlock()
			continue
		}
		wg.Add(1)
		go func(p string) {
			defer wg.Done()
			s.walkPath(ctx, p, ch, &count)
		}(path)
	}

	go func() {
		wg.Wait()
		close(ch)
	}()

	plugins := []metadata.DiscoveredPlugin{}
	for p := range ch {
		plugins = append(plugins, p)
	}
	if !s.JSON && count.Load() > 0 {
		fmt.Fprintln(s.out)
	}
	return plugins, skipped, nil
}

func (s *Scanner) walkPath(ctx context.Context, path string, ch chan<- metadata.DiscoveredPlugin, count *atomic.Int64) {
	_ = filepath.WalkDir(path, func(entry string, d os.DirEntry, err error) error {
		if err != nil || !d.IsDir() {
			return nil
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !isPluginBundle(entry) {
			return nil
		}
		ch <- extractPlugin(entry)
		if !s.JSON {
			s.printProgress(fmt.Sprintf("Scanning... [%d plugins found]", count.Add(1)))
		} else {
			count.Add(1)
		}
		return filepath.SkipDir
	})
}

func isPluginBundle(entry string) bool {
	ext := strings.ToLower(filepath.Ext(entry))
	return ext == ".vst3" || ext == ".component" || ext == ".vst"
}

func extractPlugin(entry string) metadata.DiscoveredPlugin {
	plugin, err := metadata.ExtractorFor(entry).Extract(metadata.BundlePath(entry))
	if err != nil {
		plugin, _ = (&metadata.FallbackExtractor{}).Extract(metadata.BundlePath(entry))
	}
	return plugin
}

func (s *Scanner) printProgress(msg string) {
	if isatty() && !s.NoColor {
		fmt.Fprintf(s.out, "\r%-60s", msg)
	}
}

// PrintUploadProgress prints the upload counter in-place.
func (s *Scanner) PrintUploadProgress(current, total int) {
	if !s.JSON {
		s.printProgress(fmt.Sprintf("Uploading... [%d/%d]", current, total))
	}
}

// PrintUploadDone finalises the upload progress line.
func (s *Scanner) PrintUploadDone() {
	if !s.JSON {
		fmt.Fprintln(s.out)
	}
}

// isatty reports whether stdout is a terminal.
func isatty() bool {
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

// Renderer formats a ScanRun for output.
type Renderer struct {
	NoColor bool
	out     io.Writer
}

// NewRenderer creates a Renderer writing to out.
func NewRenderer(out io.Writer, noColor bool) *Renderer {
	return &Renderer{out: out, NoColor: noColor}
}

// Render outputs the ScanRun in the given mode.
func (r *Renderer) Render(run ScanRun, mode RenderMode) error {
	if mode == RenderModeJSON {
		return r.renderJSON(run)
	}
	return r.renderTerminal(run, mode == RenderModeDryRun)
}

func (r *Renderer) renderJSON(run ScanRun) error {
	type output struct {
		ScanID            string                      `json:"scan_id,omitempty"`
		Discovered        []metadata.DiscoveredPlugin `json:"discovered"`
		SkippedPaths      []string                    `json:"skipped_paths"`
		PreFilterExcluded []metadata.DiscoveredPlugin `json:"pre_filter_excluded"`
		Summary           *ServerSummary              `json:"summary,omitempty"`
	}
	excluded := run.ExcludedPlugins
	if excluded == nil {
		excluded = []metadata.DiscoveredPlugin{}
	}
	out := output{
		ScanID:            run.ScanID,
		Discovered:        run.Discovered,
		SkippedPaths:      run.SkippedPaths,
		PreFilterExcluded: excluded,
		Summary:           run.Summary,
	}
	enc := json.NewEncoder(r.out)
	enc.SetIndent("", "  ")
	return enc.Encode(out)
}

func (r *Renderer) renderTerminal(run ScanRun, dryRun bool) error {
	prefix := ""
	if dryRun {
		prefix = "[dry-run] "
	}

	shortID := run.ScanID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}

	fmt.Fprintf(r.out, "\n%sScan complete  [%s]\n", prefix, shortID)
	fmt.Fprintln(r.out, "─────────────────────────────")

	if run.Summary != nil {
		s := run.Summary
		fmt.Fprintf(r.out, "  %-25s %d\n", "Known", s.Known)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Unlinked", s.Unlinked)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Orphaned", s.Orphaned)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Needs Review", s.NeedsReview)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Excluded", s.Excluded)
	} else {
		fmt.Fprintf(r.out, "  %-25s %d\n", "Discovered", len(run.Discovered))
	}

	fmt.Fprintln(r.out, "─────────────────────────────")
	fmt.Fprintf(r.out, "  %-25s %d\n", "Total on disk", len(run.Discovered))
	fmt.Fprintf(r.out, "  %-25s %d\n", "Excluded (pre-upload)", len(run.ExcludedPlugins))

	if len(run.SkippedPaths) > 0 {
		fmt.Fprintf(r.out, "\n%sSkipped paths:\n", prefix)
		for _, p := range run.SkippedPaths {
			fmt.Fprintf(r.out, "  %s  (not found)\n", p)
		}
	}
	return nil
}
