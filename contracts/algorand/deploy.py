"""Deploy CryptoLandTile to Algorand mainnet.

The app stores two byte-slices (owner, receiver) and four uints (total, price,
fee_bps, treasury) at creation, plus ONE uint per claimed tile under a `t:<id>`
key. Algorand fixes global schema at creation and it can never be raised
afterwards, so the tile slots have to be reserved up front — this is the one
deployment parameter that cannot be corrected by a later transaction.

64 uints is the protocol maximum for global state; 6 are taken by the fixed
fields, leaving 58 for tiles. That is a real ceiling on this design, recorded
here rather than discovered in production.

  ALGOD=https://mainnet-api.algonode.cloud python deploy.py
"""
import base64
import json
import os
import sys

from algosdk import account, mnemonic, transaction
from algosdk.v2client import algod

ALGOD = os.environ.get("ALGOD", "https://mainnet-api.algonode.cloud")
ACCOUNTS = os.path.join(os.path.dirname(__file__), "..", ".testnet", "accounts.json")

# Global schema. Byte-slices: owner, receiver. Uints: total, price, fee_bps,
# treasury + one per claimed tile.
GLOBAL_BYTES = 2
GLOBAL_UINTS = 62          # 4 fixed + 58 tile slots; 64 total is the max
LOCAL_BYTES = 0
LOCAL_UINTS = 0


def compile_teal(client, path):
    src = open(path).read()
    return base64.b64decode(client.compile(src)["result"])


def main():
    acc = json.load(open(ACCOUNTS))["algorand"]
    sk = mnemonic.to_private_key(acc["mnemonic"])
    sender = account.address_from_private_key(sk)
    if sender != acc["address"]:
        sys.exit(f"key/address mismatch: {sender} != {acc['address']}")

    client = algod.AlgodClient("", ALGOD)
    info = client.account_info(sender)
    print(f"   sender  {sender}")
    print(f"   balance {info['amount'] / 1e6} ALGO")

    approval = compile_teal(client, os.path.join(os.path.dirname(__file__), "approval.teal"))
    clear = compile_teal(client, os.path.join(os.path.dirname(__file__), "clear.teal"))
    print(f"   approval {len(approval)} bytes, clear {len(clear)} bytes")

    params = client.suggested_params()
    txn = transaction.ApplicationCreateTxn(
        sender=sender,
        sp=params,
        on_complete=transaction.OnComplete.NoOpOC,
        approval_program=approval,
        clear_program=clear,
        global_schema=transaction.StateSchema(GLOBAL_UINTS, GLOBAL_BYTES),
        local_schema=transaction.StateSchema(LOCAL_UINTS, LOCAL_BYTES),
    )
    txid = client.send_transaction(txn.sign(sk))
    print(f"   txid    {txid}")
    res = transaction.wait_for_confirmation(client, txid, 8)
    app_id = res["application-index"]
    print(f"   APP ID  {app_id}")
    print(f"   address {transaction.logic.get_application_address(app_id)}")


main()
