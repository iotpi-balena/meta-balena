#!/bin/bash

set -x

CURL="curl -s"

TRANSLATION=${TRANSLATION:-"v6"}

. /balena-api.inc

DEBUG=0

__dlog() {
	if [ "${DEBUG}" = "1" ]; then
		>&2 echo "${1}"
	fi
}
