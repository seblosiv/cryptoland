/// CryptoLandTile — Sui (Move)
/// ===========================
/// On Sui a tile is an OWNED OBJECT, not a row in a table. The object model does
/// the ownership work for us: transferring the object transfers the tile, and
/// there is no global mapping to keep consistent.
///
/// CROSS-CHAIN INVARIANT:  token_id = (tx << 15) | ty,  tx, ty in [0, 16383]
/// Must match evm.js, CryptoLandTile.sol, the Cairo, Aiken and PyTeal versions.
module cryptoland::tile {
    use std::string::String;
    use sui::event;
    use sui::table::{Self, Table};

    const GRID_MAX: u64 = 16383;
    const COORD_SHIFT: u8 = 15;

    const ENotOwner: u64 = 1;
    const EOutOfRange: u64 = 2;
    const EAlreadyClaimed: u64 = 3;

    /// The registry guarantees one owner per tile for the lifetime of the game.
    public struct Registry has key {
        id: UID,
        owner: address,
        base_uri: String,
        claimed: Table<u64, address>,
        total: u64,
    }

    /// A tile is its own object; whoever holds it owns that piece of the world.
    public struct Tile has key, store {
        id: UID,
        token_id: u64,
        tx: u64,
        ty: u64,
    }

    public struct TileMinted has copy, drop {
        token_id: u64,
        to: address,
        tx: u64,
        ty: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Registry {
            id: object::new(ctx),
            owner: ctx.sender(),
            base_uri: b"https://sui.xono.ai/metadata/".to_string(),
            claimed: table::new(ctx),
            total: 0,
        })
    }

    /// (tx << 15) | ty — identical to every other chain.
    public fun token_id_from_key(tx: u64, ty: u64): u64 {
        assert!(tx <= GRID_MAX, EOutOfRange);
        assert!(ty <= GRID_MAX, EOutOfRange);
        (tx << COORD_SHIFT) | ty
    }

    public fun key_from_token_id(token_id: u64): (u64, u64) {
        (token_id >> COORD_SHIFT, token_id & 0x7FFF)
    }

    public entry fun mint_tile(
        reg: &mut Registry, to: address, tx: u64, ty: u64, ctx: &mut TxContext
    ) {
        assert!(ctx.sender() == reg.owner, ENotOwner);
        let id = token_id_from_key(tx, ty);
        assert!(!reg.claimed.contains(id), EAlreadyClaimed);
        reg.claimed.add(id, to);
        reg.total = reg.total + 1;
        event::emit(TileMinted { token_id: id, to, tx, ty });
        transfer::public_transfer(
            Tile { id: object::new(ctx), token_id: id, tx, ty },
            to,
        )
    }

    public fun total_minted(reg: &Registry): u64 { reg.total }

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
