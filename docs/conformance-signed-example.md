# Worked example — signing and verifying a Conformance Result

This page walks through the end-to-end signing flow defined in
[ACCORD-009 §signed-result](../specs/ACCORD-009-conformance.md). It produces
a real, working artifact (`docs/examples/conformance-result.signed.json`)
that anyone can verify locally.

The flow has four steps:

```text
1. keygen   — generate an ed25519 keypair
2. run      — capture a ConformanceResult against your implementation
3. sign     — bind the result to your public key
4. verify   — independently confirm the signature over the canonical bytes
```

The signing scheme is the same one used everywhere in the protocol:
`signature = ed25519_sign(privateKey, BLAKE2b-256(canonical_json(result_without_signature)))`.

## 1. Generate a keypair

```bash
$ npx accord-conformance keygen
ed25519 keypair (KEEP THE PRIVATE KEY SECRET):

  private:  0xb7eb3637501a5310fcd819c572d40b093736c5ec7b4a51b838637e5427df5989
  public:   0x0b47a2c8bea912c748c5f43d92b538deed5e511fe46537c939824e273677489e
```

The keys above are the ones used to sign the bundled example. They are
**published intentionally** as a documentation artifact — do not reuse them
for anything that needs to be trustworthy.

## 2. Capture a ConformanceResult

Run the suite against your implementation. From this monorepo's root:

```bash
$ npx accord-conformance run --levels L0,L1,L2,L3,L4 --json > result.json
```

For probing a remote implementation, swap in `--target`:

```bash
$ npx accord-conformance run --levels L1 --target https://provider.example/ --json > result.json
$ npx accord-conformance run --levels L1 --target stdio:./mcp-server.mjs --json > result.json
```

The result JSON has the shape defined in ACCORD-009. The relevant
top-level fields are `target`, `started_at`, `finished_at`, an array of
per-level results, and `achieved_level`.

## 3. Sign the result

```bash
$ npx accord-conformance sign \
    --key 0xb7eb3637501a5310fcd819c572d40b093736c5ec7b4a51b838637e5427df5989 \
    --signer "accord-protocol/example" \
    -o result.signed.json \
    result.json
✓ signed → result.signed.json
```

The CLI stores the private key only long enough to compute the signature.
Pass `--key-file` instead of `--key` if you'd rather not put the key on
the command line.

The `--signer` field is a free-form label. Conformance consumers should
treat it as advisory metadata; the real source of trust is `public_key`.

## 4. Verify

```bash
$ npx accord-conformance verify \
    --expected-key 0x0b47a2c8bea912c748c5f43d92b538deed5e511fe46537c939824e273677489e \
    result.signed.json
✓ valid ed25519 signature
  public_key: 0x0b47a2c8bea912c748c5f43d92b538deed5e511fe46537c939824e273677489e
  signer:     accord-protocol/example
```

`--expected-key` is optional. If you omit it, the CLI verifies the
signature against the public key embedded in the file. **Always pin the
key when you care about authenticity** — without `--expected-key`, an
attacker who swapped both signature and embedded public key would still
get a "valid" verdict.

## The bundled example

[`docs/examples/conformance-result.signed.json`](./examples/conformance-result.signed.json)
is the frozen output of this flow run against the monorepo itself.

You can verify it directly:

```bash
$ npx accord-conformance verify \
    --expected-key 0x0b47a2c8bea912c748c5f43d92b538deed5e511fe46537c939824e273677489e \
    docs/examples/conformance-result.signed.json
```

The signature block at the bottom of that file looks like:

```json
{
  "signature": {
    "scheme": "ed25519",
    "public_key": "0x0b47a2c8bea912c748c5f43d92b538deed5e511fe46537c939824e273677489e",
    "signature": "0x8d4d3e9ef…71a70c",
    "signed_at": "2026-05-08T14:48:11Z",
    "signer": "accord-protocol/example"
  }
}
```

## Submitting a signed result with a registry record

If you're submitting a record to [`registry/`](../registry/), the signed
JSON is what goes alongside your `provider_profile.v0` /
`verifier_profile.v0` PR. Maintainers verify it against the embedded
public key and against the rest of the canonical fields before merge.
