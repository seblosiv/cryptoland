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
    /// Primary sale price in yoctoNEAR. 0 disables on-chain claiming.
    tile_price: u128,
    /// Resale fee, 700 = 7%. Capped at MAX_FEE_BPS.
    market_fee_bps: u16,
    /// 100% of primary sales + the resale cut.
    treasury: u128,
    /// Payout target — set to a cold wallet.
    treasury_receiver: AccountId,
}

/// 10% ceiling — survives a compromised owner key.
pub const MAX_FEE_BPS: u16 = 1000;

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
        Self {
            owner: owner.clone(),
            base_uri,
            tiles: IterableMap::new(b"t"),
            total: 0,
            tile_price: 0,
            market_fee_bps: 700,
            treasury: 0,
            treasury_receiver: owner,
        }
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

    /// PRIMARY SALE: 100% of the attached deposit becomes treasury.
    #[payable]
    pub fn claim_tile(&mut self, tx: u64, ty: u64) -> u64 {
        assert!(self.tile_price > 0, "on-chain claiming disabled");
        let paid = env::attached_deposit().as_yoctonear();
        assert!(paid >= self.tile_price, "insufficient payment");
        let id = token_id_from_key(tx, ty);
        assert!(self.tiles.get(&id).is_none(), "tile already claimed");
        self.tiles.insert(id, env::predecessor_account_id());
        self.total += 1;
        self.treasury += self.tile_price;
        id
    }

    pub fn set_tile_price(&mut self, price: near_sdk::json_types::U128) {
        self.assert_owner();
        self.tile_price = price.0;
    }

    pub fn set_market_fee_bps(&mut self, bps: u16) {
        self.assert_owner();
        assert!(bps <= MAX_FEE_BPS, "fee above 10% ceiling");
        self.market_fee_bps = bps;
    }

    /// Point payouts at a cold wallet without handing over admin rights.
    pub fn set_treasury_receiver(&mut self, to: AccountId) {
        self.assert_owner();
        self.treasury_receiver = to;
    }

    /// Entire treasury to the receiver. Zeroed before the transfer is scheduled.
    pub fn withdraw(&mut self) -> near_sdk::Promise {
        self.assert_owner();
        let amount = self.treasury;
        assert!(amount > 0, "nothing to withdraw");
        self.treasury = 0;
        near_sdk::Promise::new(self.treasury_receiver.clone())
            .transfer(near_sdk::NearToken::from_yoctonear(amount))
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "not owner");
    }

    pub fn tile_price(&self) -> near_sdk::json_types::U128 {
        near_sdk::json_types::U128(self.tile_price)
    }
    pub fn market_fee_bps(&self) -> u16 { self.market_fee_bps }
    pub fn treasury(&self) -> near_sdk::json_types::U128 {
        near_sdk::json_types::U128(self.treasury)
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
