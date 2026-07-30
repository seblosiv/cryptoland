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
    fn tile_exists(self: @TState, tx: u32, ty: u32) -> bool;
    fn total_minted(self: @TState) -> u64;
}

#[starknet::contract]
pub mod CryptoLandTile {
    use starknet::ContractAddress;
    use starknet::storage::{
        Map, StoragePointerReadAccess, StoragePointerWriteAccess,
        StorageMapReadAccess, StorageMapWriteAccess,
    };

    // Z14 grid: 16384 x 16384. Shift of 15 bits packs ty alongside tx.
    const GRID_MAX: u32 = 16383;
    const COORD_SHIFT: u64 = 32768; // 2^15

    #[storage]
    struct Storage {
        owner: ContractAddress,
        base_uri: felt252,
        minted: Map<u64, ContractAddress>,
        total: u64,
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
    fn constructor(ref self: ContractState, owner: ContractAddress, base_uri: felt252) {
        self.owner.write(owner);
        self.base_uri.write(base_uri);
    }

    #[abi(embed_v0)]
    impl CryptoLandTileImpl of super::ICryptoLandTile<ContractState> {
        /// (tx << 15) | ty — identical to every other chain's encoding.
        fn token_id_from_key(self: @ContractState, tx: u32, ty: u32) -> u64 {
            assert(tx <= GRID_MAX, 'tx out of range');
            assert(ty <= GRID_MAX, 'ty out of range');
            (tx.into() * COORD_SHIFT) + ty.into()
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
    }
}
