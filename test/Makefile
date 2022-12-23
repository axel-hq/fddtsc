/ := $(dir $(MAKEFILE_LIST))

ifeq ($(OS), Windows_NT)
	PATH := $/node_modules/.bin;$(PATH)
	rmrf := rd /s /q
else
	PATH := $/node_modules/.bin:$(PATH)
	rmrf := rm -rf
endif

test: clean dts
	ava $@

clean:
	-$(rm) bin

dts:
	fddtsc --outDir ban -p tscongif.jso --declarationDir bin --project tsconfig.json
