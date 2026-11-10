# Shared Go toolchain image for the containerized roadie Go unit lane
# (gearlist_backend + plugin_scanner). The golang base carries `go` + gcc — gcc is
# required for `go test -race` — and the three security/lint tools are installed on
# top. Kept out of the app runtime images so those stay lean and their CVE scans
# don't pick up build-only tooling. Rebuild to bump tool versions.
# 2026-11-10: pinned by digest to Go 1.26.10 (govulncheck flagged the stdlib in the old 1.26.6 build: crypto/x509
# GO-2026-6809, net/http GO-2026-6613/6617/6612...). A floating tag would pull whatever is newest at rebuild.
FROM golang:1.26@sha256:cfa27959837144bf4649802ba38e59daffd0dd2a7994aa83daaf113285b0f551

# Disable build VCS stamping. staticcheck/gosec/govulncheck compile the main
# packages, and the compiler otherwise shells out to git for VCS info — which fails
# with "dubious ownership" (exit 128) because the container runs as root against the
# host-owned bind-mounted repo. Test/lint runs don't need VCS stamps, so turn it off
# globally for every go invocation in this image.
ENV GOFLAGS=-buildvcs=false

# Pinned to the versions this image had run since 2026-09 (they were @latest): bump them deliberately.
RUN go install golang.org/x/vuln/cmd/govulncheck@v1.7.0 \
 && go install github.com/securego/gosec/v2/cmd/gosec@v2.28.0 \
 && go install honnef.co/go/tools/cmd/staticcheck@v0.7.0
# go install drops the binaries in /go/bin, already on PATH in the golang image.

WORKDIR /workspace
