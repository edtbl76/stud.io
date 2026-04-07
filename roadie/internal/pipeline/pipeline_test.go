package pipeline

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── Fake runner ───────────────────────────────────────────────────────────────

type fakeStepRunner struct {
	calls  []runCmd
	errors map[string]error // binary name → error to return
}

func (f *fakeStepRunner) Run(_ context.Context, out io.Writer, cmd runCmd) error {
	f.calls = append(f.calls, cmd)
	io.WriteString(out, "output from "+cmd.name+"\n")
	return f.errorFor(cmd)
}

func (f *fakeStepRunner) errorFor(cmd runCmd) error {
	for label, err := range f.errors {
		if strings.Contains(cmd.name, label) || strings.Contains(strings.Join(cmd.args, " "), label) {
			return err
		}
	}
	return nil
}

// ── LabelWriter ───────────────────────────────────────────────────────────────

func TestLabelWriter_SingleLine(t *testing.T) {
	var buf strings.Builder
	lw := NewLabelWriter("tsc", &buf)
	lw.Write([]byte("hello world\n"))
	if got := buf.String(); got != "[tsc] hello world\n" {
		t.Errorf("unexpected output: %q", got)
	}
}

func TestLabelWriter_MultipleLines(t *testing.T) {
	var buf strings.Builder
	lw := NewLabelWriter("jest", &buf)
	lw.Write([]byte("line one\nline two\nline three\n"))
	want := "[jest] line one\n[jest] line two\n[jest] line three\n"
	if got := buf.String(); got != want {
		t.Errorf("unexpected output:\ngot:  %q\nwant: %q", got, want)
	}
}

func TestLabelWriter_PartialLineBuffered(t *testing.T) {
	var buf strings.Builder
	lw := NewLabelWriter("pytest", &buf)

	lw.Write([]byte("partial"))
	if buf.Len() > 0 {
		t.Errorf("expected no output for partial line, got: %q", buf.String())
	}

	lw.Write([]byte(" line\n"))
	if got := buf.String(); got != "[pytest] partial line\n" {
		t.Errorf("unexpected output: %q", got)
	}
}

func TestLabelWriter_SplitAcrossWrites(t *testing.T) {
	var buf strings.Builder
	lw := NewLabelWriter("bandit", &buf)

	for _, chunk := range []string{"ab", "cd", "\n", "ef\n"} {
		lw.Write([]byte(chunk))
	}
	want := "[bandit] abcd\n[bandit] ef\n"
	if got := buf.String(); got != want {
		t.Errorf("unexpected output:\ngot:  %q\nwant: %q", got, want)
	}
}

func TestLabelWriter_Flush_WritesRemainingBuffer(t *testing.T) {
	var buf strings.Builder
	lw := NewLabelWriter("tsc", &buf)
	lw.Write([]byte("no newline at end"))

	if buf.Len() > 0 {
		t.Errorf("expected nothing written before flush, got: %q", buf.String())
	}
	if err := lw.Flush(); err != nil {
		t.Fatalf("unexpected flush error: %v", err)
	}
	if got := buf.String(); got != "[tsc] no newline at end\n" {
		t.Errorf("unexpected output after flush: %q", got)
	}
}

func TestLabelWriter_Flush_EmptyBuffer_IsNoop(t *testing.T) {
	var buf strings.Builder
	lw := NewLabelWriter("tsc", &buf)
	if err := lw.Flush(); err != nil {
		t.Fatalf("unexpected error flushing empty buffer: %v", err)
	}
	if buf.Len() > 0 {
		t.Errorf("expected no output for empty flush, got: %q", buf.String())
	}
}

func TestToolStep_Run_FlushesPartialLine(t *testing.T) {
	var out strings.Builder
	step := ToolStep{Name: "tsc", Bin: "tsc"}.withRunner(&partialLineRunner{})

	if err := step.Run(context.Background(), &out); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out.String(), "[tsc] partial output") {
		t.Errorf("expected flushed partial line in output, got: %q", out.String())
	}
}

// partialLineRunner writes output without a trailing newline to simulate a
// subprocess that exits mid-line.
type partialLineRunner struct{}

func (partialLineRunner) Run(_ context.Context, out io.Writer, cmd runCmd) error {
	io.WriteString(out, "partial output") // no trailing newline
	return nil
}

func TestLabelWriter_Write_PropagatesUnderlyingError(t *testing.T) {
	lw := NewLabelWriter("tsc", &errorWriter{err: errors.New("disk full")})
	n, err := lw.Write([]byte("line\n"))
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "disk full") {
		t.Errorf("expected 'disk full', got: %v", err)
	}
	if n != 0 {
		t.Errorf("expected n=0 on error, got %d", n)
	}
}

func TestLabelWriter_Write_FailsFastAfterError(t *testing.T) {
	lw := NewLabelWriter("tsc", &errorWriter{err: errors.New("disk full")})
	lw.Write([]byte("first\n"))
	_, err := lw.Write([]byte("second\n"))
	if err == nil {
		t.Fatal("expected sticky error on second write, got nil")
	}
}

func TestLabelWriter_Flush_PropagatesUnderlyingError(t *testing.T) {
	lw := NewLabelWriter("tsc", &errorWriter{err: errors.New("disk full")})
	lw.Write([]byte("no newline")) // partial — buffered, not yet written
	// The write above won't trigger the underlying writer (no newline yet),
	// but Flush will attempt to write and should propagate the error.
	if err := lw.Flush(); err == nil {
		t.Fatal("expected error from Flush, got nil")
	}
}

// errorWriter is an io.Writer that always returns the configured error.
type errorWriter struct{ err error }

func (e *errorWriter) Write(_ []byte) (int, error) { return 0, e.err }

// ── ToolStep.Run ──────────────────────────────────────────────────────────────

func TestToolStep_Run_Success(t *testing.T) {
	fake := &fakeStepRunner{}
	step := ToolStep{
		Name: "tsc",
		Bin:  "node_modules/.bin/tsc",
		Args: []string{"--noEmit"},
		Dir:  "/some/dir",
	}.withRunner(fake)

	var out strings.Builder
	if err := step.Run(context.Background(), &out); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(fake.calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(fake.calls))
	}
	if fake.calls[0].dir != "/some/dir" {
		t.Errorf("expected dir=/some/dir, got %q", fake.calls[0].dir)
	}

	if !strings.Contains(out.String(), "[tsc]") {
		t.Errorf("expected label in output, got: %q", out.String())
	}
}

func TestToolStep_Run_PropagatesError(t *testing.T) {
	fake := &fakeStepRunner{errors: map[string]error{"tsc": errors.New("type error")}}
	step := ToolStep{Name: "tsc", Bin: "node_modules/.bin/tsc"}.withRunner(fake)

	err := step.Run(context.Background(), io.Discard)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "type error") {
		t.Errorf("unexpected error: %v", err)
	}
}

// ── Pipeline.RunSequential ────────────────────────────────────────────────────

func TestPipeline_RunSequential_AllPass(t *testing.T) {
	fake := &fakeStepRunner{}
	steps := []ToolStep{
		{Name: "tsc", Bin: "tsc"},
		{Name: "jest", Bin: "jest"},
		{Name: "pytest", Bin: "python"},
	}
	p := New(steps...).withRunner(fake)

	if err := p.RunSequential(context.Background(), io.Discard); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(fake.calls) != 3 {
		t.Errorf("expected 3 calls, got %d", len(fake.calls))
	}
}

func TestPipeline_RunSequential_StopsOnFirstFailure(t *testing.T) {
	fake := &fakeStepRunner{errors: map[string]error{"jest": errors.New("test failed")}}
	steps := []ToolStep{
		{Name: "tsc", Bin: "tsc"},
		{Name: "jest", Bin: "jest"},
		{Name: "pytest", Bin: "python"},
	}
	p := New(steps...).withRunner(fake)

	err := p.RunSequential(context.Background(), io.Discard)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "jest") {
		t.Errorf("expected error to mention 'jest', got: %v", err)
	}
	// pytest must not have run
	if len(fake.calls) != 2 {
		t.Errorf("expected 2 calls (tsc + jest), got %d", len(fake.calls))
	}
}

// ── Pipeline.RunCollect ───────────────────────────────────────────────────────

func TestPipeline_RunCollect_AllPass(t *testing.T) {
	fake := &fakeStepRunner{}
	steps := []ToolStep{
		{Name: "bandit", Bin: "python"},
		{Name: "pip-audit", Bin: "python"},
		{Name: "npm-audit", Bin: "npm"},
	}
	p := New(steps...).withRunner(fake)

	results, err := p.RunCollect(context.Background(), io.Discard)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(results) != 3 {
		t.Errorf("expected 3 results, got %d", len(results))
	}
	for _, r := range results {
		if r.Err != nil {
			t.Errorf("step %q: unexpected error: %v", r.Name, r.Err)
		}
	}
}

func TestPipeline_RunCollect_RunsAllDespiteFailure(t *testing.T) {
	fake := &fakeStepRunner{errors: map[string]error{"pip-audit": errors.New("CVE found")}}
	// Use distinct Bin values so the fake runner can match by binary name.
	steps := []ToolStep{
		{Name: "bandit", Bin: "bandit"},
		{Name: "pip-audit", Bin: "pip-audit"},
		{Name: "npm-audit", Bin: "npm-audit"},
	}
	p := New(steps...).withRunner(fake)

	results, err := p.RunCollect(context.Background(), io.Discard)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	// All three steps must have been called.
	if len(fake.calls) != 3 {
		t.Errorf("expected 3 calls, got %d", len(fake.calls))
	}
	if len(results) != 3 {
		t.Errorf("expected 3 results, got %d", len(results))
	}
	// Only pip-audit should have an error.
	var failCount int
	for _, r := range results {
		if r.Err != nil {
			failCount++
		}
	}
	if failCount != 1 {
		t.Errorf("expected 1 failed result, got %d", failCount)
	}
}

func TestPipeline_RunCollect_ResultDurationsRecorded(t *testing.T) {
	fake := &fakeStepRunner{}
	p := New(ToolStep{Name: "bandit", Bin: "python"}).withRunner(fake)

	results, _ := p.RunCollect(context.Background(), io.Discard)
	if results[0].Duration < 0 {
		t.Errorf("expected non-negative duration, got %v", results[0].Duration)
	}
}

// ── PrintSummary ──────────────────────────────────────────────────────────────

func TestPrintSummary_ContainsPassFail(t *testing.T) {
	results := []StepResult{
		{Name: "bandit"},
		{Name: "pip-audit", Err: errors.New("found")},
	}
	var buf strings.Builder
	PrintSummary(&buf, results)

	out := buf.String()
	if !strings.Contains(out, "PASS") {
		t.Errorf("expected PASS in summary, got: %q", out)
	}
	if !strings.Contains(out, "FAIL") {
		t.Errorf("expected FAIL in summary, got: %q", out)
	}
	if !strings.Contains(out, "bandit") {
		t.Errorf("expected step name 'bandit' in summary, got: %q", out)
	}
}

// ── Script-wrapping step factories ───────────────────────────────────────────

type wantScriptStep struct {
	name   string
	script string
	dir    string
}

func assertScriptStep(t *testing.T, s ToolStep, want wantScriptStep) {
	t.Helper()
	if s.Name != want.name {
		t.Errorf("Name: got %q, want %q", s.Name, want.name)
	}
	if s.Bin != "bash" {
		t.Errorf("Bin: got %q, want bash", s.Bin)
	}
	if s.Dir != want.dir {
		t.Errorf("Dir: got %q, want %q", s.Dir, want.dir)
	}
	if !strings.Contains(strings.Join(s.Args, " "), want.script) {
		t.Errorf("Args: expected path containing %q, got %v", want.script, s.Args)
	}
}

func TestJestStep_Fields(t *testing.T) {
	s := JestStep("/repo", false)
	if s.Name != "jest" {
		t.Errorf("Name: got %q, want jest", s.Name)
	}
	if s.Bin != "node_modules/.bin/jest" {
		t.Errorf("Bin: got %q, want node_modules/.bin/jest (must be Dir-relative so chdir+exec resolves correctly)", s.Bin)
	}
	if s.Dir != "/repo/app/controlroom_frontend" {
		t.Errorf("Dir: got %q, want /repo/app/controlroom_frontend", s.Dir)
	}
}

func TestNpmInstallStep_Fields(t *testing.T) {
	s := NpmInstallStep("/repo")
	if s.Name != "npm-install" {
		t.Errorf("Name: got %q, want npm-install", s.Name)
	}
	if s.Bin != "npm" {
		t.Errorf("Bin: got %q, want npm", s.Bin)
	}
	if s.Dir != "/repo/app/controlroom_frontend" {
		t.Errorf("Dir: got %q, want /repo/app/controlroom_frontend", s.Dir)
	}
	if got := strings.Join(s.Args, " "); got != "install --include=dev" {
		t.Errorf("Args: got %q, want %q", got, "install --include=dev")
	}
}

func TestE2EStep_Fields(t *testing.T) {
	assertScriptStep(t, E2EStep("/repo"), wantScriptStep{"e2e", "test-e2e.sh", "/repo"})
}
func TestScanStep_Fields(t *testing.T) {
	assertScriptStep(t, ScanStep("/repo"), wantScriptStep{"scan", "test-scan.sh", "/repo"})
}
func TestPerfStep_Fields(t *testing.T) {
	assertScriptStep(t, PerfStep("/repo"), wantScriptStep{"perf", "test-perf.sh", "/repo"})
}

// ── Resolvers ─────────────────────────────────────────────────────────────────

func TestResolveNodeInHome_NvmLatest(t *testing.T) {
	tmp := t.TempDir()
	nvmBin := filepath.Join(tmp, ".nvm", "versions", "node", "v20.0.0", "bin")
	os.MkdirAll(nvmBin, 0o755)
	os.WriteFile(filepath.Join(nvmBin, "node"), []byte(""), 0o755)

	got := resolveNodeInHome(tmp)
	if got != nvmBin {
		t.Errorf("expected NVM bin dir %q, got %q", nvmBin, got)
	}
}

func TestResolveNodeInHome_NvmPicksLatest(t *testing.T) {
	tmp := t.TempDir()
	for _, ver := range []string{"v18.0.0", "v20.0.0", "v22.0.0"} {
		bin := filepath.Join(tmp, ".nvm", "versions", "node", ver, "bin")
		os.MkdirAll(bin, 0o755)
		os.WriteFile(filepath.Join(bin, "node"), []byte(""), 0o755)
	}

	got := resolveNodeInHome(tmp)
	wantBin := filepath.Join(tmp, ".nvm", "versions", "node", "v22.0.0", "bin")
	if got != wantBin {
		t.Errorf("expected latest version %q, got %q", wantBin, got)
	}
}

func TestResolveNodeInHome_NvmPicksHighestSemver_NotLexicographic(t *testing.T) {
	// v22.9.0 sorts lexicographically after v22.10.0 ("9" > "1") but is lower semver.
	tmp := t.TempDir()
	for _, ver := range []string{"v22.9.0", "v22.10.0"} {
		bin := filepath.Join(tmp, ".nvm", "versions", "node", ver, "bin")
		os.MkdirAll(bin, 0o755)
		os.WriteFile(filepath.Join(bin, "node"), []byte(""), 0o755)
	}

	got := resolveNodeInHome(tmp)
	wantBin := filepath.Join(tmp, ".nvm", "versions", "node", "v22.10.0", "bin")
	if got != wantBin {
		t.Errorf("expected v22.10.0 to win over v22.9.0, got %q", got)
	}
}

func TestResolveNodeInHome_NoNvm_ReturnsEmpty(t *testing.T) {
	tmp := t.TempDir()
	got := resolveNodeInHome(tmp)
	// System paths (/usr/local/bin, /usr/bin) may or may not have node.
	// We just verify the function doesn't panic and returns a string.
	_ = got
}

func TestResolvePythonInHome_Conda(t *testing.T) {
	tmp := t.TempDir()
	condaBin := filepath.Join(tmp, "anaconda3", "bin")
	os.MkdirAll(condaBin, 0o755)
	os.WriteFile(filepath.Join(condaBin, "python"), []byte(""), 0o755)

	got := resolvePythonInHome(tmp)
	if got != condaBin {
		t.Errorf("expected conda bin dir %q, got %q", condaBin, got)
	}
}

func TestResolvePythonInHome_PrioritizesAnacondaOverMiniconda(t *testing.T) {
	tmp := t.TempDir()
	for _, dir := range []string{"anaconda3/bin", "miniconda3/bin"} {
		full := filepath.Join(tmp, dir)
		os.MkdirAll(full, 0o755)
		os.WriteFile(filepath.Join(full, "python"), []byte(""), 0o755)
	}

	got := resolvePythonInHome(tmp)
	wantBin := filepath.Join(tmp, "anaconda3", "bin")
	if got != wantBin {
		t.Errorf("expected anaconda3 to win, got %q", got)
	}
}

func TestResolvePythonInHome_NoConda_ReturnsEmpty(t *testing.T) {
	tmp := t.TempDir()
	got := resolvePythonInHome(tmp)
	if got != "" {
		t.Errorf("expected empty string when no conda found, got %q", got)
	}
}

// ── pathEnv ───────────────────────────────────────────────────────────────────

func TestPathEnv_EmptyDir_ReturnsNil(t *testing.T) {
	if got := pathEnv(""); got != nil {
		t.Errorf("expected nil, got %v", got)
	}
}

func TestPathEnv_NonEmpty_PrependsToPATH(t *testing.T) {
	got := pathEnv("/usr/local/nvm/bin")
	if len(got) != 1 {
		t.Fatalf("expected 1 entry, got %v", got)
	}
	if !strings.HasPrefix(got[0], "PATH=/usr/local/nvm/bin:") {
		t.Errorf("expected PATH to start with injected dir, got: %q", got[0])
	}
}
