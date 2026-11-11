# 2026-11-10: pinned by digest to Go 1.26.10, so the binary carries the fixed standard library (govulncheck).
# 2026-11-11: Go 1.26.11 for GO-2026-6859 (owner-approved exception to the 14-day rule; Go security point release).
# Digest only (Sonar docker:S8431, tag plus digest is ambiguous); it is golang:1.26.11-alpine.
FROM golang@sha256:ae52b5bc6ed045a9ed26ab03dc19327a802a9cc9aa8b27ed57f5c6b60579b0bb AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o gearlist_backend ./cmd/server

FROM alpine:3.21
RUN apk add --no-cache curl && adduser -D -u 1001 appuser
COPY --from=builder /app/gearlist_backend /usr/local/bin/gearlist_backend
USER appuser
EXPOSE 4001
ENTRYPOINT ["gearlist_backend"]
