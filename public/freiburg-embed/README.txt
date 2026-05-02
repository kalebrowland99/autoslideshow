Freiburg Groceries — production embed (1 image per class)
=========================================================

These 25 PNGs are a tiny subset of the Freiburg Groceries Dataset so
`/api/labely/freiburg-random` works on hosted deploys without running the
full local cache script.

Full dataset (5000 images): https://github.com/PhilJd/freiburg_groceries_dataset

For more variety locally, run `npm run cache:freiburg-junk` — images land in
`public/freiburg/` (gitignored). The API prefers that folder when present and
falls back to this embed when a class has no full-cache files.
