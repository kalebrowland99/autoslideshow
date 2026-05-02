Freiburg Groceries Dataset (junk / indulgent classes)
=====================================================

Labely can load random 256×256 shelf crops from the Freiburg Groceries Dataset
for quick demos (no camera).

Source (paper + download):
  https://github.com/PhilJd/freiburg_groceries_dataset
  http://aisdatasets.informatik.uni-freiburg.de/freiburg_groceries_dataset/

Populate this folder once (downloads ~dataset tarball, extracts junk classes only):

  npm run cache:freiburg-junk

Requires: curl, tar (macOS / Linux). PNGs land under public/freiburg/<CLASS>/.

Git: *.png under public/freiburg are gitignored so the repo stays small; keep this README.
