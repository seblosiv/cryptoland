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
    fn init(&self) {
        self.market_fee_bps().set(700u64);              // 7%
        self.treasury_receiver().set(self.blockchain().get_caller());
    }

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

    /// PRIMARY SALE: 100% of the payment becomes treasury.
    #[payable("EGLD")]
    #[endpoint(claimTile)]
    fn claim_tile(&self, tx: u64, ty: u64) -> u64 {
        let price = self.tile_price().get();
        require!(price > 0u64, "on-chain claiming disabled");
        let paid = self.call_value().egld_value().clone_value();
        require!(paid >= BigUint::from(price), "insufficient payment");
        let id = self.token_id_from_key(tx, ty);
        require!(self.tile_owner(id).is_empty(), "tile already claimed");
        self.tile_owner(id).set(&self.blockchain().get_caller());
        self.total().update(|t| *t += 1);
        self.treasury().update(|t| *t += BigUint::from(price));
        id
    }

    #[only_owner]
    #[endpoint(setTilePrice)]
    fn set_tile_price(&self, price: u64) { self.tile_price().set(price); }

    #[only_owner]
    #[endpoint(setMarketFeeBps)]
    fn set_market_fee_bps(&self, bps: u64) {
        require!(bps <= 1000u64, "fee above 10% ceiling");  // survives a stolen key
        self.market_fee_bps().set(bps);
    }

    /// Point payouts at a cold wallet without handing over admin rights.
    #[only_owner]
    #[endpoint(setTreasuryReceiver)]
    fn set_treasury_receiver(&self, to: ManagedAddress) {
        self.treasury_receiver().set(&to);
    }

    /// Entire treasury to the receiver. Zeroed before the transfer.
    #[only_owner]
    #[endpoint(withdraw)]
    fn withdraw(&self) {
        let amount = self.treasury().get();
        require!(amount > 0u64, "nothing to withdraw");
        self.treasury().clear();
        self.tx().to(self.treasury_receiver().get()).egld(amount).transfer();
    }

    #[view(tilePrice)]
    #[storage_mapper("tilePrice")]
    fn tile_price(&self) -> SingleValueMapper<u64>;

    #[view(marketFeeBps)]
    #[storage_mapper("marketFeeBps")]
    fn market_fee_bps(&self) -> SingleValueMapper<u64>;

    #[view(treasury)]
    #[storage_mapper("treasury")]
    fn treasury(&self) -> SingleValueMapper<BigUint>;

    #[view(treasuryReceiver)]
    #[storage_mapper("treasuryReceiver")]
    fn treasury_receiver(&self) -> SingleValueMapper<ManagedAddress>;

    #[view(tileOwner)]
    #[storage_mapper("tileOwner")]
    fn tile_owner(&self, token_id: u64) -> SingleValueMapper<ManagedAddress>;

    #[view(totalMinted)]
    #[storage_mapper("total")]
    fn total(&self) -> SingleValueMapper<u64>;
}
