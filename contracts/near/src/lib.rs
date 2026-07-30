//! CryptoLandTile — NEAR (Rust, NEP-171)
//!
//! CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
//! Must match evm.js, CryptoLandTile.sol, and the Cairo/Aiken/PyTeal/Move versions.

use near_sdk::store::IterableMap;
use near_sdk::{env, near, AccountId, PanicOnDefault};

const GRID_MAX: u64 = 16383;
const COORD_SHIFT: u64 = 15;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    base_uri: String,
    tiles: IterableMap<u64, AccountId>,
    total: u64,
}

/// (tx << 15) | ty — identical to every other chain.
pub fn token_id_from_key(tx: u64, ty: u64) -> u64 {
    assert!(tx <= GRID_MAX && ty <= GRID_MAX, "coords out of range");
    (tx << COORD_SHIFT) | ty
}

pub fn key_from_token_id(token_id: u64) -> (u64, u64) {
    (token_id >> COORD_SHIFT, token_id & 0x7FFF)
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, base_uri: String) -> Self {
        Self { owner, base_uri, tiles: IterableMap::new(b"t"), total: 0 }
    }

    pub fn token_id(&self, tx: u64, ty: u64) -> u64 { token_id_from_key(tx, ty) }

    pub fn mint_tile(&mut self, receiver_id: AccountId, tx: u64, ty: u64) -> u64 {
        assert_eq!(env::predecessor_account_id(), self.owner, "not owner");
        let id = token_id_from_key(tx, ty);
        assert!(self.tiles.get(&id).is_none(), "tile already claimed");
        self.tiles.insert(id, receiver_id);
        self.total += 1;
        id
    }

    pub fn tile_owner(&self, tx: u64, ty: u64) -> Option<AccountId> {
        self.tiles.get(&token_id_from_key(tx, ty)).cloned()
    }

    pub fn total_minted(&self) -> u64 { self.total }
    pub fn base_uri(&self) -> String { self.base_uri.clone() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encoding_matches_other_chains() {
        assert_eq!(token_id_from_key(0, 0), 0);
        assert_eq!(token_id_from_key(1, 0), 32768);
        assert_eq!(token_id_from_key(0, 1), 1);
        assert_eq!(token_id_from_key(100, 200), 3_277_000);
        assert_eq!(token_id_from_key(16383, 16383), 536_854_527);
        assert_eq!(key_from_token_id(536_854_527), (16383, 16383));
    }
}
