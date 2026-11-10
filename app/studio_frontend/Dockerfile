# 2026-11-10: pinned by digest (node 20.20.2, the last Node 20 image, 2026-04-15) so a rebuild never pulls an unreviewed base.
# Digest only (Sonar docker:S8431, tag plus digest is ambiguous); it is node:20.20.2-alpine.
FROM node@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293
WORKDIR /app
# Upgrade zlib to fix CVE-2026-22184 (HIGH: buffer overflow, fix in 1.3.2-r0)
# Upgrade libcrypto3 libssl3 to fix CVE-2026-28390 (HIGH: OpenSSL NULL ptr deref, fix in 3.5.6-r0)
# Upgrade musl musl-utils to fix CVE-2026-40200 (HIGH: arbitrary code execution via stack-based overflow, fix in 1.2.5-r23)
# 2026-11-10: also CVE-2026-14456 (OpenSSL 3.5.8-r0), CVE-2026-107891 (musl 1.2.5-r24), CVE-2026-85091 (zlib 1.3.2-r1).
# Changing this line busts Docker's cached layer: an unchanged RUN reuses the old, unpatched result.
# npm 10.8.2 from the base bundles old tar/pacote/glob/minimatch (trivy, incl. a critical in tar); 11.21.1 (2026-10-15)
# bundles fixed versions. Pinned; supports Node >= 20.17. One RUN for both (Sonar docker:S7031).
RUN apk upgrade --no-cache zlib libcrypto3 libssl3 musl musl-utils \
 && npm install -g npm@11.21.1 # refreshed 2026-11-10
COPY package*.json ./
RUN npm ci
COPY . .

RUN adduser --disabled-password --gecos '' appuser && chown -R appuser /app
USER appuser

EXPOSE 2112
# Bind to 0.0.0.0 so the container port is reachable from the host
CMD ["npx", "next", "dev", "--hostname", "0.0.0.0", "--port", "2112"]
