import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "app");
const apkPath = path.join(
  appDir,
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);

const hostedUrl = "https://zboczfalxtuspnodveer.supabase.co";
const hostedAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpib2N6ZmFseHR1c3Bub2R2ZWVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NDIxNTQsImV4cCI6MjEwNjQxODE1NH0.34S7VlR7qFBqiq-uRqcNSo4Jwn8vZpjcv4imk7HEEzk";

const env = {
  ...process.env,
  CI: "1",
  EXPO_NO_DOTENV: "1",
  EXPO_PUBLIC_SUPABASE_URL: hostedUrl,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: hostedAnonKey,
};

if (!String(env.NODE_OPTIONS ?? "").includes("--use-system-ca")) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, "--use-system-ca"].filter(Boolean).join(" ");
}

if (process.platform === "win32") {
  env.GRADLE_USER_HOME = "C:\\g";
}

function run(command, cwd) {
  const result = spawnSync(command, {
    cwd,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function useWindowsTrustStore() {
  if (process.platform !== "win32") {
    return;
  }
  const trustStore = path.join(process.env.TEMP, "grailhaus-jssecacerts.p12");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `
$ErrorActionPreference = 'Stop'
$trust = $env:GRAILHAUS_TRUSTSTORE
if (Test-Path $trust) { exit 0 }
$i = 0
foreach ($c in @(Get-ChildItem Cert:\\LocalMachine\\Root) + @(Get-ChildItem Cert:\\CurrentUser\\Root)) {
  $cer = Join-Path $env:TEMP ("grailhaus-cert-" + $i + ".cer")
  Export-Certificate -Cert $c -FilePath $cer -Type CERT | Out-Null
  & keytool -importcert -noprompt -alias ("winroot" + $i) -keystore $trust -storetype PKCS12 -storepass changeit -file $cer 2>&1 | Out-Null
  Remove-Item $cer -Force
  $i++
}
`,
    ],
    {
      env: { ...env, GRAILHAUS_TRUSTSTORE: trustStore },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  const option = `-Djavax.net.ssl.trustStore=${trustStore} -Djavax.net.ssl.trustStorePassword=changeit -Djavax.net.ssl.trustStoreType=PKCS12`;
  env.JAVA_TOOL_OPTIONS = [env.JAVA_TOOL_OPTIONS, option].filter(Boolean).join(" ");
}

function keepDevAndroidScript() {
  const pkgPath = path.join(appDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.scripts?.android === "expo start --android") {
    return;
  }
  pkg.scripts.android = "expo start --android";
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

run("npx expo prebuild --platform android --no-install", appDir);
keepDevAndroidScript();
useWindowsTrustStore();

const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(`${gradle} assembleRelease`, path.join(appDir, "android"));

if (!fs.existsSync(apkPath)) {
  console.error(`Release APK was not produced at ${apkPath}`);
  process.exit(1);
}

const listing = spawnSync("tar", ["-tf", apkPath], { encoding: "utf8" });
if (listing.status !== 0) {
  process.exit(listing.status ?? 1);
}
const bundleEntry = listing.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.endsWith("index.android.bundle"));

if (!bundleEntry) {
  console.error("Release APK has no embedded JavaScript bundle.");
  process.exit(1);
}

const extractedDir = fs.mkdtempSync(path.join(os.tmpdir(), "grailhaus-apk-"));
const extracted = spawnSync("tar", ["-xf", apkPath, "-C", extractedDir, bundleEntry], {
  stdio: "inherit",
});
if (extracted.status !== 0) {
  process.exit(extracted.status ?? 1);
}

const bundle = fs.readFileSync(path.join(extractedDir, bundleEntry));
const host = Buffer.from("https://zboczfalxtuspnodveer.supabase.co");
const local = Buffer.from("http://127.0.0.1");
const emulator = Buffer.from("http://10.0.2.2");
if (!bundle.includes(host) || bundle.includes(local) || bundle.includes(emulator)) {
  console.error("Release bundle is not pointed at the hosted Supabase project.");
  process.exit(1);
}

console.log(`APK ${apkPath}`);
