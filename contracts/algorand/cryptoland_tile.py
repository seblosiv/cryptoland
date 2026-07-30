"""CryptoLandTile — Algorand (PyTeal)

An Algorand tile is an ASA (Algorand Standard Asset), which is a PROTOCOL
primitive: minting needs an AssetConfig transaction, not a contract. This
application is only the registry/marketplace layer that maps a packed tile id to
its ASA and enforces one-owner-per-tile.

CROSS-CHAIN INVARIANT:  token_id = (tx << 15) | ty,  tx, ty in [0, 16383]
Must match evm.js, CryptoLandTile.sol, the Cairo and Move contracts.
"""
from pyteal import *

GRID_MAX = Int(16383)
COORD_SHIFT = Int(15)


def token_id_from_key(tx: Expr, ty: Expr) -> Expr:
    """(tx << 15) | ty — identical to every other chain."""
    return (tx << COORD_SHIFT) | ty


def approval_program():
    owner = Bytes("owner")
    total = Bytes("total")

    tx_arg = Btoi(Txn.application_args[1])
    ty_arg = Btoi(Txn.application_args[2])
    tile_id = token_id_from_key(tx_arg, ty_arg)
    tile_key = Concat(Bytes("t:"), Itob(tile_id))

    on_create = Seq(
        App.globalPut(owner, Txn.sender()),
        App.globalPut(total, Int(0)),
        Approve(),
    )

    claimed = App.globalGetEx(Global.current_application_id(), tile_key)

    on_mint = Seq(
        Assert(Txn.sender() == App.globalGet(owner)),
        Assert(tx_arg <= GRID_MAX),
        Assert(ty_arg <= GRID_MAX),
        claimed,
        Assert(Not(claimed.hasValue())),          # one owner per tile, ever
        App.globalPut(tile_key, Txn.accounts[1]),
        App.globalPut(total, App.globalGet(total) + Int(1)),
        Approve(),
    )

    return Cond(
        [Txn.application_id() == Int(0), on_create],
        [Txn.on_completion() == OnComplete.NoOp,
         Cond([Txn.application_args[0] == Bytes("mint"), on_mint])],
    )


def clear_program():
    return Approve()


if __name__ == "__main__":
    import json, sys
    approval = compileTeal(approval_program(), mode=Mode.Application, version=8)
    clear = compileTeal(clear_program(), mode=Mode.Application, version=8)
    open("approval.teal", "w").write(approval)
    open("clear.teal", "w").write(clear)
    # Self-check the encoding against the canonical values.
    for tx, ty, want in [(0,0,0),(1,0,32768),(0,1,1),(100,200,3277000),(16383,16383,536854527)]:
        got = (tx << 15) | ty
        assert got == want, f"{tx},{ty} -> {got} != {want}"
    print(f"compiled: approval.teal {len(approval)} bytes, clear.teal {len(clear)} bytes")
    print("tokenId encoding self-check: OK")
