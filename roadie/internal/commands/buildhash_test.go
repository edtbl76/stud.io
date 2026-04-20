package commands

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTempFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writeTempFile %s: %v", name, err)
	}
	return name
}

func TestHashBuildFiles_ConsistentForSameContent(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")
	writeTempFile(t, dir, "requirements.txt", "fastapi==0.100.0")

	h1, err := hashBuildFiles(dir, []string{"Dockerfile", "requirements.txt"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	h2, err := hashBuildFiles(dir, []string{"Dockerfile", "requirements.txt"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h1 != h2 {
		t.Errorf("same files produced different hashes: %s vs %s", h1, h2)
	}
}

func TestHashBuildFiles_ChangesOnFileChange(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")

	before, _ := hashBuildFiles(dir, []string{"Dockerfile"})
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM ubuntu"), 0644); err != nil {
		t.Fatal(err)
	}
	after, _ := hashBuildFiles(dir, []string{"Dockerfile"})
	if before == after {
		t.Error("hash should change when file content changes")
	}
}

func TestHashBuildFiles_MissingFile(t *testing.T) {
	_, err := hashBuildFiles(t.TempDir(), []string{"does-not-exist"})
	if err == nil {
		t.Error("expected error for missing file, got nil")
	}
	if !strings.Contains(err.Error(), "does-not-exist") {
		t.Errorf("error should name the missing file, got: %v", err)
	}
}

func TestHashBuildFiles_EmptyList(t *testing.T) {
	h, err := hashBuildFiles(t.TempDir(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// sha256 of nothing is deterministic
	if h == "" {
		t.Error("expected non-empty hash for empty file list")
	}
}

func TestContainerRebuildNeeded_NoCacheFile(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")

	if !containerRebuildNeeded(dir, []string{"Dockerfile"}, io.Discard) {
		t.Error("expected rebuild when no cache file exists")
	}
}

func TestContainerRebuildNeeded_CacheMatches(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")

	if err := updateContainerHash(dir, []string{"Dockerfile"}); err != nil {
		t.Fatalf("updateContainerHash: %v", err)
	}
	if containerRebuildNeeded(dir, []string{"Dockerfile"}, io.Discard) {
		t.Error("expected no rebuild when hash matches")
	}
}

func TestContainerRebuildNeeded_CacheDiffers(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")
	if err := updateContainerHash(dir, []string{"Dockerfile"}); err != nil {
		t.Fatalf("updateContainerHash: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "Dockerfile"), []byte("FROM ubuntu"), 0644); err != nil {
		t.Fatal(err)
	}
	if !containerRebuildNeeded(dir, []string{"Dockerfile"}, io.Discard) {
		t.Error("expected rebuild when file content changed")
	}
}

func TestContainerRebuildNeeded_EmptyFiles(t *testing.T) {
	if !containerRebuildNeeded(t.TempDir(), nil, io.Discard) {
		t.Error("expected rebuild when rebuild_on is empty (always rebuild)")
	}
}

func TestContainerRebuildNeeded_SkipMessagePrinted(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")
	if err := updateContainerHash(dir, []string{"Dockerfile"}); err != nil {
		t.Fatalf("updateContainerHash: %v", err)
	}
	var buf strings.Builder
	containerRebuildNeeded(dir, []string{"Dockerfile"}, &buf)
	if !strings.Contains(buf.String(), "skipping container rebuild") {
		t.Errorf("expected skip message in output, got: %q", buf.String())
	}
}

func TestUpdateContainerHash_Roundtrip(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")
	writeTempFile(t, dir, "requirements.txt", "fastapi==0.100.0")
	files := []string{"Dockerfile", "requirements.txt"}

	if err := updateContainerHash(dir, files); err != nil {
		t.Fatalf("updateContainerHash: %v", err)
	}
	cached, err := os.ReadFile(filepath.Join(dir, dockerHashFile))
	if err != nil {
		t.Fatalf("reading cache file: %v", err)
	}
	expected, _ := hashBuildFiles(dir, files)
	if string(cached) != expected {
		t.Errorf("cached hash %q != computed hash %q", cached, expected)
	}
}

func TestUpdateContainerHash_CreatesCacheDir(t *testing.T) {
	dir := t.TempDir()
	writeTempFile(t, dir, "Dockerfile", "FROM alpine")

	if err := updateContainerHash(dir, []string{"Dockerfile"}); err != nil {
		t.Fatalf("updateContainerHash: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".roadie-cache")); os.IsNotExist(err) {
		t.Error("expected .roadie-cache directory to be created")
	}
}
