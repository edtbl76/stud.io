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
	Discovered   []metadata.DiscoveredPlugin
	SkippedPaths []string
	Summary      *ServerSummary
	ScanID       string
}

// ServerSummary mirrors the ScanSummary returned by the API.
type ServerSummary struct {
	ScanID      string `json:"scan_id"`
	Known       int    `json:"known"`
	Matched     int    `json:"matched"`
	Conflicted  int    `json:"conflicted"`
	Unconfirmed int    `json:"unconfirmed"`
	Untracked   int    `json:"untracked"`
	Orphaned    int    `json:"orphaned"`
	Ignored     int    `json:"ignored"`
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
		ScanID       string                      `json:"scan_id,omitempty"`
		Discovered   []metadata.DiscoveredPlugin `json:"discovered"`
		SkippedPaths []string                    `json:"skipped_paths"`
		Summary      *ServerSummary              `json:"summary,omitempty"`
	}
	out := output{
		ScanID:       run.ScanID,
		Discovered:   run.Discovered,
		SkippedPaths: run.SkippedPaths,
		Summary:      run.Summary,
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
		fmt.Fprintf(r.out, "  %-25s %d\n", "Matched", s.Matched)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Conflicted", s.Conflicted)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Unconfirmed (fuzzy)", s.Unconfirmed)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Untracked", s.Untracked)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Orphaned", s.Orphaned)
		fmt.Fprintf(r.out, "  %-25s %d\n", "Ignored", s.Ignored)
	} else {
		fmt.Fprintf(r.out, "  %-25s %d\n", "Discovered", len(run.Discovered))
	}

	fmt.Fprintln(r.out, "─────────────────────────────")
	fmt.Fprintf(r.out, "  %-25s %d\n", "Total on disk", len(run.Discovered))

	if len(run.SkippedPaths) > 0 {
		fmt.Fprintf(r.out, "\n%sSkipped paths:\n", prefix)
		for _, p := range run.SkippedPaths {
			fmt.Fprintf(r.out, "  %s  (not found)\n", p)
		}
	}
	return nil
}
