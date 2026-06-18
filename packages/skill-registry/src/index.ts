/**
 * @auriga/skill-registry — interim, filesystem-backed implementation of the
 * SkillRegistry contract. A stand-in for the real Skill platform that the harness
 * consumes through the same interface (content-addressed + ed25519-signed).
 */
export { LocalSkillRegistry, openDevRegistry } from "./local-registry";
export { loadBundleFromDir, type SkillBundleInput, type SkillBundleFile } from "./bundle";
