// Release info. CI passes VERSION (the git tag) and COMMIT through the Docker build;
// local builds show "dev" so a version number always means a real release.
export default {
  version: process.env.VERSION || "dev",
  commit: (process.env.COMMIT || "").slice(0, 7),
};
