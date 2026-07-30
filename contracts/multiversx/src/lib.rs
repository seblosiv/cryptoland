//! CryptoLandTile — MultiversX (Rust / ESDT)
//!
//! An ESDT NFT is issued by a BUILTIN function call, so the contract is only the
//! registry that enforces one owner per tile and packs the id.
//!
//! CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
#![no_std]

multiversx_sc::imports!();

const GRID_MAX: u64 = 16383;
const COORD_SHIFT: u64 = 15;

#[multiversx_sc::contract]
pub trait CryptoLandTile {
    #[init]
    fn init(&self) {}

    #[upgrade]
    fn upgrade(&self) {}

    /// (tx << 15) | ty — identical to every other chain.
    #[view(tokenIdFromKey)]
    fn token_id_from_key(&self, tx: u64, ty: u64) -> u64 {
        require!(tx <= GRID_MAX && ty <= GRID_MAX, "coords out of range");
        (tx << COORD_SHIFT) | ty
    }

    #[view(keyFromTokenId)]
    fn key_from_token_id(&self, token_id: u64) -> MultiValue2<u64, u64> {
        (token_id >> COORD_SHIFT, token_id & 0x7FFF).into()
    }

    #[only_owner]
    #[endpoint(mintTile)]
    fn mint_tile(&self, to: ManagedAddress, tx: u64, ty: u64) -> u64 {
        let id = self.token_id_from_key(tx, ty);
        require!(self.tile_owner(id).is_empty(), "tile already claimed");
        self.tile_owner(id).set(&to);
        self.total().update(|t| *t += 1);
        id
    }

    #[view(tileOwner)]
    #[storage_mapper("tileOwner")]
    fn tile_owner(&self, token_id: u64) -> SingleValueMapper<ManagedAddress>;

    #[view(totalMinted)]
    #[storage_mapper("total")]
    fn total(&self) -> SingleValueMapper<u64>;
}
