#!/bin/bash

set -e

cd "$(dirname "$0")"/..

DOCKER_BUILDKIT=1 docker build . --target=pre-package-lock
docker run --rm \
  "$(DOCKER_BUILDKIT=1 docker build -q . --target=pre-package-lock)" \
  sh -c 'npm install >/dev/null && cat package-lock.json' \
  > package-lock.json
