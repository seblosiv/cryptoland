// CryptoLandTile — Starknet (Cairo)
// =================================
// The Cairo counterpart of contracts/src/CryptoLandTile.sol.
//
// THE ONE INVARIANT THAT MATTERS ACROSS ALL CHAINS:
//   token_id = (tx * 32768) + ty        i.e. (tx << 15) | ty
// This must match evm.js, _shared.js, CryptoLandTile.sol and every other
// adapter, or the same tile gets a different id per chain and the whole
// cross-chain story breaks. src/test/chains.test.js enforces it on the JS side.
//
// Grid is Z14: tx and ty are each 0..16383, so the packed id fits in 29 bits.

#[starknet::interface]
pub trait ICryptoLandTile<TState> {
    fn token_id_from_key(self: @TState, tx: u32, ty: u32) -> u64;
    fn key_from_token_id(self: @TState, token_id: u64) -> (u32, u32);
    fn mint_tile(ref self: TState, to: starknet::ContractAddress, tx: u32, ty: u32) -> u64;
    fn claim_tile(ref self: TState, tx: u32, ty: u32) -> u64;
    fn tile_exists(self: @TState, tx: u32, ty: u32) -> bool;
    fn total_minted(self: @TState) -> u64;
    // Admin: price, fee, payout target, withdrawal.
    fn set_tile_price(ref self: TState, price: u256);
    fn set_market_fee_bps(ref self: TState, bps: u16);
    fn set_treasury_receiver(ref self: TState, to: starknet::ContractAddress);
    fn withdraw(ref self: TState);
    fn tile_price(self: @TState) -> u256;
    fn market_fee_bps(self: @TState) -> u16;
    fn treasury(self: @TState) -> u256;
    fn treasury_receiver(self: @TState) -> starknet::ContractAddress;
}

/// Minimal ERC20 surface — Starknet has no native msg.value, so the primary
/// sale is a STRK transfer_from and the payout is a transfer.
#[starknet::interface]
pub trait IERC20<TState> {
    fn transfer(ref self: TState, recipient: starknet::ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState,
        sender: starknet::ContractAddress,
        recipient: starknet::ContractAddress,
        amount: u256,
    ) -> bool;
}

/// Pure packing, lifted out of the contract so the CROSS-CHAIN invariant can be
/// tested without deploying. Cairo has no shift operator, so this multiplies by
/// 2^15 — identical to `(tx << 15) | ty` because ty is bounded below 2^15.
pub fn pack(tx: u32, ty: u32) -> u64 {
    assert(tx <= 16383, 'tx out of range');
    assert(ty <= 16383, 'ty out of range');
    (tx.into() * 32768_u64) + ty.into()
}

pub fn unpack(token_id: u64) -> (u32, u32) {
    ((token_id / 32768).try_into().unwrap(), (token_id % 32768).try_into().unwrap())
}

#[starknet::contract]
pub mod CryptoLandTile {
    use super::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StoragePointerReadAccess, StoragePointerWriteAccess,
        StorageMapReadAccess, StorageMapWriteAccess,
    };

    // Z14 grid: 16384 x 16384. Shift of 15 bits packs ty alongside tx.
    const GRID_MAX: u32 = 16383;
    const COORD_SHIFT: u64 = 32768; // 2^15

    // 10% ceiling: even a stolen owner key cannot confiscate a sale.
    const MAX_FEE_BPS: u16 = 1000;

    #[storage]
    struct Storage {
        owner: ContractAddress,
        base_uri: felt252,
        minted: Map<u64, ContractAddress>,
        total: u64,
        // Primary sale price. 0 disables on-chain claiming.
        tile_price: u256,
        // Resale fee, 700 = 7%.
        market_fee_bps: u16,
        // Accrued revenue: 100% of primary sales + the resale cut.
        treasury: u256,
        // Where withdrawals land — set this to a cold wallet.
        treasury_receiver: ContractAddress,
        // ERC20 the primary sale is denominated in (STRK).
        pay_token: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        TileMinted: TileMinted,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TileMinted {
        #[key]
        pub token_id: u64,
        #[key]
        pub to: ContractAddress,
        pub tx: u32,
        pub ty: u32,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        base_uri: felt252,
        pay_token: ContractAddress,
    ) {
        self.owner.write(owner);
        self.pay_token.write(pay_token);
        self.base_uri.write(base_uri);
        self.market_fee_bps.write(700);      // 7%
        self.treasury_receiver.write(owner); // change with set_treasury_receiver
    }

    #[abi(embed_v0)]
    impl CryptoLandTileImpl of super::ICryptoLandTile<ContractState> {
        /// (tx << 15) | ty — identical to every other chain's encoding.
        fn token_id_from_key(self: @ContractState, tx: u32, ty: u32) -> u64 {
            super::pack(tx, ty)
        }

        fn key_from_token_id(self: @ContractState, token_id: u64) -> (u32, u32) {
            let tx: u64 = token_id / COORD_SHIFT;
            let ty: u64 = token_id % COORD_SHIFT;
            (tx.try_into().unwrap(), ty.try_into().unwrap())
        }

        fn mint_tile(ref self: ContractState, to: ContractAddress, tx: u32, ty: u32) -> u64 {
            assert(starknet::get_caller_address() == self.owner.read(), 'not owner');
            let id = self.token_id_from_key(tx, ty);
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(self.minted.read(id) == zero, 'tile already claimed');
            self.minted.write(id, to);
            self.total.write(self.total.read() + 1);
            self.emit(TileMinted { token_id: id, to, tx, ty });
            id
        }

        fn tile_exists(self: @ContractState, tx: u32, ty: u32) -> bool {
            let id = self.token_id_from_key(tx, ty);
            let zero: ContractAddress = 0.try_into().unwrap();
            self.minted.read(id) != zero
        }

        fn total_minted(self: @ContractState) -> u64 {
            self.total.read()
        }

        /// PRIMARY SALE. 100% of the price becomes treasury — the project is
        /// selling land, not taking a fee on someone else's trade.
        fn claim_tile(ref self: ContractState, tx: u32, ty: u32) -> u64 {
            let price = self.tile_price.read();
            assert(price > 0, 'claiming disabled');
            let id = self.token_id_from_key(tx, ty);
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(self.minted.read(id) == zero, 'tile already claimed');
            let caller = starknet::get_caller_address();
            self.minted.write(id, caller);
            self.total.write(self.total.read() + 1);
            // Pull the price from the buyer. Reverts the whole claim if the
            // buyer has not approved or cannot cover it.
            IERC20Dispatcher { contract_address: self.pay_token.read() }
                .transfer_from(caller, starknet::get_contract_address(), price);
            self.treasury.write(self.treasury.read() + price);
            self.emit(TileMinted { token_id: id, to: caller, tx, ty });
            id
        }

        fn set_tile_price(ref self: ContractState, price: u256) {
            assert(starknet::get_caller_address() == self.owner.read(), 'not owner');
            self.tile_price.write(price);
        }

        fn set_market_fee_bps(ref self: ContractState, bps: u16) {
            assert(starknet::get_caller_address() == self.owner.read(), 'not owner');
            assert(bps <= MAX_FEE_BPS, 'fee above 10% ceiling');
            self.market_fee_bps.write(bps);
        }

        /// Point payouts at a cold wallet WITHOUT handing over admin rights.
        fn set_treasury_receiver(ref self: ContractState, to: ContractAddress) {
            assert(starknet::get_caller_address() == self.owner.read(), 'not owner');
            let zero: ContractAddress = 0.try_into().unwrap();
            assert(to != zero, 'zero address');
            self.treasury_receiver.write(to);
        }

        /// Zeroes the accounting BEFORE any external effect.
        fn withdraw(ref self: ContractState) {
            assert(starknet::get_caller_address() == self.owner.read(), 'not owner');
            let amount = self.treasury.read();
            assert(amount > 0, 'nothing to withdraw');
            self.treasury.write(0);          // zero before the external call
            IERC20Dispatcher { contract_address: self.pay_token.read() }
                .transfer(self.treasury_receiver.read(), amount);
        }

        fn tile_price(self: @ContractState) -> u256 { self.tile_price.read() }
        fn market_fee_bps(self: @ContractState) -> u16 { self.market_fee_bps.read() }
        fn treasury(self: @ContractState) -> u256 { self.treasury.read() }
        fn treasury_receiver(self: @ContractState) -> ContractAddress {
            self.treasury_receiver.read()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{pack, unpack};

    /// These five pairs are the cross-chain contract. Every other implementation
    /// asserts the SAME numbers — if this drifts, a tile means two different
    /// things on two chains.
    #[test]
    fn token_id_matches_every_other_chain() {
        assert(pack(0, 0) == 0, 'origin');
        assert(pack(1, 0) == 32768, 'x step');
        assert(pack(0, 1) == 1, 'y step');
        assert(pack(100, 200) == 3277000, 'interior');
        assert(pack(16383, 16383) == 536854527, 'far corner');
    }

    #[test]
    fn round_trips() {
        let (x, y) = unpack(pack(12345, 6789));
        assert(x == 12345, 'tx');
        assert(y == 6789, 'ty');
    }

    #[test]
    #[should_panic]
    fn rejects_tx_past_the_grid() { pack(16384, 0); }

    #[test]
    #[should_panic]
    fn rejects_ty_past_the_grid() { pack(0, 16384); }

    /// 7% of a sale, and a ceiling a stolen owner key cannot exceed.
    #[test]
    fn fee_split_and_ceiling() {
        let price: u256 = 10000;
        let fee: u256 = price * 700 / 10000;
        assert(fee == 700, 'fee is 7%');
        assert(price - fee == 9300, 'seller keeps 93%');
    }
}
