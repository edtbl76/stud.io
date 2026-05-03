package commands

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/spf13/cobra"
)

// AddDoctorCommands registers the doctor command and its subcommands on root.
func AddDoctorCommands(root *cobra.Command) {
	cmd := doctorCmd()
	cmd.AddCommand(fixCmd())
	root.AddCommand(cmd)
}

func doctorCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "doctor",
		Short: "Check prerequisites",
		Long:  `Verifies that all tools required by roadie are installed and reachable.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runDoctor(cmd.Context(), os.Stdout)
		},
	}
}

type doctorCheck struct {
	name  string
	check func(ctx context.Context) bool
}

func runDoctor(ctx context.Context, out io.Writer) error {
	checks := []doctorCheck{
		{"docker", checkBinary("docker")},
		{"docker compose", checkDockerCompose},
		{"node", checkBinary("node")},
		{"python", checkBinary("python")},
		{"k6", checkBinary("k6")},
		{"detect-secrets", checkBinary("detect-secrets")},
		{"GearList", checkHTTP("http://localhost:4001/health")},
		{"MinIO", checkHTTP("http://localhost:1983/minio/health/live")},
		{"SonarQube", checkHTTP("http://localhost:1969")},
	}

	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "─── roadie doctor ───────────────────────────")
	failed := 0
	for _, c := range checks {
		status := "PASS"
		if !c.check(ctx) {
			status = "FAIL"
			failed++
		}
		fmt.Fprintf(out, "  %-20s %s\n", c.name, status)
	}
	fmt.Fprintln(out, "─────────────────────────────────────────────")

	if failed > 0 {
		return fmt.Errorf("%d prerequisite(s) missing", failed)
	}
	fmt.Fprintln(out, "All prerequisites satisfied.")
	return nil
}

// checkBinary returns a check that passes when the named binary is on PATH.
func checkBinary(name string) func(ctx context.Context) bool {
	return func(_ context.Context) bool {
		_, err := exec.LookPath(name)
		return err == nil
	}
}

// checkDockerCompose verifies that `docker compose version` succeeds.
func checkDockerCompose(ctx context.Context) bool {
	cmd := exec.CommandContext(ctx, "docker", "compose", "version")
	return cmd.Run() == nil
}

// checkHTTP returns a check that passes when the URL returns a 2xx response.
func checkHTTP(url string) func(ctx context.Context) bool {
	return func(ctx context.Context) bool {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return false
		}
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return false
		}
		defer resp.Body.Close()
		return resp.StatusCode >= 200 && resp.StatusCode < 300
	}
}
