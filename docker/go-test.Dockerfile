# Shared Go toolchain image for the containerized roadie Go unit lane
# (gearlist_backend + plugin_scanner). The golang base carries `go` + gcc — gcc is
# required for `go test -race` — and the three security/lint tools are installed on
# top. Kept out of the app runtime images so those stay lean and their CVE scans
# don't pick up build-only tooling. Rebuild to bump tool versions.
FROM golang:1.26

RUN go install golang.org/x/vuln/cmd/govulncheck@latest \
 && go install github.com/securego/gosec/v2/cmd/gosec@latest \
 && go install honnef.co/go/tools/cmd/staticcheck@latest
# go install drops the binaries in /go/bin, already on PATH in the golang image.

WORKDIR /workspace
