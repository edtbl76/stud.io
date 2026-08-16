# Node toolchain image for the containerized roadie JS/TS unit lane (studio_frontend).
# node:24 (current LTS), NOT node:20 — the deploy image (node:20-alpine) only serves
# the built Next.js output and never runs jest, so the test toolchain isn't bound to
# the deploy Node. jest.config.ts is a TypeScript config with no ts-node dependency;
# parsing it relies on Node's native TS type-stripping (default since 23.6), which
# node:20 lacks, so jest can't even read its config there. node:24 matches how the
# tests actually run today (host node 25). Debian base (not alpine) so the
# npm-install step's bash + coreutils (sha256sum) are present. node_modules is
# installed at runtime into the bind-mounted repo, so nothing is COPY'd here — the
# image only supplies Node + npm.
FROM node:24

WORKDIR /workspace
