FROM node:20-alpine
WORKDIR /app
# Upgrade zlib to fix CVE-2026-22184 (HIGH: buffer overflow, fix in 1.3.2-r0)
# Upgrade libcrypto3 libssl3 to fix CVE-2026-28390 (HIGH: OpenSSL NULL ptr deref, fix in 3.5.6-r0)
# Upgrade musl musl-utils to fix CVE-2026-40200 (HIGH: arbitrary code execution via stack-based overflow, fix in 1.2.5-r23)
RUN apk upgrade --no-cache zlib libcrypto3 libssl3 musl musl-utils
COPY package*.json ./
RUN npm ci
COPY . .

RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

EXPOSE 2112
# Bind to 0.0.0.0 so the container port is reachable from the host
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0", "--port", "2112"]
