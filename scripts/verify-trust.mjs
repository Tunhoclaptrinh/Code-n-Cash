/** Offline verification: no API, database writes, private keys or third-party dependencies. */
import { createHash, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
          .join(",")}}`
      : (JSON.stringify(value) ?? "null");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const same = (a, b) => canonical(a) === canonical(b);

function validProof(proof) {
  try {
    return (
      proof?.provider === "LOCAL_ED25519" &&
      digest(proof.publicKey) === proof.keyFingerprint &&
      verify(
        null,
        Buffer.from(canonical(proof.payload)),
        proof.publicKey,
        Buffer.from(proof.signature, "base64"),
      )
    );
  } catch {
    return false;
  }
}

export function verifyBundle(
  bundle,
  { fingerprints = [], document, records } = {},
) {
  if (bundle?.payload && bundle?.receipt) {
    const { payload, receipt } = bundle;
    const cryptoValid =
      validProof(receipt) &&
      receipt.payload.kind === "AUDIT_ANCHOR" &&
      same(receipt.payload.payload, payload);
    const manifestValid =
      payload.schemaVersion === 1 &&
      payload.algorithm === "SHA-256" &&
      digest(canonical(payload.manifest)) === payload.snapshotHash;
    const keyPinned = fingerprints.includes(receipt.keyFingerprint);
    let chainMatched = null,
      snapshotMatched = null;
    if (records) {
      const audit = [...(records.audit ?? [])].sort((a, b) => a.seq - b.seq);
      let previous = "0".repeat(64);
      chainMatched = audit.length >= payload.sequence;
      for (let i = 0; i < audit.length; i++) {
        const { hash, ...rest } = audit[i];
        if (
          rest.seq !== i + 1 ||
          rest.prevHash !== previous ||
          digest(canonical(rest)) !== hash
        )
          chainMatched = false;
        previous = hash;
      }
      chainMatched &&=
        audit[0]?.hash === payload.systemId &&
        audit[payload.sequence - 1]?.hash === payload.headHash;
      snapshotMatched = Object.entries(payload.manifest).every(
        ([name, entry]) => {
          const rows = [...(records[name] ?? [])].sort((a, b) =>
            a.id.localeCompare(b.id),
          );
          return (
            rows.length === entry.count &&
            digest(canonical(rows)) === entry.sha256
          );
        },
      );
    }
    const valid = cryptoValid && manifestValid && chainMatched !== false;
    return {
      kind: "AUDIT_ANCHOR",
      valid,
      cryptoValid,
      manifestValid,
      keyPinned,
      chainMatched,
      snapshotMatched,
      timestampTrusted: false,
      result: !valid
        ? "INVALID"
        : keyPinned
          ? "VERIFIED_LOCAL_KEY"
          : "CRYPTO_VALID_UNTRUSTED_KEY",
    };
  }
  if (Array.isArray(bundle?.proofs)) {
    const proofs = bundle.proofs;
    const cryptoValid =
      proofs.length > 0 &&
      proofs.every(
        (proof) =>
          validProof(proof) &&
          proof.payload.kind === "CONTRACT_SIGNATURE" &&
          proof.payload.contractCode === bundle.contractCode,
      );
    const chainValid = proofs.every(
      (proof, index) =>
        proof.payload.previousSignatureHash ===
        (index ? digest(canonical(proofs[index - 1])) : null),
    );
    const keyPinned =
      proofs.length > 0 &&
      proofs.every((proof) => fingerprints.includes(proof.keyFingerprint));
    const documentMatched =
      document === undefined
        ? null
        : proofs.every(
            (proof) =>
              proof.payload.basis === "DOCUMENT_BYTES" &&
              proof.payload.documentDigest === digest(document),
          );
    const valid = cryptoValid && chainValid && documentMatched !== false;
    return {
      kind: "CONTRACT_SIGNATURE",
      valid,
      cryptoValid,
      chainValid,
      keyPinned,
      documentMatched,
      certificateTrusted: false,
      proofCount: proofs.length,
      result: !valid
        ? "INVALID"
        : keyPinned
          ? "VERIFIED_LOCAL_KEY"
          : "CRYPTO_VALID_UNTRUSTED_KEY",
    };
  }
  throw new Error("INVALID_BUNDLE");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    if (!args[0])
      throw new Error(
        "Usage: node scripts/verify-trust.mjs bundle.json [--fingerprint SHA256] [--document original.pdf] [--records records.json]",
      );
    const options = { fingerprints: [] };
    for (let i = 1; i < args.length; i += 2) {
      if (!args[i + 1]) throw new Error("MISSING_ARGUMENT");
      if (args[i] === "--fingerprint") options.fingerprints.push(args[i + 1]);
      else if (args[i] === "--document")
        options.document = await readFile(args[i + 1]);
      else if (args[i] === "--records")
        options.records = JSON.parse(await readFile(args[i + 1], "utf8"));
      else throw new Error("UNKNOWN_ARGUMENT");
    }
    const result = verifyBundle(
      JSON.parse(await readFile(args[0], "utf8")),
      options,
    );
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
