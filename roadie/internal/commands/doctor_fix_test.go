package commands

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ── diffBaselines / newFindings / containsFinding ─────────────────────────────

func TestContainsFinding(t *testing.T) {
	findings := []secretsFinding{
		{Type: "HexHighEntropyString", LineNumber: 5, HashedSecret: "abc123"},
		{Type: "BasicAuthCredentials", LineNumber: 12, HashedSecret: "def456"},
	}
	if !containsFinding(findings, secretsFinding{Type: "HexHighEntropyString", LineNumber: 5, HashedSecret: "abc123"}) {
		t.Error("expected to find matching finding")
	}
	if containsFinding(findings, secretsFinding{Type: "HexHighEntropyString", LineNumber: 5, HashedSecret: "different"}) {
		t.Error("same type/line but different hash must not match")
	}
	if containsFinding(findings, secretsFinding{Type: "HexHighEntropyString", LineNumber: 99, HashedSecret: "abc123"}) {
		t.Error("unexpected match for wrong line number")
	}
	if containsFinding(nil, secretsFinding{Type: "Anything", LineNumber: 1, HashedSecret: "x"}) {
		t.Error("expected false for nil findings")
	}
}

func TestNewFindings_ReturnsOnlyMissing(t *testing.T) {
	from := secretsResults{
		"a.py": {{Type: "SecretA", LineNumber: 1}, {Type: "SecretB", LineNumber: 2}},
	}
	to := secretsResults{
		"a.py": {{Type: "SecretA", LineNumber: 1}},
	}
	diffs := newFindings(from, to)
	if len(diffs) != 1 {
		t.Fatalf("expected 1 diff, got %d", len(diffs))
	}
	if diffs[0].desc != "SecretB:2" {
		t.Errorf("unexpected diff: %+v", diffs[0])
	}
}

func TestDiffBaselines_AddedAndRemoved(t *testing.T) {
	current := secretsResults{
		"old.py": {{Type: "OldSecret", LineNumber: 10}},
	}
	next := secretsResults{
		"new.py": {{Type: "NewSecret", LineNumber: 5}},
	}
	added, removed := diffBaselines(current, next)
	if len(added) != 1 || added[0].desc != "NewSecret:5" {
		t.Errorf("unexpected added: %v", added)
	}
	if len(removed) != 1 || removed[0].desc != "OldSecret:10" {
		t.Errorf("unexpected removed: %v", removed)
	}
}

func TestDiffBaselines_NoChanges(t *testing.T) {
	r := secretsResults{"a.py": {{Type: "X", LineNumber: 1}}}
	added, removed := diffBaselines(r, r)
	if len(added) != 0 || len(removed) != 0 {
		t.Errorf("expected no diffs for identical baselines")
	}
}

// ── printSecretsDiff ──────────────────────────────────────────────────────────

func TestPrintSecretsDiff_NoChanges(t *testing.T) {
	var out strings.Builder
	printSecretsDiff(&out, nil, nil)
	if !strings.Contains(out.String(), "up to date") {
		t.Errorf("expected up-to-date message, got: %q", out.String())
	}
}

func TestPrintSecretsDiff_ShowsAddedAndRemoved(t *testing.T) {
	var out strings.Builder
	added := []secretsDiff{{"file.py", "SecretA:5"}}
	removed := []secretsDiff{{"old.py", "OldSecret:10"}}
	printSecretsDiff(&out, added, removed)
	s := out.String()
	if !strings.Contains(s, "+") {
		t.Error("expected '+' prefix for added finding")
	}
	if !strings.Contains(s, "-") {
		t.Error("expected '-' prefix for removed finding")
	}
	if !strings.Contains(s, "SecretA:5") {
		t.Error("expected added finding in output")
	}
	if !strings.Contains(s, "OldSecret:10") {
		t.Error("expected removed finding in output")
	}
}

// ── runFixSecrets ─────────────────────────────────────────────────────────────

func TestRunFixSecrets_Dry_NoBinaryAvailable(t *testing.T) {
	t.Setenv("PATH", t.TempDir()) // no detect-secrets on PATH
	var out strings.Builder
	err := runFixSecrets(context.Background(), t.TempDir(), &out, true)
	if err == nil {
		t.Fatal("expected error when detect-secrets is missing")
	}
}

func TestRunFixSecrets_WritesBaseline(t *testing.T) {
	dir := t.TempDir()

	// Write current baseline (no findings — clean state).
	cleanJSON := `{"version":"1.4.0","plugins_used":[],"results":{}}`
	if err := os.WriteFile(filepath.Join(dir, ".secrets.baseline"), []byte(cleanJSON), 0644); err != nil {
		t.Fatal(err)
	}

	// Write a fake detect-secrets using printf (shell builtin — PATH-independent).
	fakeBin := filepath.Join(dir, "detect-secrets")
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s' '%s'\n", cleanJSON)
	if err := os.WriteFile(fakeBin, []byte(script), 0755); err != nil { //nolint:gosec
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)

	var out strings.Builder
	if err := runFixSecrets(context.Background(), dir, &out, false); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out.String(), "updated") {
		t.Errorf("expected 'updated' in output, got: %q", out.String())
	}
}

func TestRunFixSecrets_DryDoesNotWriteBaseline(t *testing.T) {
	dir := t.TempDir()
	// New scan finds one secret not in any existing baseline.
	newJSON := `{"version":"1.4.0","plugins_used":[],"results":{"new.py":[{"type":"NewSecret","line_number":3}]}}`
	fakeBin := filepath.Join(dir, "detect-secrets")
	script := fmt.Sprintf("#!/bin/sh\nprintf '%%s' '%s'\n", newJSON)
	if err := os.WriteFile(fakeBin, []byte(script), 0755); err != nil { //nolint:gosec
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)

	var out strings.Builder
	if err := runFixSecrets(context.Background(), dir, &out, true); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out.String(), "Dry run") {
		t.Errorf("expected dry-run message, got: %q", out.String())
	}
	if _, err := os.Stat(filepath.Join(dir, ".secrets.baseline")); !os.IsNotExist(err) {
		t.Error("dry run must not write .secrets.baseline")
	}
}

// ── fixCmd structure ──────────────────────────────────────────────────────────

func TestFixCmd_HasExpectedSubcommands(t *testing.T) {
	cmd := fixCmd()
	names := map[string]bool{}
	for _, sub := range cmd.Commands() {
		names[sub.Name()] = true
	}
	for _, want := range []string{"secrets", "woodpecker-agents", "tailscale-funnel"} {
		if !names[want] {
			t.Errorf("fix command missing subcommand %q", want)
		}
	}
}

func TestRunFixTailscaleFunnel_Success(t *testing.T) {
	dir := t.TempDir()
	fakeBin := filepath.Join(dir, "tailscale")
	if err := os.WriteFile(fakeBin, []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil { //nolint:gosec
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)

	var out strings.Builder
	if err := runFixTailscaleFunnel(context.Background(), 1984, &out); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out.String(), ":1984") {
		t.Errorf("expected port in output, got: %q", out.String())
	}
	if !strings.Contains(out.String(), "enabled") {
		t.Errorf("expected 'enabled' in output, got: %q", out.String())
	}
}

func TestRunFixTailscaleFunnel_BinaryFails(t *testing.T) {
	dir := t.TempDir()
	fakeBin := filepath.Join(dir, "tailscale")
	if err := os.WriteFile(fakeBin, []byte("#!/bin/sh\nexit 1\n"), 0755); err != nil { //nolint:gosec
		t.Fatal(err)
	}
	t.Setenv("PATH", dir)

	var out strings.Builder
	if err := runFixTailscaleFunnel(context.Background(), 1984, &out); err == nil {
		t.Error("expected error when tailscale exits non-zero")
	}
}

func TestRunFixTailscaleFunnel_BinaryMissing(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	var out strings.Builder
	if err := runFixTailscaleFunnel(context.Background(), 1984, &out); err == nil {
		t.Error("expected error when tailscale is not on PATH")
	}
}

func TestFixSecretsCmd_HasDryFlag(t *testing.T) {
	cmd := fixSecretsCmd()
	if cmd.Flags().Lookup("dry") == nil {
		t.Error("fix secrets is missing --dry flag")
	}
}
