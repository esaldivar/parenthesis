// Runs git from a fixed install location instead of looking it up on PATH (SonarQube S4036), so a writable directory
// earlier on PATH can't swap in another program.

import { existsSync } from "node:fs";

export const GIT_LOCATIONS = {
  win32: ["C:\\Program Files\\Git\\cmd\\git.exe", "C:\\Program Files\\Git\\bin\\git.exe"],
  default: ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"],
};

/** The absolute path of git for this platform. Throws when it isn't in any of the fixed locations. */
export function gitBinary(platform = process.platform, exists = existsSync) {
  const locations = GIT_LOCATIONS[platform] ?? GIT_LOCATIONS.default;
  const found = locations.find((location) => exists(location));
  if (!found) throw new Error(`git wasn't found in ${locations.join(", ")}.`);
  return found;
}
