//! CryptoLandTile — Stellar (Soroban)
//!
//! Stellar assets are protocol-level, so this contract is the registry /
//! marketplace layer rather than the asset itself.
//!
//! CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String};

const GRID_MAX: u64 = 16383;
const COORD_SHIFT: u64 = 15;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    OutOfRange = 1,
    AlreadyClaimed = 2,
    NotOwner = 3,
}

#[contracttype]
pub enum DataKey {
    Owner,
    BaseUri,
    Tile(u64),
    Total,
}

#[contract]
pub struct CryptoLandTile;

/// (tx << 15) | ty — identical to every other chain.
pub fn token_id_from_key(tx: u64, ty: u64) -> Result<u64, Error> {
    if tx > GRID_MAX || ty > GRID_MAX {
        return Err(Error::OutOfRange);
    }
    Ok((tx << COORD_SHIFT) | ty)
}

pub fn key_from_token_id(token_id: u64) -> (u64, u64) {
    (token_id >> COORD_SHIFT, token_id & 0x7FFF)
}

#[contractimpl]
impl CryptoLandTile {
    pub fn init(env: Env, owner: Address, base_uri: String) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::BaseUri, &base_uri);
        env.storage().instance().set(&DataKey::Total, &0u64);
    }

    pub fn token_id(tx: u64, ty: u64) -> Result<u64, Error> {
        token_id_from_key(tx, ty)
    }

    pub fn mint_tile(env: Env, to: Address, tx: u64, ty: u64) -> Result<u64, Error> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        let id = token_id_from_key(tx, ty)?;
        if env.storage().persistent().has(&DataKey::Tile(id)) {
            return Err(Error::AlreadyClaimed);
        }
        env.storage().persistent().set(&DataKey::Tile(id), &to);
        let total: u64 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        env.storage().instance().set(&DataKey::Total, &(total + 1));
        Ok(id)
    }

    pub fn total_minted(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Total).unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    #[test]
    fn encoding_matches_other_chains() {
        assert_eq!(token_id_from_key(0, 0).unwrap(), 0);
        assert_eq!(token_id_from_key(1, 0).unwrap(), 32768);
        assert_eq!(token_id_from_key(0, 1).unwrap(), 1);
        assert_eq!(token_id_from_key(100, 200).unwrap(), 3_277_000);
        assert_eq!(token_id_from_key(16383, 16383).unwrap(), 536_854_527);
        assert_eq!(key_from_token_id(536_854_527), (16383, 16383));
        assert!(token_id_from_key(16384, 0).is_err());
    }
}
