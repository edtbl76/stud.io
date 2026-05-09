#!/usr/bin/env bash
# Builds the plugin-scanner binary, zips it with the install script, and
# uploads the versioned artifact to MinIO.
# Required env: MINIO_ACCESS_KEY, MINIO_SECRET_KEY
# Optional env: MINIO_ENDPOINT (default: http://localhost:1983)
set -euo pipefail

VERSION="${1:-$(git describe --tags --always)}"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARTIFACT="plugin-scanner-${VERSION}-${TIMESTAMP}-darwin-arm64"
ENDPOINT="${MINIO_ENDPOINT:-http://localhost:1983}"
BUCKET="studio-downloads"
OBJECT="plugin-scanner/${ARTIFACT}.zip"

echo "Building plugin-scanner ${VERSION} for darwin/arm64..."
GOOS=darwin GOARCH=arm64 go build \
  -ldflags "-X main.version=${VERSION}" \
  -o plugin-scanner \
  ./cmd/plugin-scanner

echo "Preparing release archive..."
sed "s|__VERSION__|${VERSION}|g" install.sh.tmpl > /tmp/install.sh
chmod +x /tmp/install.sh
mkdir -p "/tmp/${ARTIFACT}"
cp plugin-scanner "/tmp/${ARTIFACT}/"
cp /tmp/install.sh "/tmp/${ARTIFACT}/"
cd /tmp && zip -r "${ARTIFACT}.zip" "${ARTIFACT}/"

echo "Uploading ${ARTIFACT}.zip to ${ENDPOINT}/${BUCKET}/${OBJECT}..."
/usr/bin/curl -sf -X PUT \
  --aws-sigv4 "aws:amz:us-east-1:s3" \
  --user "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
  -H "Content-Type: application/zip" \
  --data-binary "@/tmp/${ARTIFACT}.zip" \
  "${ENDPOINT}/${BUCKET}/${OBJECT}"

echo "Released: ${ENDPOINT}/${BUCKET}/${OBJECT}"

# Enforce 10-release cap — delete oldest when bucket exceeds limit.
MAX_RELEASES=10
echo "Enforcing release cap (max ${MAX_RELEASES})..."
while true; do
  LISTING=$(/usr/bin/curl -sf -X GET \
    --aws-sigv4 "aws:amz:us-east-1:s3" \
    --user "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
    "${ENDPOINT}/${BUCKET}?list-type=2&prefix=plugin-scanner/")
  COUNT=$(echo "${LISTING}" | grep -o '<Key>' | wc -l | tr -d ' ')
  [ "${COUNT}" -le "${MAX_RELEASES}" ] && break
  OLDEST=$(echo "${LISTING}" | python3 -c "
import sys, re
xml = sys.stdin.read()
keys = re.findall(r'<Key>([^<]+)</Key>', xml)
dates = re.findall(r'<LastModified>([^<]+)</LastModified>', xml)
pairs = sorted(zip(dates, keys))
print(pairs[0][1] if pairs else '')
")
  echo "Deleting oldest release: ${OLDEST}"
  /usr/bin/curl -sf -X DELETE \
    --aws-sigv4 "aws:amz:us-east-1:s3" \
    --user "${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}" \
    "${ENDPOINT}/${BUCKET}/${OLDEST}"
done
