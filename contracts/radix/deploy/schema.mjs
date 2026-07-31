/**
 * Extract a Scrypto package definition (.rpd) WITHOUT `scrypto build`.
 *
 * scrypto build refuses to pass --allow-undefined to the linker, so it cannot
 * compile this package at all. But the .rpd is not magic: it is the SBOR blob
 * returned by the wasm's own `<Blueprint>_schema` export. Instantiate the wasm
 * with the 11 Radix Engine host functions stubbed — the schema export returns
 * static data and calls none of them — then read the returned buffer.
 *
 * Scrypto returns a (ptr,len) packed into an i64: high 32 bits = ptr.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const wasmPath = process.argv[2];
const out = process.argv[3];
const bytes = readFileSync(wasmPath);

let memory;
const die = (n) => () => { throw new Error(`host fn ${n} called unexpectedly`); };
const env = {};
for (const n of ['object_new','object_call','blueprint_call','actor_open_field',
                 'field_entry_read','object_globalize','field_entry_close',
                 'field_entry_write','actor_get_package_address','sys_panic',
                 'buffer_consume']) env[n] = die(n);

// buffer_consume(id, ptr) copies a host buffer into wasm memory. The schema
// export allocates its own, so this should stay unused — but keep it harmless.
env.buffer_consume = () => 0;
env.sys_panic = (ptr, len) => {
  const m = new Uint8Array(memory.buffer, ptr, len);
  throw new Error('wasm panic: ' + Buffer.from(m).toString());
};

const { instance } = await WebAssembly.instantiate(bytes, { env });
memory = instance.exports.memory;

const name = Object.keys(instance.exports).find((k) => k.endsWith('_schema'));
if (!name) throw new Error('no *_schema export');
console.log('  calling', name);

const packed = instance.exports[name]();
const big = BigInt.asUintN(64, BigInt(packed));
const ptr = Number(big >> 32n);
const len = Number(big & 0xffffffffn);
console.log(`  returned ptr=${ptr} len=${len}`);

const blob = Buffer.from(new Uint8Array(memory.buffer, ptr, len));
writeFileSync(out, blob);
console.log(`  wrote ${out} — ${blob.length} bytes, SBOR prefix 0x${blob[0].toString(16)}`);
