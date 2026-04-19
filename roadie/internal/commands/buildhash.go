package commands

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const dockerHashFile = ".roadie-cache/docker-hash"

// hashBuildFiles computes a combined sha256 over the contents of all listed
// files (relative to root). The file path is included in the hash so that
// renaming a file changes the hash even when content is identical.
func hashBuildFiles(root string, files []string) (string, error) {
	h := sha256.New()
	for _, f := range files {
		path := filepath.Join(root, f)
		data, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("hashing %s: %w", f, err)
		}
		fmt.Fprintf(h, "%s\n", f)
		h.Write(data)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// containerRebuildNeeded returns true when a container rebuild is required —
// either because the hash of rebuild_on files differs from the cached value,
// or because the cache file does not yet exist. Returns true on any read error
// so that failures always default to rebuilding rather than skipping.
func containerRebuildNeeded(root string, files []string, out io.Writer) bool {
	if len(files) == 0 {
		return true
	}
	current, err := hashBuildFiles(root, files)
	if err != nil {
		fmt.Fprintf(out, "[roadie] rebuild check: %v\n", err)
		return true
	}
	cached, err := os.ReadFile(filepath.Join(root, dockerHashFile))
	if err != nil {
		return true
	}
	if string(cached) == current {
		fmt.Fprintln(out, "[roadie] No changes to Dockerfiles or dependencies — skipping container rebuild.")
		return false
	}
	return true
}

// updateContainerHash writes the current content hash to .roadie-cache/docker-hash.
// Called after a successful build so the next invocation can detect unchanged files.
func updateContainerHash(root string, files []string) error {
	h, err := hashBuildFiles(root, files)
	if err != nil {
		return fmt.Errorf("computing build hash: %w", err)
	}
	path := filepath.Join(root, dockerHashFile)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("creating cache dir: %w", err)
	}
	return os.WriteFile(path, []byte(h), 0644)
}
