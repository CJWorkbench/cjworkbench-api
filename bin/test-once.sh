#!/bin/bash

cd "$(dirname "$0")"/..

docker-compose down  # database and fake-gcs-server read data during startup
COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose build
docker-compose run jest npm test -- "$@"
docker-compose down  # database and fake-gcs-server read data during startup
