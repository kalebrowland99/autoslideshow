Freiburg Groceries Dataset (all 25 product classes)
===================================================

Labely can load random 256×256 shelf crops from the Freiburg Groceries Dataset
for quick demos (no camera). Pick a category in the UI or use “Any”.

Source (paper + download):
  https://github.com/PhilJd/freiburg_groceries_dataset
  http://aisdatasets.informatik.uni-freiburg.de/freiburg_groceries_dataset/

Populate this folder once (downloads the tarball, extracts every class folder):

  npm run cache:freiburg-junk

Requires: curl, tar (macOS / Linux). PNGs land under public/freiburg/<CLASS>/.

Git: *.png under public/freiburg are gitignored so the repo stays small; keep this README.
