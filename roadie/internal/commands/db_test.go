package commands

import (
	"strings"
	"testing"
)

func TestConfirmDBInit_YesProceeds(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("yes\n"), &out)
	if !ok {
		t.Error("expected confirmDBInit to return true for 'yes'")
	}
}

func TestConfirmDBInit_YesWithWhitespace(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("  yes  \n"), &out)
	if !ok {
		t.Error("expected confirmDBInit to return true for '  yes  ' (trimmed)")
	}
}

func TestConfirmDBInit_NoAborts(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("no\n"), &out)
	if ok {
		t.Error("expected confirmDBInit to return false for 'no'")
	}
	if !strings.Contains(out.String(), "Aborted") {
		t.Errorf("expected 'Aborted' in output, got: %q", out.String())
	}
}

func TestConfirmDBInit_EmptyInputAborts(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader("\n"), &out)
	if ok {
		t.Error("expected confirmDBInit to return false for empty input")
	}
}

func TestConfirmDBInit_EOFAborts(t *testing.T) {
	var out strings.Builder
	ok := confirmDBInit(strings.NewReader(""), &out)
	if ok {
		t.Error("expected confirmDBInit to return false on EOF (no input)")
	}
}

func TestConfirmDBInit_PrintsWarning(t *testing.T) {
	var out strings.Builder
	confirmDBInit(strings.NewReader("no\n"), &out)
	warning := out.String()
	if !strings.Contains(warning, "WARNING") {
		t.Errorf("expected WARNING in output, got: %q", warning)
	}
	if !strings.Contains(warning, "PRODUCTION") {
		t.Errorf("expected PRODUCTION in output, got: %q", warning)
	}
}
