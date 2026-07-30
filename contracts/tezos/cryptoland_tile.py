"""CryptoLandTile — Tezos (SmartPy, FA2 / TZIP-12)

CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
Must match evm.js, CryptoLandTile.sol, and the Cairo/Aiken/PyTeal/Move versions.
Michelson has no shift on nat in SmartPy's surface syntax, so this is
(tx * 32768) + ty — identical because ty < 2^15 means the OR never carries.
Same reasoning as the Cairo and Aiken versions.
"""
import smartpy as sp

GRID_MAX = 16383
COORD_SHIFT = 32768  # 2^15


@sp.module
def main():
    class CryptoLandTile(sp.Contract):
        def __init__(self, administrator, metadata_base):
            self.data.administrator = administrator
            self.data.metadata_base = metadata_base
            self.data.ledger = sp.cast(
                sp.big_map({}), sp.big_map[sp.nat, sp.address]
            )
            self.data.total = sp.nat(0)

        @sp.private(with_storage="read-only")
        def token_id_from_key(self, params):
            """(tx << 15) | ty, as multiply-add."""
            sp.cast(params, sp.record(tx=sp.nat, ty=sp.nat))
            assert params.tx <= 16383, "TX_OUT_OF_RANGE"
            assert params.ty <= 16383, "TY_OUT_OF_RANGE"
            return params.tx * 32768 + params.ty

        @sp.entrypoint
        def mint_tile(self, params):
            sp.cast(params, sp.record(to_=sp.address, tx=sp.nat, ty=sp.nat))
            assert sp.sender == self.data.administrator, "FA2_NOT_ADMIN"
            token_id = self.token_id_from_key(
                sp.record(tx=params.tx, ty=params.ty)
            )
            assert not self.data.ledger.contains(token_id), "TILE_ALREADY_CLAIMED"
            self.data.ledger[token_id] = params.to_
            self.data.total += 1

        @sp.entrypoint
        def transfer(self, batch):
            """Minimal FA2 transfer: one owner per tile, so amounts are 0 or 1."""
            sp.cast(
                batch,
                sp.list[
                    sp.record(
                        from_=sp.address,
                        txs=sp.list[
                            sp.record(to_=sp.address, token_id=sp.nat, amount=sp.nat)
                        ],
                    )
                ],
            )
            for transfer in batch:
                for tx in transfer.txs:
                    assert self.data.ledger.contains(tx.token_id), "FA2_TOKEN_UNDEFINED"
                    assert self.data.ledger[tx.token_id] == transfer.from_, "FA2_NOT_OWNER"
                    assert sp.sender == transfer.from_, "FA2_NOT_OPERATOR"
                    if tx.amount > 0:
                        assert tx.amount == 1, "FA2_INSUFFICIENT_BALANCE"
                        self.data.ledger[tx.token_id] = tx.to_

        @sp.onchain_view
        def get_owner(self, token_id):
            sp.cast(token_id, sp.nat)
            return self.data.ledger[token_id]

        @sp.onchain_view
        def total_minted(self):
            return self.data.total


if __name__ == "__main__":
    # Encoding self-check against the canonical values every chain must agree on.
    for tx, ty, want in [(0, 0, 0), (1, 0, 32768), (0, 1, 1),
                         (100, 200, 3277000), (16383, 16383, 536854527)]:
        got = tx * COORD_SHIFT + ty
        assert got == want, f"({tx},{ty}) -> {got} != {want}"
        assert got == ((tx << 15) | ty), "multiply-add diverges from shift-or"
    print("tokenId encoding self-check: OK (matches (tx << 15) | ty)")


@sp.add_test()
def test():
    scenario = sp.test_scenario("CryptoLandTile", main)
    admin = sp.test_account("admin")
    alice = sp.test_account("alice")
    c = main.CryptoLandTile(admin.address, "https://tezos.xono.ai/metadata/")
    scenario += c
    c.mint_tile(to_=alice.address, tx=100, ty=200, _sender=admin)
    scenario.verify(c.data.ledger[3277000] == alice.address)
    scenario.verify(c.data.total == 1)
