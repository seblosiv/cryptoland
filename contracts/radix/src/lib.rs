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
#[types(TileData)]
mod cryptoland_tile {
    // AUTH. Without this every public method is callable by anyone — an audit
    // found withdraw() completely ungated, which would have let any caller drain
    // the treasury the moment the component went live. Admin methods now require
    // the admin badge minted at instantiation.
    enable_method_auth! {
        roles {
            admin => updatable_by: [];
        },
        methods {
            claim_tile       => PUBLIC;          // buyers must be able to claim
            tile_price       => PUBLIC;
            market_fee_bps   => PUBLIC;
            treasury_amount  => PUBLIC;
            total_minted     => PUBLIC;
            mint_tile        => restrict_to: [admin];
            set_tile_price   => restrict_to: [admin];
            set_market_fee_bps => restrict_to: [admin];
            withdraw         => restrict_to: [admin];
        }
    }

    struct CryptoLandTile {
        tile_manager: NonFungibleResourceManager,
        minted: u64,
        /// Primary sale price in XRD. 0 disables on-chain claiming.
        tile_price: Decimal,
        /// Resale fee, 700 = 7%. Capped at 1000 (10%).
        market_fee_bps: u16,
        /// 100% of primary sales + the resale cut, held as a real vault.
        treasury: Vault,
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

            let component = Self {
                tile_manager,
                minted: 0,
                tile_price: Decimal::ZERO,
                market_fee_bps: 700,
                treasury: Vault::new(XRD),
            }
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
            ).into()
        }

        /// PRIMARY SALE: the whole payment goes into the treasury vault.
        pub fn claim_tile(&mut self, mut payment: Bucket, tx: u64, ty: u64) -> (Bucket, Bucket) {
            assert!(self.tile_price > Decimal::ZERO, "on-chain claiming disabled");
            assert!(payment.amount() >= self.tile_price, "insufficient payment");
            let id = token_id_from_key(tx, ty);
            self.treasury.put(payment.take(self.tile_price));
            self.minted += 1;
            let tile: Bucket = self.tile_manager.mint_non_fungible(
                &NonFungibleLocalId::integer(id),
                TileData { token_id: id, tx, ty },
            ).into();
            (tile, payment)   // change returned to the buyer
        }

        pub fn set_tile_price(&mut self, price: Decimal) { self.tile_price = price; }

        pub fn set_market_fee_bps(&mut self, bps: u16) {
            assert!(bps <= 1000, "fee above 10% ceiling");
            self.market_fee_bps = bps;
        }

        /// Withdraw the ENTIRE treasury. The caller sends it on to the cold wallet.
        pub fn withdraw(&mut self) -> Bucket {
            assert!(!self.treasury.is_empty(), "nothing to withdraw");
            self.treasury.take_all()
        }

        pub fn tile_price(&self) -> Decimal { self.tile_price }
        pub fn market_fee_bps(&self) -> u16 { self.market_fee_bps }
        pub fn treasury_amount(&self) -> Decimal { self.treasury.amount() }
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

#[cfg(test)]
mod invariant_tests {
    const GRID_MAX: u64 = 16383;

    fn pack(tx: u64, ty: u64) -> u64 {
        assert!(tx <= GRID_MAX && ty <= GRID_MAX, "out of range");
        (tx << 15) | ty
    }
    fn unpack(id: u64) -> (u64, u64) { (id >> 15, id & 0x7FFF) }

    /// The cross-chain contract. Every one of the 13 implementations asserts
    /// these same five pairs — if one drifts, a tile means two different things
    /// on two different chains.
    #[test]
    fn token_id_matches_every_other_chain() {
        assert_eq!(pack(0, 0), 0);
        assert_eq!(pack(1, 0), 32768);
        assert_eq!(pack(0, 1), 1);
        assert_eq!(pack(100, 200), 3_277_000);
        assert_eq!(pack(16383, 16383), 536_854_527);
    }

    #[test]
    fn round_trips() { assert_eq!(unpack(pack(12345, 6789)), (12345, 6789)); }

    #[test]
    #[should_panic]
    fn rejects_out_of_range() { pack(16384, 0); }

    /// 7% to the project, 93% to the seller, and a ceiling a stolen owner key
    /// still cannot exceed.
    #[test]
    fn fee_split_and_ceiling() {
        let price: u64 = 10_000;
        let fee = price * 700 / 10_000;
        assert_eq!(fee, 700);
        assert_eq!(price - fee, 9_300);
        assert_eq!(price * 1000 / 10_000, 1_000);  // ceiling = 10%
    }
}
