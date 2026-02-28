/**
 * Prebuild script: decodes GOOGLE_SA_KEY_BASE64 and writes it as a JSON file
 * that gets bundled into the Next.js standalone output.
 *
 * This avoids passing the large (~3KB) base64 key as a Lambda runtime env var,
 * which would exceed AWS Lambda's 4KB env var limit on Netlify.
 *
 * Usage: node scripts/write-google-credentials.js
 * (runs automatically as part of the build command)
 */
const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'google-sa-credentials.json');

const base64Key = process.env.GOOGLE_SA_KEY_BASE64;
if (base64Key) {
  const json = Buffer.from(base64Key, 'base64').toString('utf-8');
  fs.writeFileSync(OUTPUT_PATH, json, { mode: 0o600 });
  console.log(`✓ Wrote Google SA credentials to ${OUTPUT_PATH}`);
} else {
  // Local dev — ADC handles auth, no file needed
  // Clean up stale file if it exists
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.unlinkSync(OUTPUT_PATH);
  }
  console.log('⊘ GOOGLE_SA_KEY_BASE64 not set, skipping credentials file (using ADC)');
}
