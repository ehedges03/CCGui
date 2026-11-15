# CCGui

## Building

`make` from the root of the project generates the protobufs, then builds the backend (`bin/server`) and cc-tstl.

`make backend` or `make cc` builds just one of them.

## How to use the protobufs

Run `make gen` from the root of the project. Don't run `buf generate` on its own, the cc-tstl output needs the fix-up step in the Makefile.
