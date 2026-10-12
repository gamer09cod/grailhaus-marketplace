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

const gradleUserHome = process.platform === "win32" ? "C:\\g" : null;
if (gradleUserHome) {
  env.GRADLE_USER_HOME = gradleUserHome;
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

function stopAndroidDaemons() {
  const androidDir = path.join(appDir, "android");
  const gradleScript = process.platform === "win32" ? "gradlew.bat" : "gradlew";
  if (fs.existsSync(path.join(androidDir, gradleScript))) {
    console.log("- Stopping Gradle");
    const gradle = process.platform === "win32" ? "gradlew.bat --stop" : "./gradlew --stop";
    spawnSync(gradle, {
      cwd: androidDir,
      env,
      stdio: "inherit",
      shell: true,
    });
  }

  if (!gradleUserHome) {
    return;
  }

  // A previous build leaves Gradle and the Kotlin daemon holding dex files, so prebuild cannot delete android/.
  console.log("- Releasing Android file locks");
  spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `
$ErrorActionPreference = 'SilentlyContinue'
$gradleHome = [regex]::Escape($env:GRAILHAUS_GRADLE_USER_HOME)
Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" | Where-Object {
  $_.CommandLine -match 'org\\.gradle\\.launcher\\.daemon\\.bootstrap\\.GradleDaemon|org\\.jetbrains\\.kotlin\\.daemon\\.KotlinCompileDaemon' -and
  $_.CommandLine -match $gradleHome
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2
`,
    ],
    {
      env: { ...env, GRAILHAUS_GRADLE_USER_HOME: gradleUserHome },
      stdio: "inherit",
    },
  );
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

/** Phone release APK: arm64 only. Emulator/x86 libs roughly double the APK. */
function pinReleaseArchitectures() {
  const gradleProps = path.join(appDir, "android", "gradle.properties");
  if (!fs.existsSync(gradleProps)) {
    console.error(`Missing ${gradleProps} after prebuild.`);
    process.exit(1);
  }
  let text = fs.readFileSync(gradleProps, "utf8");
  if (/^reactNativeArchitectures=/m.test(text)) {
    text = text.replace(
      /^reactNativeArchitectures=.*$/m,
      "reactNativeArchitectures=arm64-v8a",
    );
  } else {
    text += "\nreactNativeArchitectures=arm64-v8a\n";
  }
  fs.writeFileSync(gradleProps, text);
  console.log("- Release native ABIs: arm64-v8a");
}

stopAndroidDaemons();
run("npx expo prebuild --platform android --no-install", appDir);
keepDevAndroidScript();
pinReleaseArchitectures();
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
