const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appName = "Maria Story Planner";
const bundleDir = path.join(root, `${appName}.app`);
const contentsDir = path.join(bundleDir, "Contents");
const macosDir = path.join(contentsDir, "MacOS");
const executablePath = path.join(macosDir, appName);
const plistPath = path.join(contentsDir, "Info.plist");

fs.mkdirSync(macosDir, { recursive: true });

const executable = `#!/bin/zsh
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
exec /bin/bash "$REPO_DIR/scripts/run-local-app.sh"
`;

fs.writeFileSync(executablePath, executable, { mode: 0o755 });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>ko</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleExecutable</key>
  <string>${appName}</string>
  <key>CFBundleIdentifier</key>
  <string>local.maria-story-planner.app</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;

fs.writeFileSync(plistPath, plist);

console.log(`Created ${bundleDir}`);
console.log("Double-click it in Finder to start the local app.");
