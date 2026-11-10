# 2026-11-10: pinned by digest to Go 1.26.10, so the binary carries the fixed standard library (govulncheck).
FROM golang:1.26-alpine@sha256:a2012b4a1d1f9f7e9f44e0d39b805a901e856b1dd80b4e6ee4338db547050308 AS builder
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
