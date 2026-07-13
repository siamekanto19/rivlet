// Generate the production Ed25519 certificate-signing keypair.
//
//   node scripts/keygen.mjs
//
// - PRIVATE (pkcs8, base64)  -> Worker secret:  wrangler secret put CERT_SIGNING_KEY
// - PUBLIC  (raw, base64)    -> desktop client:  productionPublicKeyB64 in
//                               backend/license/keys.go (kid "grabify-prod-1")
//
// The private key must ONLY ever exist as a Cloudflare secret. Do not commit it.

const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);

const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

console.log("# Grabify production certificate key (Ed25519)");
console.log("CERT_SIGNING_KEY (pkcs8, base64) -> wrangler secret put CERT_SIGNING_KEY:");
console.log(b64(pkcs8));
console.log();
console.log("PUBLIC (raw, base64) -> backend/license/keys.go productionPublicKeyB64:");
console.log(b64(raw));
