package pipeline

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// ResolveNode returns the bin directory containing the node binary, or ""
// if node cannot be found. It mirrors the PATH-resolution logic in run-tsc.sh
// and run-jest.sh: NVM's latest version first, then /usr/local/bin, /usr/bin.
func ResolveNode() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return resolveNodeInHome(home)
}

// ResolvePython returns the bin directory containing the python binary, or ""
// if python cannot be found. It mirrors run-pytest.sh: conda/miniconda
// directories first, then the system (relies on PATH already including python).
func ResolvePython() string {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	return resolvePythonInHome(home)
}

// pathEnv returns a slice with a single PATH entry that prepends dir to the
// current PATH. Returns nil when dir is empty so callers can pass it directly
// as the Env field of a ToolStep without special-casing.
func pathEnv(dir string) []string {
	if dir == "" {
		return nil
	}
	return []string{"PATH=" + dir + ":" + os.Getenv("PATH")}
}

// resolveNodeInHome is the testable core of ResolveNode.
func resolveNodeInHome(homeDir string) string {
	// Try NVM — pick the highest semver-versioned install.
	nvmVersionsDir := filepath.Join(homeDir, ".nvm", "versions", "node")
	if entries, err := os.ReadDir(nvmVersionsDir); err == nil {
		if name := highestSemver(entries); name != "" {
			binDir := filepath.Join(nvmVersionsDir, name, "bin")
			if fileExists(filepath.Join(binDir, "node")) {
				return binDir
			}
		}
	}
	// Fall back to common system locations.
	for _, dir := range []string{"/usr/local/bin", "/usr/bin"} {
		if fileExists(filepath.Join(dir, "node")) {
			return dir
		}
	}
	return ""
}

// highestSemver returns the name of the directory entry with the highest
// semantic version of the form vX.Y.Z. Entries that cannot be parsed are
// skipped. Returns "" when no parseable entries are found.
func highestSemver(entries []os.DirEntry) string {
	best := [3]int{-1, -1, -1}
	bestName := ""
	for _, e := range entries {
		v, ok := parseSemver(e.Name())
		if !ok {
			continue
		}
		if semverGreater(v, best) {
			best = v
			bestName = e.Name()
		}
	}
	return bestName
}

// semverGreater reports whether a is strictly greater than b.
func semverGreater(a, b [3]int) bool {
	if a[0] != b[0] {
		return a[0] > b[0]
	}
	if a[1] != b[1] {
		return a[1] > b[1]
	}
	return a[2] > b[2]
}

// parseSemver parses a directory name of the form vX.Y.Z into [major, minor, patch].
func parseSemver(name string) ([3]int, bool) {
	parts := strings.SplitN(strings.TrimPrefix(name, "v"), ".", 3)
	if len(parts) != 3 {
		return [3]int{}, false
	}
	var v [3]int
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return [3]int{}, false
		}
		v[i] = n
	}
	return v, true
}

// resolvePythonInHome is the testable core of ResolvePython.
func resolvePythonInHome(homeDir string) string {
	candidates := []string{
		filepath.Join(homeDir, "anaconda3", "bin"),
		filepath.Join(homeDir, "miniconda3", "bin"),
		filepath.Join(homeDir, "opt", "anaconda3", "bin"),
		filepath.Join(homeDir, "opt", "miniconda3", "bin"),
	}
	for _, dir := range candidates {
		if fileExists(filepath.Join(dir, "python")) {
			return dir
		}
	}
	return ""
}

// ResolveGoBin returns the directory containing go-installed tool binaries
// (govulncheck, gosec, staticcheck), or "" if it cannot be determined.
// Resolution order: GOBIN env var, GOPATH/bin, then ~/go/bin. GOBIN is
// checked first so CI agents can provide an explicit path without relying
// on HOME, which Woodpecker's local backend overrides with a temp dir.
func ResolveGoBin() string {
	if gobin := os.Getenv("GOBIN"); gobin != "" {
		if info, err := os.Stat(gobin); err == nil && info.IsDir() {
			return gobin
		}
	}
	for _, entry := range strings.Split(os.Getenv("GOPATH"), string(os.PathListSeparator)) {
		if entry = strings.TrimSpace(entry); entry == "" {
			continue
		}
		bin := filepath.Join(entry, "bin")
		if info, err := os.Stat(bin); err == nil && info.IsDir() {
			return bin
		}
	}
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ""
	}
	bin := filepath.Join(home, "go", "bin")
	if info, err := os.Stat(bin); err == nil && info.IsDir() {
		return bin
	}
	return ""
}

// goBinPath returns the absolute path to a go-installed binary (govulncheck,
// gosec, staticcheck). Falls back to the bare name when ResolveGoBin returns ""
// so the step still attempts execution via PATH.
func goBinPath(name string) string {
	if dir := ResolveGoBin(); dir != "" {
		return filepath.Join(dir, name)
	}
	return name
}

// ResolveGoExe returns the bin directory containing the go binary, or ""
// if go cannot be found in well-known locations. Snap systems install go
// at /snap/bin/go; standard installations use /usr/local/go/bin.
func ResolveGoExe() string {
	return resolveGoExe([]string{"/snap/bin", "/usr/local/go/bin", "/usr/bin"})
}

// resolveGoExe is the testable core of ResolveGoExe.
func resolveGoExe(candidates []string) string {
	for _, dir := range candidates {
		if fileExists(filepath.Join(dir, "go")) {
			return dir
		}
	}
	return ""
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Mode().Perm()&0o111 != 0
}
