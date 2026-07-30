//// CryptoLandTile — Cardano (Aiken / Plutus V3)
////
//// Cardano is the genuine outlier: it is UTXO, not account-based, so "one owner
//// per tile" is not a mapping but a minting policy that permits exactly one
//// token per tile id to ever exist. The asset name IS the packed tile id, which
//// makes double-minting impossible at the ledger level rather than by a check.
////
//// CROSS-CHAIN INVARIANT:  token_id = (tx << 15) | ty,  tx, ty in [0, 16383]
//// Aiken has no shift operator, so this is (tx * 32768) + ty — identical
//// because ty < 2^15 means the OR never carries. Same reasoning as Cairo.

use aiken/collection/list
use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction}

const grid_max: Int = 16383

const coord_shift: Int = 32768

/// (tx << 15) | ty, expressed as multiply-add.
pub fn token_id_from_key(tx: Int, ty: Int) -> Int {
  expect tx >= 0 && tx <= grid_max
  expect ty >= 0 && ty <= grid_max
  tx * coord_shift + ty
}

pub fn key_from_token_id(token_id: Int) -> (Int, Int) {
  ( token_id / coord_shift, token_id % coord_shift )
}

pub type MintRedeemer {
  tx: Int,
  ty: Int,
}

validator tile(owner_vkh: ByteArray) {
  mint(redeemer: MintRedeemer, _policy_id: PolicyId, self: Transaction) {
    let MintRedeemer { tx, ty } = redeemer
    // Coordinates must be inside the Z14 grid.
    let in_range = tx >= 0 && tx <= grid_max && ty >= 0 && ty <= grid_max
    // Only the registry owner may mint a tile.
    let signed = list.has(self.extra_signatories, owner_vkh)
    in_range && signed
  }

  else(_) {
    fail
  }
}

test token_id_matches_other_chains() {
  token_id_from_key(0, 0) == 0 &&
  token_id_from_key(1, 0) == 32768 &&
  token_id_from_key(0, 1) == 1 &&
  token_id_from_key(100, 200) == 3277000 &&
  token_id_from_key(16383, 16383) == 536854527
}

test round_trip() {
  let (tx, ty) = key_from_token_id(536854527)
  tx == 16383 && ty == 16383
}
