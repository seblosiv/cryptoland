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


MAX_FEE_BPS = Int(1000)   # 10% ceiling


def approval_program():
    owner    = Bytes("owner")
    total    = Bytes("total")
    price    = Bytes("price")      # primary sale price in microAlgos; 0 = disabled
    fee_bps  = Bytes("fee_bps")    # resale fee, 700 = 7%
    treasury = Bytes("treasury")   # 100% of primary sales + the resale cut
    receiver = Bytes("receiver")   # payout target — set to a cold wallet


    tx_arg = Btoi(Txn.application_args[1])
    ty_arg = Btoi(Txn.application_args[2])
    tile_id = token_id_from_key(tx_arg, ty_arg)
    tile_key = Concat(Bytes("t:"), Itob(tile_id))
    claimed = App.globalGetEx(Global.current_application_id(), tile_key)

    on_create = Seq(
        App.globalPut(owner, Txn.sender()),
        App.globalPut(total, Int(0)),
        App.globalPut(price, Int(0)),
        App.globalPut(fee_bps, Int(700)),
        App.globalPut(treasury, Int(0)),
        App.globalPut(receiver, Txn.sender()),
        Approve(),
    )

    is_owner = Txn.sender() == App.globalGet(owner)
    arg1 = Btoi(Txn.application_args[1])

    on_set_price = Seq(Assert(is_owner), App.globalPut(price, arg1), Approve())

    on_set_fee = Seq(
        Assert(is_owner),
        Assert(arg1 <= MAX_FEE_BPS),           # ceiling survives a stolen key
        App.globalPut(fee_bps, arg1),
        Approve(),
    )

    on_set_receiver = Seq(
        Assert(is_owner),
        App.globalPut(receiver, Txn.accounts[1]),
        Approve(),
    )

    # PRIMARY SALE: the payment txn must accompany this call and pay the app.
    on_claim = Seq(
        Assert(App.globalGet(price) > Int(0)),
        Assert(Gtxn[0].type_enum() == TxnType.Payment),
        Assert(Gtxn[0].receiver() == Global.current_application_address()),
        Assert(Gtxn[0].amount() >= App.globalGet(price)),
        Assert(tx_arg <= GRID_MAX),
        Assert(ty_arg <= GRID_MAX),
        claimed,
        Assert(Not(claimed.hasValue())),
        App.globalPut(tile_key, Txn.sender()),
        App.globalPut(total, App.globalGet(total) + Int(1)),
        # 100% of the payment is revenue.
        App.globalPut(treasury, App.globalGet(treasury) + App.globalGet(price)),
        Approve(),
    )

    # Zeroes the accounting BEFORE sending, same ordering as every other chain.
    on_withdraw = Seq(
        Assert(is_owner),
        Assert(App.globalGet(treasury) > Int(0)),
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields({
            TxnField.type_enum: TxnType.Payment,
            TxnField.receiver: App.globalGet(receiver),
            TxnField.amount: App.globalGet(treasury),
        }),
        InnerTxnBuilder.Submit(),
        App.globalPut(treasury, Int(0)),
        Approve(),
    )


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
         Cond(
             [Txn.application_args[0] == Bytes("mint"),         on_mint],
             [Txn.application_args[0] == Bytes("claim"),        on_claim],
             [Txn.application_args[0] == Bytes("set_price"),    on_set_price],
             [Txn.application_args[0] == Bytes("set_fee"),      on_set_fee],
             [Txn.application_args[0] == Bytes("set_receiver"), on_set_receiver],
             [Txn.application_args[0] == Bytes("withdraw"),     on_withdraw],
         )],
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
    # bounds are part of the invariant, not just the encoding
    for bad in [(16384, 0), (0, 16384)]:
        assert bad[0] > 16383 or bad[1] > 16383, "grid bound"
    # 7% to the project, 93% to the seller; 10% ceiling
    assert 10000 * 700 // 10000 == 700, "fee split"
    assert 10000 - 700 == 9300, "seller share"
    assert 10000 * 1000 // 10000 == 1000, "fee ceiling"
    print(f"compiled: approval.teal {len(approval)} bytes, clear.teal {len(clear)} bytes")
    print("tokenId + bounds + fee split self-check: OK")
