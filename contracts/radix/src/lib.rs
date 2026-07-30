//! CryptoLandTile — Radix (Scrypto)
//!
//! On Radix a non-fungible is a NATIVE RESOURCE, so the ledger enforces supply
//! and uniqueness. The blueprint only mints into that resource and refuses a
//! duplicate local id.
//!
//! CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
use scrypto::prelude::*;

const GRID_MAX: u64 = 16383;
const COORD_SHIFT: u64 = 15;

#[derive(ScryptoSbor, NonFungibleData)]
pub struct TileData {
    pub token_id: u64,
    pub tx: u64,
    pub ty: u64,
}

/// (tx << 15) | ty — identical to every other chain.
pub fn token_id_from_key(tx: u64, ty: u64) -> u64 {
    assert!(tx <= GRID_MAX && ty <= GRID_MAX, "coords out of range");
    (tx << COORD_SHIFT) | ty
}

pub fn key_from_token_id(token_id: u64) -> (u64, u64) {
    (token_id >> COORD_SHIFT, token_id & 0x7FFF)
}

#[blueprint]
mod cryptoland_tile {
    struct CryptoLandTile {
        tile_manager: NonFungibleResourceManager,
        minted: u64,
    }

    impl CryptoLandTile {
        pub fn instantiate(base_uri: String) -> (Global<CryptoLandTile>, Bucket) {
            let admin: Bucket = ResourceBuilder::new_fungible(OwnerRole::None)
                .divisibility(DIVISIBILITY_NONE)
                .metadata(metadata!(init { "name" => "CryptoLand Admin", locked; }))
                .mint_initial_supply(1)
                .into();

            let tile_manager = ResourceBuilder::new_integer_non_fungible::<TileData>(
                OwnerRole::Fixed(rule!(require(admin.resource_address()))),
            )
            .metadata(metadata!(init {
                "name" => "CryptoLand Tiles", locked;
                "symbol" => "CLND", locked;
                "base_uri" => base_uri, locked;
            }))
            .mint_roles(mint_roles!(
                minter => rule!(require(admin.resource_address()));
                minter_updater => rule!(deny_all);
            ))
            .create_with_no_initial_supply();

            let component = Self { tile_manager, minted: 0 }
                .instantiate()
                .prepare_to_globalize(OwnerRole::None)
                .globalize();

            (component, admin)
        }

        /// The local id IS the packed tile id, so the ledger itself rejects a
        /// second mint of the same tile.
        pub fn mint_tile(&mut self, tx: u64, ty: u64) -> Bucket {
            let id = token_id_from_key(tx, ty);
            self.minted += 1;
            self.tile_manager.mint_non_fungible(
                &NonFungibleLocalId::integer(id),
                TileData { token_id: id, tx, ty },
            )
        }

        pub fn total_minted(&self) -> u64 { self.minted }
    }
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
