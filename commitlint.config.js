/** Conventional Commits (matches the repo's existing history). */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow detailed multi-line commit bodies/footers.
    "body-max-line-length": [0, "always", Infinity],
    "footer-max-line-length": [0, "always", Infinity],
  },
};
