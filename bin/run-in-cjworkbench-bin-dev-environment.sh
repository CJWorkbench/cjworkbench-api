#!/bin/bash

cd "$(dirname "$0")"/..

DOCKER_BUILDKIT=1 docker build . --target=production --tag=cjworkbench_api:latest

docker run -it --rm \
  --network cjworkbench_dev \
  --name cjworkbench_api \
  --publish 8004:8080 \
  -e CJW_STORAGE_ENGINE=s3 \
  -e CJW_STORAGE_ENDPOINT="http://minio" \
  -e CJW_STORAGE_BUCKET=dev-datasets \
  -e AWS_ACCESS_KEY_ID=minio_access \
  -e AWS_SECRET_ACCESS_KEY=minio_secret \
  -e PGHOST=database \
  -e PGUSER=cjworkbench \
  -e PGPASSWORD=cjworkbench \
  -e PGDATABASE=cjworkbench \
  cjworkbench_api:latest
