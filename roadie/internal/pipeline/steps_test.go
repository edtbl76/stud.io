package pipeline

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestNpmInstallStep_ScriptContainsCachePath(t *testing.T) {
	s := NpmInstallStep(Root("/repo"))
	script := s.Args[len(s.Args)-1] // last docker arg is the wrapped bash script
	wantCache := filepath.Join("/repo", ".roadie-cache", "npm-hash")
	if !strings.Contains(script, wantCache) {
		t.Errorf("script does not reference cache file %q\nscript: %s", wantCache, script)
	}
}

func TestNpmInstallStep_ScriptChecksNodeModules(t *testing.T) {
	s := NpmInstallStep(Root("."))
	if !strings.Contains(s.Args[len(s.Args)-1], "node_modules") {
		t.Error("script should check for node_modules directory before skipping")
	}
}

func TestNpmInstallStep_ScriptRunsInstall(t *testing.T) {
	s := NpmInstallStep(Root("."))
	if !strings.Contains(s.Args[len(s.Args)-1], "npm install --include=dev") {
		t.Error("script should run npm install --include=dev")
	}
}

func TestNpmInstallStep_ScriptWritesHash(t *testing.T) {
	s := NpmInstallStep(Root("/repo"))
	script := s.Args[len(s.Args)-1] // last docker arg is the wrapped bash script
	wantCache := filepath.Join("/repo", ".roadie-cache", "npm-hash")
	if !strings.Contains(script, "echo \"$hash\" > '"+wantCache+"'") {
		t.Errorf("script does not write hash to cache file %q\nscript: %s", wantCache, script)
	}
}
