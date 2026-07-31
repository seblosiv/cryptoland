/**
 * Originate CryptoLandTile on Tezos Shadownet.
 * Ghostnet is retired — teztnets.com lists bakingnet / shadownet / ushuaianet,
 * and config.js already targets shadownet.
 */
import { TezosToolkit } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { readFileSync } from 'node:fs';

const RPC = 'https://rpc.shadownet.teztnets.com';
const seedHex = JSON.parse(readFileSync('../../.testnet/accounts.json', 'utf8')).tezos.seed;

// Taquito wants a b58 secret key. Newer @taquito/utils renamed b58cencode →
// b58Encode and prefix → PrefixV2, so the older snippets on the web do not work.
const { b58Encode, PrefixV2 } = await import('@taquito/utils');
const sk = b58Encode(Buffer.from(seedHex, 'hex'), PrefixV2.Ed25519Seed);

const Tezos = new TezosToolkit(RPC);
Tezos.setProvider({ signer: await InMemorySigner.fromSecretKey(sk) });

const pkh = await Tezos.signer.publicKeyHash();
console.log('  signer :', pkh);
console.log('  balance:', (await Tezos.tz.getBalance(pkh)).toNumber() / 1e6, 'tez');

const code = readFileSync('tile.tz', 'utf8');
const init = readFileSync('storage.tz', 'utf8');

console.log('  originating…');
const op = await Tezos.contract.originate({ code, init });
await op.confirmation(1);
console.log('  ✅ contract:', op.contractAddress);
console.log('     opHash  :', op.hash);
