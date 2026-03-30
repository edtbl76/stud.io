FROM node:20-alpine
WORKDIR /app
# Upgrade zlib to fix CVE-2026-22184 (HIGH: buffer overflow, fix in 1.3.2-r0)
RUN apk upgrade --no-cache zlib
COPY package*.json ./
RUN npm install
COPY . .

RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

EXPOSE 2112
# Bind to 0.0.0.0 so the container port is reachable from the host
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0", "--port", "2112"]
