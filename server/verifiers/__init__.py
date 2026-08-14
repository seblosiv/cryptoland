"""
Per-family payment verifiers.

One module per adapter family, each exporting:

    async def verify(chain, tx_hash, treasury, min_amount, session) -> PaymentProof

`chain_pay.py` discovers them by filename, so adding a family is adding a file —
no registry to edit and no merge conflict when several are written at once.

Read `verify_evm` in chain_pay.py as the reference implementation, and
documentation/native-payments.md §6 for the invariants every verifier must hold.
The two that are easy to get wrong:

  * A transport failure is `pending`, NEVER a rejection. Public RPCs rot; "the
    node did not answer" must never reach a user as "you did not pay".
  * `paid` is what the TREASURY received, not the transaction's total value.
    A transaction can pay several recipients.
"""
