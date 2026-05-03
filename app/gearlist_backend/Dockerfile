FROM golang:1.26-alpine AS builder
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
