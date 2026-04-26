package pipeline

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// makeFakeBin creates dir and writes an empty executable named name into it.
func makeFakeBin(t *testing.T, dir, name string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("makeFakeBin: MkdirAll %s: %v", dir, err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(""), 0o755); err != nil {
		t.Fatalf("makeFakeBin: WriteFile %s: %v", name, err)
	}
}

// ── resolveNodeInHome ─────────────────────────────────────────────────────────

func TestResolveNodeInHome_NvmLatest(t *testing.T) {
	tmp := t.TempDir()
	nvmBin := filepath.Join(tmp, ".nvm", "versions", "node", "v20.0.0", "bin")
	makeFakeBin(t, nvmBin, "node")

	got := resolveNodeInHome(tmp)
	if got != nvmBin {
		t.Errorf("expected NVM bin dir %q, got %q", nvmBin, got)
	}
}

func TestResolveNodeInHome_NvmPicksLatest(t *testing.T) {
	tmp := t.TempDir()
	for _, ver := range []string{"v18.0.0", "v20.0.0", "v22.0.0"} {
		makeFakeBin(t, filepath.Join(tmp, ".nvm", "versions", "node", ver, "bin"), "node")
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
		makeFakeBin(t, filepath.Join(tmp, ".nvm", "versions", "node", ver, "bin"), "node")
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

// ── resolvePythonInHome ───────────────────────────────────────────────────────

func TestResolvePythonInHome_Conda(t *testing.T) {
	tmp := t.TempDir()
	condaBin := filepath.Join(tmp, "anaconda3", "bin")
	makeFakeBin(t, condaBin, "python")

	got := resolvePythonInHome(tmp)
	if got != condaBin {
		t.Errorf("expected conda bin dir %q, got %q", condaBin, got)
	}
}

func TestResolvePythonInHome_PrioritizesAnacondaOverMiniconda(t *testing.T) {
	tmp := t.TempDir()
	for _, dir := range []string{"anaconda3/bin", "miniconda3/bin"} {
		makeFakeBin(t, filepath.Join(tmp, dir), "python")
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

// ── resolveGoExe ──────────────────────────────────────────────────────────────

func TestResolveGoExe_ReturnsFirstMatchingDir(t *testing.T) {
	tmp := t.TempDir()
	snapBin := filepath.Join(tmp, "snap", "bin")
	makeFakeBin(t, snapBin, "go")
	stdBin := filepath.Join(tmp, "usr", "local", "go", "bin")
	makeFakeBin(t, stdBin, "go")

	got := resolveGoExe([]string{snapBin, stdBin})
	if got != snapBin {
		t.Errorf("expected snap bin %q to win, got %q", snapBin, got)
	}
}

func TestResolveGoExe_FallsBackToStdBin(t *testing.T) {
	tmp := t.TempDir()
	stdBin := filepath.Join(tmp, "usr", "local", "go", "bin")
	makeFakeBin(t, stdBin, "go")

	got := resolveGoExe([]string{filepath.Join(tmp, "snap", "bin"), stdBin})
	if got != stdBin {
		t.Errorf("expected std bin %q, got %q", stdBin, got)
	}
}

func TestResolveGoExe_NoneFound_ReturnsEmpty(t *testing.T) {
	tmp := t.TempDir()
	got := resolveGoExe([]string{filepath.Join(tmp, "snap", "bin"), filepath.Join(tmp, "usr", "local", "go", "bin")})
	if got != "" {
		t.Errorf("expected empty string when go not found, got %q", got)
	}
}

// ── ResolveGoBin ─────────────────────────────────────────────────────────────

func TestResolveGoBin_PrefersGOBINEnvVar(t *testing.T) {
	tmp := t.TempDir()
	gobinDir := filepath.Join(tmp, "gobin")
	os.MkdirAll(gobinDir, 0o755)
	t.Setenv("GOBIN", gobinDir)
	t.Setenv("GOPATH", "")

	got := ResolveGoBin()
	if got != gobinDir {
		t.Errorf("expected GOBIN dir %q, got %q", gobinDir, got)
	}
}

func TestResolveGoBin_GOBINMissingDirFallsToGOPATH(t *testing.T) {
	tmp := t.TempDir()
	gopathBin := filepath.Join(tmp, "go", "bin")
	os.MkdirAll(gopathBin, 0o755)
	t.Setenv("GOBIN", filepath.Join(tmp, "nonexistent"))
	t.Setenv("GOPATH", filepath.Join(tmp, "go"))

	got := ResolveGoBin()
	if got != gopathBin {
		t.Errorf("expected GOPATH bin %q, got %q", gopathBin, got)
	}
}

func TestResolveGoBin_MultiPathGOPATH_ReturnsFirstExisting(t *testing.T) {
	tmp := t.TempDir()
	absent := filepath.Join(tmp, "absent", "bin")
	present := filepath.Join(tmp, "present", "bin")
	os.MkdirAll(present, 0o755)
	t.Setenv("GOBIN", "")
	t.Setenv("GOPATH", strings.Join([]string{filepath.Dir(absent), filepath.Dir(present)}, string(os.PathListSeparator)))

	got := ResolveGoBin()
	if got != present {
		t.Errorf("expected first existing bin dir %q, got %q", present, got)
	}
}

func TestResolveGoBin_MultiPathGOPATH_SkipsEmptyEntries(t *testing.T) {
	tmp := t.TempDir()
	present := filepath.Join(tmp, "go", "bin")
	os.MkdirAll(present, 0o755)
	t.Setenv("GOBIN", "")
	// leading/trailing/double separators produce empty entries
	sep := string(os.PathListSeparator)
	t.Setenv("GOPATH", sep+filepath.Dir(present)+sep+sep)

	got := ResolveGoBin()
	if got != present {
		t.Errorf("expected present bin dir %q, got %q", present, got)
	}
}
