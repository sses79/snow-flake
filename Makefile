SHELL := /bin/bash
DBT ?= .venv/bin/dbt

.NOTPARALLEL: demo-build

.PHONY: generate test demo-reset demo-load demo-load-m1 demo-load-m2 demo-build dbt-build dbt-freshness verify-milestone-2 verify-milestone-4 verify-milestone-5 aws-init aws-plan aws-apply configure-snowpipe upload-milestone-6 recover-milestone-6 verify-milestone-6 dashboard-dev dashboard-test dashboard-build

generate:
	node apps/generator/src/cli.ts

test:
	npm test

demo-reset:
	./scripts/reset-demo.sh

demo-load-m1: generate
	./scripts/load-batch.sh

demo-load-m2: generate
	./scripts/load-milestone-2.sh

demo-load: demo-load-m1 demo-load-m2

dbt-build:
	DBT=$(DBT) ./scripts/dbt-build.sh

dbt-freshness:
	DBT=$(DBT) ./scripts/dbt-command.sh source freshness

demo-build: test demo-load dbt-build

verify-milestone-2: test
	./scripts/verify-milestone-2.sh

dashboard-dev:
	@test -f .env || (echo "Missing .env; copy .env.example and configure Snowflake." >&2; exit 1)
	set -a; source .env; set +a; pnpm --dir apps/dashboard dev

dashboard-test:
	pnpm --dir apps/dashboard test

dashboard-build:
	pnpm --dir apps/dashboard build

verify-milestone-4: test dashboard-build dbt-build

verify-milestone-5:
	./scripts/verify-milestone-5.sh

aws-init:
	terraform -chdir=infra/aws init

aws-plan:
	terraform -chdir=infra/aws plan

aws-apply:
	terraform -chdir=infra/aws apply

configure-snowpipe:
	./scripts/configure-snowpipe.sh

upload-milestone-6: generate
	./scripts/upload-milestone-6.sh

recover-milestone-6:
	./scripts/recover-from-s3.sh --confirm-truncate-raw

verify-milestone-6:
	./scripts/verify-milestone-6.sh
