/ := $(dir $(MAKEFILE_LIST))

ifeq ($(OS), Windows_NT)
	PATH := $/node_modules/.bin;$(PATH)
else
	PATH := $/node_modules/.bin:$(PATH)
endif

test: build
	make -C test test
.PHONY: test

help: build
	node fddtsc --help
.PHONY: help

build: fddtsc.js
	-
.PHONY: build

fddtsc.js: fddtsc.ts
	tsc --noEmit
	esbuild $< --platform=node --format=esm --minify --outfile=$@

install:
	npm i
	cd test && npm i
.PHONY: install

publish: build
	npm publish --dry-run
.PHONY: publish

publish!: build
	npm publish --no-git-tag-version --access public
.PHONY: publish!
