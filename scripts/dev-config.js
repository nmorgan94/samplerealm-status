#!/usr/bin/env node
// Prepares status-page/ for local dev. Used by scripts/dev.sh.
//
//   node scripts/dev-config.js          one-off: link assets, generate config
//   node scripts/dev-config.js --watch  regenerate on changes to .upptimerc.yml
//                                       or assets/ (no initial run)
//
// Generating writes status-page/src/data/config.json. `sapper dev` watches src/,
// so any regeneration triggers a rebuild and a live reload in the browser. That is
// how both config edits and CSS/asset edits get hot reloaded.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const statusPage = path.join(root, "status-page");
const assets = path.join(root, "assets");

const staticDir = path.join(statusPage, "static");
const assetsRel = path.join("..", "..", "assets");
const port = process.env.PORT || 3000;

// Mirror the deploy, which copies assets/* to the site root.
function linkAssets() {
  // Remove links left behind by assets that were deleted or renamed.
  for (const name of fs.readdirSync(staticDir)) {
    const link = path.join(staticDir, name);
    if (
      fs.lstatSync(link).isSymbolicLink() &&
      fs.readlinkSync(link).startsWith(assetsRel + path.sep) &&
      !fs.existsSync(link)
    ) {
      fs.unlinkSync(link);
    }
  }

  for (const name of fs.readdirSync(assets)) {
    const link = path.join(staticDir, name);
    const target = path.join(assetsRel, name);
    let existing;
    try {
      existing = fs.lstatSync(link);
    } catch {}
    if (existing && !existing.isSymbolicLink()) {
      // Never touch Upptime's own files. Note the deploy's `cp` WOULD overwrite it.
      console.warn(
        `[dev-config] assets/${name} clashes with Upptime's static/${name}; ` +
          "dev keeps Upptime's, but the deploy will overwrite it with yours"
      );
      continue;
    }
    if (existing) {
      if (fs.readlinkSync(link) === target) continue;
      fs.unlinkSync(link);
    }
    fs.symlinkSync(target, link);
  }
}

// pre-process sets path to https://<cname>, which every link is built from, and
// themeUrl is absolute too. Swap the live origin for localhost everywhere so
// navigation and the theme stay on the local site.
function generate() {
  linkAssets();
  execSync("npm run --silent pre-process", { cwd: statusPage, stdio: "inherit" });
  const file = path.join(statusPage, "src", "data", "config.json");
  const json = fs.readFileSync(file, "utf8");
  const { cname } = JSON.parse(json)["status-website"];
  // must match dev.sh's sapper --port
  fs.writeFileSync(file, json.replaceAll(`https://${cname}`, `http://localhost:${port}`));
}

if (!process.argv.includes("--watch")) {
  generate();
} else {
  // Config edits need a full regenerate. Asset edits only need links refreshed and
  // a touch of config.json to make sapper reload (skips npm + ts-node startup).
  const configFile = path.join(statusPage, "src", "data", "config.json");
  const reloadAssets = () => {
    linkAssets();
    const now = new Date();
    fs.utimesSync(configFile, now, now);
  };
  let timer;
  let fullRegen = false;
  const schedule = (what, full) => {
    fullRegen ||= full;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const full = fullRegen;
      fullRegen = false;
      try {
        full ? generate() : reloadAssets();
        console.log(`[dev-config] ${what} changed, reloading`);
      } catch (err) {
        console.error(`[dev-config] reload failed: ${err.message}`);
      }
    }, 200);
  };
  // Watch directories, not files: editors often save by replacing the file,
  // which silently ends a watch on the file itself.
  fs.watch(root, (_, name) => name === ".upptimerc.yml" && schedule(name, true));
  fs.watch(assets, { recursive: true }, (_, name) => schedule(`assets/${name}`, false));
  console.log("[dev-config] watching .upptimerc.yml and assets/");
}
