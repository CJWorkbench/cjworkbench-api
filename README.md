# cjworkbench-api

Workbench API. Handles these endpoints:

* `/v1/datasets/{workflow_id}-{workflow_slug}/datapackage.json`
* `/v1/datasets/{workflow_id}-{workflow_slug}/r{revision}/datapackage.json`
* `/v1/datasets/{workflow_id}-{workflow_slug}/r{revision}/README.md`
* `/v1/datasets/{workflow_id}-{workflow_slug}/r{revision}/{table}_{csv|json|parquet}.{csv|json|parquet}`

# Developing

We're gung-ho on [Docker](https://www.docker.com/). This server runs on
[NodeJS](https://nodejs.org/), but you needn't install Node. Just use Docker.

## Adding dependencies

We don't respect your `node-modules/` directory; our tooling leaves it empty.
Each time you want to modify deps, you must rebuild `package-lock.json` from
scratch:

1. Edit dependencies in `package.json` (optionally, use `npm install`)
2. `rm -rf node_modules/` if the directory exists.
3. Run `bin/refresh-package-lock.sh`. All deps will be re-found from scratch.

You never need to `npm update`. `bin/refresh-package-lock.sh` updates all
transient dependencies.

## Testing

Run `bin/test`. It'll run Jest atop a mock database and mock storage
systems.

If you modify dependencies, Ctrl+C and restart.

### Adding a test case

1. Choose a unique test-case ID and a slug: e.g., `123-test-wrong-slug`.
2. Add files to `test/data/wf-123/datapackage.json`. See other files for
   examples.
3. Optionally (depending on what you're testing), add
   `test/data/wf-123/r1/datapackage.json` and `test/data/wf-123/r1/data/*`.
4. Add SQL to `test/sql/123-test-wrong-slug.sql`. See other files for
   examples.
5. Add test to `test/*.ts`. Be sure the test name incluess test-case ID:
   e.g., `test('123. something something something', async () => {...})`.

Being consistent about test IDs lets us easily detect unused files so we
can delete them.

# Running

For developing: use [cjworkbench](https://github.com/CJWorkbench/cjworkbench)'s
`bin/dev start`.

If you want to test this dev server before committing, in your cjworkbench
development environment, disable the cjworkbench-included `api` and run this
one instead.

```bash
bin/dev start --scale api=0
../cjworkbench-api/bin/run-in-cjworkbench-bin/dev/environment.sh
```

## Environment variables

When deploying, consider all these:

* `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`: database parameters
* `CJW_STORAGE_ENGINE`: `gcs` or `s3`
* `CJW_STORAGE_ENDPOINT`: e.g., `https://s3.us-east-1.amazonaws.com`
* `CJW_STORAGE_BUCKET`: something like `datasets.workbenchdata.com`
* `GOOGLE_APPLICATION_CREDENTIALS`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  etc.: we rely on S3 and Google Storage libraries to read authentication info
  from your environment. They can use these environment variables; they can use
  your Kubernetes pod's metadata service; and so on.

## Health checks

`GET /healthz` should return `200 OK` with `{"database":"ok","storage":"ok"}`.
