/// CryptoLandTile — Aptos (Move)
/// =============================
/// Move counterpart of contracts/src/CryptoLandTile.sol.
///
/// THE CROSS-CHAIN INVARIANT:
///   token_id = (tx << 15) | ty     tx, ty in [0, 16383]
/// Must match evm.js, _shared.js, CryptoLandTile.sol and the Cairo contract, or
/// the same tile carries a different id per chain.
module cryptoland::cryptoland_tile {
    use std::signer;
    use std::string::String;
    use aptos_std::table::{Self, Table};
    use aptos_framework::event;

    /// Z14 grid: 16384 x 16384.
    const GRID_MAX: u64 = 16383;
    const COORD_SHIFT: u8 = 15;

    const E_NOT_OWNER: u64 = 1;
    const E_OUT_OF_RANGE: u64 = 2;
    const E_ALREADY_CLAIMED: u64 = 3;

    struct Registry has key {
        owner: address,
        base_uri: String,
        tiles: Table<u64, address>,
        total: u64,
    }

    #[event]
    struct TileMinted has drop, store {
        token_id: u64,
        to: address,
        tx: u64,
        ty: u64,
    }

    public entry fun init(admin: &signer, base_uri: String) {
        move_to(admin, Registry {
            owner: signer::address_of(admin),
            base_uri,
            tiles: table::new(),
            total: 0,
        });
    }

    /// (tx << 15) | ty — identical to every other chain.
    public fun token_id_from_key(tx: u64, ty: u64): u64 {
        assert!(tx <= GRID_MAX, E_OUT_OF_RANGE);
        assert!(ty <= GRID_MAX, E_OUT_OF_RANGE);
        (tx << COORD_SHIFT) | ty
    }

    public fun key_from_token_id(token_id: u64): (u64, u64) {
        (token_id >> COORD_SHIFT, token_id & 0x7FFF)
    }

    public entry fun mint_tile(
        admin: &signer, registry_addr: address, to: address, tx: u64, ty: u64
    ) acquires Registry {
        let reg = borrow_global_mut<Registry>(registry_addr);
        assert!(signer::address_of(admin) == reg.owner, E_NOT_OWNER);
        let id = token_id_from_key(tx, ty);
        assert!(!table::contains(&reg.tiles, id), E_ALREADY_CLAIMED);
        table::add(&mut reg.tiles, id, to);
        reg.total = reg.total + 1;
        event::emit(TileMinted { token_id: id, to, tx, ty });
    }

    #[view]
    public fun tile_owner(registry_addr: address, tx: u64, ty: u64): address acquires Registry {
        let reg = borrow_global<Registry>(registry_addr);
        let id = token_id_from_key(tx, ty);
        *table::borrow(&reg.tiles, id)
    }

    #[view]
    public fun total_minted(registry_addr: address): u64 acquires Registry {
        borrow_global<Registry>(registry_addr).total
    }

    #[test]
    fun test_token_id_encoding() {
        assert!(token_id_from_key(0, 0) == 0, 0);
        assert!(token_id_from_key(1, 0) == 32768, 1);
        assert!(token_id_from_key(0, 1) == 1, 2);
        assert!(token_id_from_key(100, 200) == 3277000, 3);
        assert!(token_id_from_key(16383, 16383) == 536854527, 4);
        let (tx, ty) = key_from_token_id(536854527);
        assert!(tx == 16383 && ty == 16383, 5);
    }
}
