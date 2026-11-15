.PHONY: all gen backend cc format format-check

# Sequential on purpose: `make -j` would otherwise build before gen finishes.
all:
	$(MAKE) gen
	$(MAKE) backend cc

# ts-proto onlyTypes leaves requestType/responseType pointing at values it
# never generates; the sed replaces them with typed placeholders so cc-tstl compiles.
gen:
	go run github.com/bufbuild/buf/cmd/buf@v1.47.2 generate
	find cc-tstl/src/gen -name '*.ts' -exec sed -i -E 's/(request|response)Type: ([A-Za-z0-9_]+) as typeof \2,/\1Type: undefined as unknown as \2,/' {} +

backend:
	cd backend && go build -o ../bin/server ./cmd/server

cc:
	cd cc-tstl && yarn build

# gofmt skips backend/gen (generated) and backend/vendor (third-party).
format:
	cd cc-tstl && yarn format
	cd frontend && yarn format
	cd backend && gofmt -w cmd internal
