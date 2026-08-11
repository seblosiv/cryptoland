/**
 * Publish the Scrypto package to Stokenet WITHOUT `scrypto build`.
 *
 * scrypto build cannot compile this package: it strips the
 * `--allow-undefined` the linker needs for the Radix Engine host imports. So
 * the wasm comes from plain `cargo build` with that flag, and the package
 * definition comes from executing the wasm's own `_schema` export (schema.mjs).
 *
 * The manifest is built as TEXT because the definition is raw SBOR — a value,
 * not bytes — and the text form takes it as a blob the engine decodes itself.
 */
import {
  PrivateKey, NetworkId, RadixEngineToolkit, TransactionBuilder,
  generateRandomNonce, hash, ManifestSborStringRepresentation,
} from '@radixdlt/radix-engine-toolkit';
import { readFileSync } from 'node:fs';

const GATEWAY = 'https://mainnet.radixdlt.com';
// Mainnet. Stokenet is kept in the comment because the four workarounds below
// were discovered there and apply identically: scrypto build cannot compile the
// package (it strips --allow-undefined), the .rpd comes from executing the
// wasm's own schema export, the definition must be inlined as a manifest value,
// and 108 LLVM memory.copy ops had to be lowered with binaryen.
const NET = NetworkId.Mainnet;

const seed = Buffer.from(JSON.parse(readFileSync('../../.testnet/radix.json', 'utf8')).seed, 'hex');
const notary = new PrivateKey.Ed25519(new Uint8Array(seed));
const account = (await RadixEngineToolkit.Derive.virtualAccountAddressFromPublicKey(
  notary.publicKey(), NET)).toString();

const wasm = readFileSync('cryptoland_tile.wasm');
const rpd = readFileSync('cryptoland_tile.rpd');
// Radix uses blake2b-256. Node's crypto only ships blake2b512, and truncating
// that is a DIFFERENT hash — the first attempt was rejected for exactly that.
const blake = (b) => Buffer.from(hash(new Uint8Array(b))).toString('hex');
const wasmHash = blake(wasm);
const rpdHash = blake(rpd);
console.log(`  account ${account}`);
console.log(`  wasm ${wasm.length}b (${wasmHash.slice(0, 16)}…)  rpd ${rpd.length}b (${rpdHash.slice(0, 16)}…)`);

const known = await RadixEngineToolkit.Utils.knownAddresses(NET);
const pkgPkg = known.packageAddresses.packagePackage;

// The definition is an SBOR VALUE, not bytes: passing it as a Blob is rejected
// with "expected_type: Tuple, found: Array". Scrypto SBOR (prefix 0x5c) and
// Manifest SBOR (0x4d) are the same value with a different prefix, so swap it
// and render the value as manifest text to inline.
const blueprintInit = await RadixEngineToolkit.ManifestSbor.decodeToString(
  new Uint8Array([0x4d, ...rpd.slice(1)]), NET,
  ManifestSborStringRepresentation.ManifestString,
);

// What the schema export returns is a BlueprintDefinitionInit (7 fields), NOT a
// PackageDefinition. PackageDefinition is a single field wrapping a
// Map<String, BlueprintDefinitionInit> — the engine says so exactly:
// "expected_field_count: 1, found: 7". Wrap it under the blueprint name.
const BLUEPRINT = 'CryptoLandTile';
const defManifest = `Tuple(Map<String, Tuple>("${BLUEPRINT}" => ${blueprintInit}))`;

const text = `
CALL_METHOD Address("${account}") "lock_fee" Decimal("500");
CALL_FUNCTION
    Address("${pkgPkg}")
    "Package"
    "publish_wasm_advanced"
    Enum<0u8>()
    ${defManifest}
    Blob("${wasmHash}")
    Map<String, Tuple>()
    Enum<0u8>()
;
`;

const instructions = await RadixEngineToolkit.Instructions.convert(
  { kind: 'String', value: text }, NET, 'Parsed',
);
const manifest = { instructions, blobs: [new Uint8Array(wasm)] };

const status = await fetch(`${GATEWAY}/status/gateway-status`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
}).then((r) => r.json());
const epoch = status.ledger_state.epoch;

const tx = await TransactionBuilder.new().then((b) =>
  b.header({
    networkId: NET, startEpochInclusive: epoch, endEpochExclusive: epoch + 10,
    nonce: generateRandomNonce(), notaryPublicKey: notary.publicKey(),
    notaryIsSignatory: true, tipPercentage: 0,
  }).manifest(manifest).notarize(notary));

const compiled = await RadixEngineToolkit.NotarizedTransaction.compile(tx);
const res = await fetch(`${GATEWAY}/transaction/submit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notarized_transaction_hex: Buffer.from(compiled).toString('hex') }),
}).then((r) => r.json());
console.log('  submit:', JSON.stringify(res).slice(0, 140));
const id = await RadixEngineToolkit.NotarizedTransaction.intentHash(tx);
console.log('  intent:', id.id);
