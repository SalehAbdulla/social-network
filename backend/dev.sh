#!/bin/sh
set -eu

cd -- "$(dirname -- "$0")"
export DEV_DUMMY_USER=true
go run ./cmd/seed -demo
exec go run ./cmd
