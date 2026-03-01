#!/bin/sh

set -e

help() {
	printf 'Usage: %s REPO PATH URL\n' "$0"
	printf '\n'
	printf 'Update latest charts from REPO to PATH for being served at URL\n'
}

if [ $# -ne 3 ]; then
	help >&2
	exit 1
fi

REPO="$1"
OUTPUT="$2"
URL="$3"

mkdir -p -- "$OUTPUT"

INDEX=$(wget -q -O - -- "$REPO/index.yaml")
TEMPDIR=$(mktemp -p "$OUTPUT" -d)

IFS='
'

for i in $(echo "$INDEX" | yq '.entries.[].[0].urls.[0]' -r); do
	FILENAME=$(basename "$i")
	if [ -f "$OUTPUT/index.yaml" ] && [ -f "$OUTPUT/$FILENAME" ]; then
		printf '%s already exists, skipping\n' "$FILENAME"
		continue
	fi
	printf 'Downloading %s\n' "$FILENAME"
	wget -q -O "$TEMPDIR/$FILENAME" -- "$i"
done

if [ -f "$PATH/index.yaml" ]; then
	helm repo index --url "$URL" --json --merge "$OUTPUT/index.yaml" -- "$TEMPDIR"
else
	helm repo index --url "$URL" --json -- "$TEMPDIR"
fi

mv "$TEMPDIR"/* "$OUTPUT"
rmdir "$TEMPDIR"
