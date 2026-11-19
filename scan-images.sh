#!/usr/bin/env bash
# @license
# Copyright (c) rljson
#
# Use of this source code is governed by terms that can be
# found in the LICENSE file in the root of this package.

# Scans images of the registry crcars with Trivy and writes one line per
# image into a Markdown report. Findings of severity high or critical that
# have a fix fail the scan, unless .trivyignore accepts them until their
# date exp. Needs Docker and an Azure sign-in that may pull from crcars.
#
# Usage: scan-images.sh <report.md> <image>...
# Exit:  0 when every image passes, 1 otherwise

set -uo pipefail

report=$1
shift
registry=${REGISTRY:-crcars}
trivy_image=${TRIVY_IMAGE:-aquasec/trivy:0.58.1}
severity=${TRIVY_SEVERITY:-HIGH,CRITICAL}
ignore_file=$(cd "$(dirname "$0")" && pwd)/.trivyignore

: > "$report"
az acr login --name "$registry" || exit 1
failed=0
for image in "$@"; do
  if ! docker pull --quiet "$image" > /dev/null; then
    failed=1
    echo "- ❌ \`${image}\`: could not be pulled" >> "$report"
    continue
  fi
  if docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
      -v "${ignore_file}:/trivyignore:ro" \
      "$trivy_image" image --quiet --exit-code 1 --ignore-unfixed \
      --ignorefile /trivyignore --severity "$severity" --format table \
      "$image"; then
    echo "- ✅ \`${image}\`" >> "$report"
  else
    failed=1
    echo "- ❌ \`${image}\`: findings ${severity} with a fix" >> "$report"
  fi
done
exit $failed
