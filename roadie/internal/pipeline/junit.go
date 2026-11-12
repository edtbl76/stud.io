package pipeline

import (
	"os"
	"path/filepath"
)

// JUnit reports for Trunk Flaky Tests (weyland B245). Opt-in: only ROADIE_JUNIT=1 turns them on — the Woodpecker
// pipeline sets it, a local run doesn't, so local output is unchanged. Every report lands under
// <root>/reports/junit/<variant>/ (jest, fast-check, pytest, hypothesis, go-test), the layout weyland-lab's
// trunk-upload.sh reads: one Trunk variant per directory. The caller creates the directories (the pipeline does a
// mkdir -p first): gotestsum does not create a missing parent.

// jestJUnitArgs keeps the default reporter beside jest-junit, so the console output the CI log relies on stays.
var jestJUnitArgs = []string{"--reporters=default", "--reporters=jest-junit"}

// junitDir returns the absolute JUnit report root when ROADIE_JUNIT=1, otherwise "".
func junitDir(root Root) string {
	if os.Getenv("ROADIE_JUNIT") != "1" {
		return ""
	}
	abs, err := filepath.Abs(string(root))
	if err != nil {
		abs = string(root)
	}
	return filepath.Join(abs, "reports", "junit")
}

// goTestInvocation returns the binary and args for a Go test run with the race detector and a coverage profile
// (Sonar reads coverage.out). With JUnit on, gotestsum wraps the same go test flags and writes report under go-test/.
func goTestInvocation(root Root, report string) (string, []string) {
	testArgs := []string{"-race", "-coverprofile=coverage.out", "./..."}
	if d := junitDir(root); d != "" {
		return "gotestsum", append([]string{"--junitfile", filepath.Join(d, "go-test", report), "--"}, testArgs...)
	}
	return "go", append([]string{"test"}, testArgs...)
}
