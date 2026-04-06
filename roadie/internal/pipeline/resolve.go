package pipeline

import (
	"os"
	"path/filepath"
)

// ResolveNode returns the bin directory containing the node binary, or ""
// if node cannot be found. It mirrors the PATH-resolution logic in run-tsc.sh
// and run-jest.sh: NVM's latest version first, then /usr/local/bin, /usr/bin.
func ResolveNode() string {
	home, _ := os.UserHomeDir()
	return resolveNodeInHome(home)
}

// ResolvePython returns the bin directory containing the python binary, or ""
// if python cannot be found. It mirrors run-pytest.sh: conda/miniconda
// directories first, then the system (relies on PATH already including python).
func ResolvePython() string {
	home, _ := os.UserHomeDir()
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
	// Try NVM — pick the lexicographically last (latest) installed version.
	nvmVersionsDir := filepath.Join(homeDir, ".nvm", "versions", "node")
	if entries, err := os.ReadDir(nvmVersionsDir); err == nil && len(entries) > 0 {
		latest := entries[len(entries)-1]
		binDir := filepath.Join(nvmVersionsDir, latest.Name(), "bin")
		if fileExists(filepath.Join(binDir, "node")) {
			return binDir
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

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}
