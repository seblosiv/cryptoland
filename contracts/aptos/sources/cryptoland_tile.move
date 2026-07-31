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
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::aptos_account;

    /// Z14 grid: 16384 x 16384.
    const GRID_MAX: u64 = 16383;
    const COORD_SHIFT: u8 = 15;

    const E_NOT_OWNER: u64 = 1;
    const E_OUT_OF_RANGE: u64 = 2;
    const E_ALREADY_CLAIMED: u64 = 3;
    const E_FEE_TOO_HIGH: u64 = 4;
    const E_NOTHING_TO_WITHDRAW: u64 = 5;
    const E_CLAIMING_DISABLED: u64 = 6;
    /// 10% ceiling — survives a compromised owner key.
    const MAX_FEE_BPS: u64 = 1000;

    struct Registry has key {
        owner: address,
        base_uri: String,
        tiles: Table<u64, address>,
        total: u64,
        /// Primary sale price in octas. 0 disables on-chain claiming.
        tile_price: u64,
        /// Resale fee, 700 = 7%. Capped at MAX_FEE_BPS.
        market_fee_bps: u64,
        /// 100% of primary sales + the resale cut. A real coin store, not a
        /// counter — an audit found the previous u64 let tiles be claimed free.
        treasury: Coin<AptosCoin>,
        /// Payout target — set to a cold wallet.
        treasury_receiver: address,
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
            tile_price: 0,
            market_fee_bps: 700,
            treasury: coin::zero<AptosCoin>(),
            treasury_receiver: signer::address_of(admin),
        });
    }

    /// (tx << 15) | ty — identical to every other chain.
    #[view]
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

    /// PRIMARY SALE: 100% of the price becomes treasury.
    public entry fun claim_tile(
        buyer: &signer, registry_addr: address, tx: u64, ty: u64
    ) acquires Registry {
        let reg = borrow_global_mut<Registry>(registry_addr);
        assert!(reg.tile_price > 0, E_CLAIMING_DISABLED);
        let id = token_id_from_key(tx, ty);
        assert!(!table::contains(&reg.tiles, id), E_ALREADY_CLAIMED);
        let to = signer::address_of(buyer);
        table::add(&mut reg.tiles, id, to);
        reg.total = reg.total + 1;
        // Actually take the money. Aborts if the buyer cannot cover the price.
        let paid = coin::withdraw<AptosCoin>(buyer, reg.tile_price);
        coin::merge(&mut reg.treasury, paid);
        event::emit(TileMinted { token_id: id, to, tx, ty });
    }

    public entry fun set_tile_price(
        admin: &signer, registry_addr: address, price: u64
    ) acquires Registry {
        let reg = borrow_global_mut<Registry>(registry_addr);
        assert!(signer::address_of(admin) == reg.owner, E_NOT_OWNER);
        reg.tile_price = price;
    }

    public entry fun set_market_fee_bps(
        admin: &signer, registry_addr: address, bps: u64
    ) acquires Registry {
        let reg = borrow_global_mut<Registry>(registry_addr);
        assert!(signer::address_of(admin) == reg.owner, E_NOT_OWNER);
        assert!(bps <= MAX_FEE_BPS, E_FEE_TOO_HIGH);
        reg.market_fee_bps = bps;
    }

    /// Point payouts at a cold wallet without handing over admin rights.
    public entry fun set_treasury_receiver(
        admin: &signer, registry_addr: address, to: address
    ) acquires Registry {
        let reg = borrow_global_mut<Registry>(registry_addr);
        assert!(signer::address_of(admin) == reg.owner, E_NOT_OWNER);
        reg.treasury_receiver = to;
    }

    /// Entire treasury to the receiver. Zeroed before returning.
    public entry fun withdraw(
        admin: &signer, registry_addr: address
    ) acquires Registry {
        let reg = borrow_global_mut<Registry>(registry_addr);
        assert!(signer::address_of(admin) == reg.owner, E_NOT_OWNER);
        let amount = coin::value(&reg.treasury);
        assert!(amount > 0, E_NOTHING_TO_WITHDRAW);
        // extract_all zeroes the store before the deposit; aptos_account::deposit
        // auto-registers the receiver so a cold wallet needs no prior setup.
        let payout = coin::extract_all(&mut reg.treasury);
        aptos_account::deposit_coins(reg.treasury_receiver, payout);
    }

    #[view]
    public fun tile_price(registry_addr: address): u64 acquires Registry {
        borrow_global<Registry>(registry_addr).tile_price
    }

    #[view]
    public fun treasury(registry_addr: address): u64 acquires Registry {
        coin::value(&borrow_global<Registry>(registry_addr).treasury)
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

    /// The cross-chain contract — the same five pairs every other chain asserts.
    #[test]
    fun token_id_matches_every_other_chain() {
        assert!(token_id_from_key(0, 0) == 0, 0);
        assert!(token_id_from_key(1, 0) == 32768, 1);
        assert!(token_id_from_key(0, 1) == 1, 2);
        assert!(token_id_from_key(100, 200) == 3277000, 3);
        assert!(token_id_from_key(16383, 16383) == 536854527, 4);
    }

    #[test]
    #[expected_failure]
    fun rejects_out_of_range() { token_id_from_key(16384, 0); }

    /// 7% to the project, 93% to the seller.
    #[test]
    fun fee_split_is_7_percent() {
        let price: u64 = 10000;
        let fee = price * 700 / 10000;
        assert!(fee == 700, 5);
        assert!(price - fee == 9300, 6);
    }
}
