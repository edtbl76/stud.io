# Shared Go toolchain image for the containerized roadie Go unit lane
# (gearlist_backend + plugin_scanner). The golang base carries `go` + gcc — gcc is
# required for `go test -race` — and the three security/lint tools are installed on
# top. Kept out of the app runtime images so those stay lean and their CVE scans
# don't pick up build-only tooling. Rebuild to bump tool versions.
# 2026-11-10: pinned by digest to Go 1.26.10 (govulncheck flagged the stdlib in the old 1.26.6 build: crypto/x509
# GO-2026-6809, net/http GO-2026-6613/6617/6612...). A floating tag would pull whatever is newest at rebuild.
# 2026-11-11: Go 1.26.11 for GO-2026-6859 (net/http HTTP/1 server crash, published that day). An owner-approved
# exception to the 14-day release-age rule: an official Go security point release, released 2026-11-10.
# Digest only (Sonar docker:S8431); it is golang:1.26.11.
FROM golang@sha256:7af425da11f4fc1a9308eb704369e3f6d1c44e35bac0f874a59ade3f20fdc07e

# Disable build VCS stamping. staticcheck/gosec/govulncheck compile the main
# packages, and the compiler otherwise shells out to git for VCS info — which fails
# with "dubious ownership" (exit 128) because the container runs as root against the
# host-owned bind-mounted repo. Test/lint runs don't need VCS stamps, so turn it off
# globally for every go invocation in this image.
ENV GOFLAGS=-buildvcs=false

# Pinned to the versions this image had run since 2026-09 (they were @latest): bump them deliberately.
# gotestsum (2026-11-11, weyland B245): with ROADIE_JUNIT=1, roadie wraps `go test` in it to write the JUnit report
# Trunk Flaky Tests reads; a plain local run still calls `go test` directly.
RUN go install golang.org/x/vuln/cmd/govulncheck@v1.7.0 \
 && go install github.com/securego/gosec/v2/cmd/gosec@v2.28.0 \
 && go install honnef.co/go/tools/cmd/staticcheck@v0.7.0 \
 && go install gotest.tools/gotestsum@v1.13.0
# go install drops the binaries in /go/bin, already on PATH in the golang image.

WORKDIR /workspace
