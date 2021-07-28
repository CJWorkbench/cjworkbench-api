#!/bin/bash

cd "$(dirname "$0")"/..

COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker-compose run jest npm test -- --watchAll test "$@"
