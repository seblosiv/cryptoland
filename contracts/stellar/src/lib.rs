//! CryptoLandTile — Stellar (Soroban)
//!
//! Stellar assets are protocol-level, so this contract is the registry /
//! marketplace layer rather than the asset itself.
//!
//! CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, String};

const GRID_MAX: u64 = 16383;
const COORD_SHIFT: u64 = 15;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    OutOfRange = 1,
    AlreadyClaimed = 2,
    NotOwner = 3,
    FeeTooHigh = 4,
    NothingToWithdraw = 5,
    ClaimingDisabled = 6,
}

#[contracttype]
pub enum DataKey {
    Owner,
    BaseUri,
    Tile(u64),
    Total,
    /// Primary sale price in stroops. 0 disables on-chain claiming.
    TilePrice,
    /// Resale fee, 700 = 7%. Capped at MAX_FEE_BPS.
    MarketFeeBps,
    /// 100% of primary sales + the resale cut.
    Treasury,
    /// Payout target — set to a cold wallet.
    TreasuryReceiver,
    /// SAC address of the asset the sale is denominated in (XLM by default).
    PayToken,
}

/// 10% ceiling — survives a compromised owner key.
pub const MAX_FEE_BPS: u32 = 1000;

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
    pub fn init(env: Env, owner: Address, base_uri: String, pay_token: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::BaseUri, &base_uri);
        env.storage().instance().set(&DataKey::Total, &0u64);
        env.storage().instance().set(&DataKey::TilePrice, &0i128);
        env.storage().instance().set(&DataKey::MarketFeeBps, &700u32);
        env.storage().instance().set(&DataKey::Treasury, &0i128);
        env.storage().instance().set(&DataKey::TreasuryReceiver, &owner);
        env.storage().instance().set(&DataKey::PayToken, &pay_token);
    }

    /// Primary sale. Pulls `tile_price` from the buyer into the contract, so the
    /// treasury figure is backed by real balance rather than a bare counter.
    pub fn claim_tile(env: Env, buyer: Address, tx: u64, ty: u64) -> Result<u64, Error> {
        buyer.require_auth();
        let price: i128 = env.storage().instance().get(&DataKey::TilePrice).unwrap_or(0);
        if price <= 0 { return Err(Error::ClaimingDisabled); }
        let id = token_id_from_key(tx, ty)?;
        if env.storage().persistent().has(&DataKey::Tile(id)) {
            return Err(Error::AlreadyClaimed);
        }
        let pay: Address = env.storage().instance().get(&DataKey::PayToken).unwrap();
        token::Client::new(&env, &pay).transfer(&buyer, &env.current_contract_address(), &price);
        env.storage().persistent().set(&DataKey::Tile(id), &buyer);
        let total: u64 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        env.storage().instance().set(&DataKey::Total, &(total + 1));
        let t: i128 = env.storage().instance().get(&DataKey::Treasury).unwrap_or(0);
        env.storage().instance().set(&DataKey::Treasury, &(t + price));
        Ok(id)
    }

    fn require_owner(env: &Env) -> Address {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        owner
    }

    pub fn set_tile_price(env: Env, price: i128) {
        Self::require_owner(&env);
        env.storage().instance().set(&DataKey::TilePrice, &price);
    }

    pub fn set_market_fee_bps(env: Env, bps: u32) -> Result<(), Error> {
        Self::require_owner(&env);
        if bps > MAX_FEE_BPS { return Err(Error::FeeTooHigh); }
        env.storage().instance().set(&DataKey::MarketFeeBps, &bps);
        Ok(())
    }

    /// Point payouts at a cold wallet without handing over admin rights.
    pub fn set_treasury_receiver(env: Env, to: Address) {
        Self::require_owner(&env);
        env.storage().instance().set(&DataKey::TreasuryReceiver, &to);
    }

    /// Entire treasury to the receiver. Zeroed before returning.
    pub fn withdraw(env: Env) -> Result<i128, Error> {
        Self::require_owner(&env);
        let amount: i128 = env.storage().instance().get(&DataKey::Treasury).unwrap_or(0);
        if amount <= 0 { return Err(Error::NothingToWithdraw); }
        env.storage().instance().set(&DataKey::Treasury, &0i128); // zero first
        let pay: Address = env.storage().instance().get(&DataKey::PayToken).unwrap();
        let to: Address = env.storage().instance().get(&DataKey::TreasuryReceiver).unwrap();
        token::Client::new(&env, &pay).transfer(&env.current_contract_address(), &to, &amount);
        Ok(amount)
    }

    pub fn tile_price(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TilePrice).unwrap_or(0)
    }
    pub fn market_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::MarketFeeBps).unwrap_or(700)
    }
    pub fn treasury(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Treasury).unwrap_or(0)
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
