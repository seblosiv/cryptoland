(* CryptoLandTile — Tezos (CameLIGO, FA2 / TZIP-12)
   ================================================
   Rewritten from SmartPy to CameLIGO because SmartPy has no installable CLI on
   ARM Linux (the pip package of that name is an unrelated project, and both
   documented installers return HTML). LIGO ships an ARM64 binary, so this one
   actually compiles.

   CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
   Michelson nat has no shift in LIGO's surface syntax, so this is
   (tx * 32768) + ty — identical because ty < 2^15 means the OR never carries.
   Same reasoning as the Cairo and Aiken versions. *)

type storage = {
  administrator      : address;
  ledger             : (nat, address) big_map;
  total              : nat;
  (* Primary sale price in mutez. 0n disables on-chain claiming. *)
  tile_price         : tez;
  (* Resale fee, 700 = 7%. Capped at 1000 (10%). *)
  market_fee_bps     : nat;
  (* 100% of primary sales + the resale cut. *)
  treasury           : tez;
  (* Payout target — point at a cold wallet, separable from the admin. *)
  treasury_receiver  : address;
  metadata_base      : string;
}

type claim_params = { tx : nat ; ty : nat }
type transfer_dst = { to_ : address ; token_id : nat ; amount : nat }
type transfer_item = { from_ : address ; txs : transfer_dst list }

type parameter =
  | Claim_tile of claim_params
  | Set_tile_price of tez
  | Set_market_fee_bps of nat
  | Set_treasury_receiver of address
  | Withdraw
  | Transfer of transfer_item list

type return = operation list * storage

let max_fee_bps : nat = 1000n
let grid_max    : nat = 16383n
let coord_shift : nat = 32768n

(* (tx << 15) | ty — identical to every other chain. *)
let token_id_from_key (tx, ty : nat * nat) : nat =
  let () = assert_with_error (tx <= grid_max) "TX_OUT_OF_RANGE" in
  let () = assert_with_error (ty <= grid_max) "TY_OUT_OF_RANGE" in
  tx * coord_shift + ty

let require_admin (s : storage) : unit =
  assert_with_error (Tezos.get_sender () = s.administrator) "NOT_ADMIN"

(* PRIMARY SALE: 100% of the payment becomes treasury. *)
let claim_tile (p, s : claim_params * storage) : return =
  let () = assert_with_error (s.tile_price > 0mutez) "CLAIMING_DISABLED" in
  let () = assert_with_error (Tezos.get_amount () >= s.tile_price) "INSUFFICIENT_PAYMENT" in
  let token_id = token_id_from_key (p.tx, p.ty) in
  let () = match Big_map.find_opt token_id s.ledger with
    | Some _ -> failwith "TILE_ALREADY_CLAIMED"
    | None -> unit in
  let buyer = Tezos.get_sender () in
  ([] : operation list), {
    s with
      ledger   = Big_map.add token_id buyer s.ledger;
      total    = s.total + 1n;
      treasury = s.treasury + s.tile_price;
  }

let set_tile_price (price, s : tez * storage) : return =
  let () = require_admin s in
  ([] : operation list), { s with tile_price = price }

let set_market_fee_bps (bps, s : nat * storage) : return =
  let () = require_admin s in
  let () = assert_with_error (bps <= max_fee_bps) "FEE_ABOVE_CEILING" in
  ([] : operation list), { s with market_fee_bps = bps }

(* Point payouts at a cold wallet without handing over admin rights. *)
let set_treasury_receiver (addr, s : address * storage) : return =
  let () = require_admin s in
  ([] : operation list), { s with treasury_receiver = addr }

(* Entire treasury to the receiver. Zeroed BEFORE the operation is emitted. *)
let withdraw (s : storage) : return =
  let () = require_admin s in
  let () = assert_with_error (s.treasury > 0mutez) "NOTHING_TO_WITHDRAW" in
  let amount = s.treasury in
  let receiver : unit contract =
    match (Tezos.get_contract_opt s.treasury_receiver : unit contract option) with
    | Some c -> c
    | None -> failwith "BAD_RECEIVER" in
  let op = Tezos.transaction unit amount receiver in
  [op], { s with treasury = 0mutez }

(* Minimal FA2 transfer: one owner per tile, so amounts are 0 or 1. *)
let transfer (batch, s : transfer_item list * storage) : return =
  let apply_item = fun (acc, item : storage * transfer_item) ->
    let apply_tx = fun (st, d : storage * transfer_dst) ->
      let owner = match Big_map.find_opt d.token_id st.ledger with
        | Some o -> o
        | None -> failwith "FA2_TOKEN_UNDEFINED" in
      let () = assert_with_error (owner = item.from_) "FA2_NOT_OWNER" in
      let () = assert_with_error (Tezos.get_sender () = item.from_) "FA2_NOT_OPERATOR" in
      if d.amount = 0n then st
      else
        let () = assert_with_error (d.amount = 1n) "FA2_INSUFFICIENT_BALANCE" in
        { st with ledger = Big_map.update d.token_id (Some d.to_) st.ledger }
    in List.fold apply_tx item.txs acc
  in ([] : operation list), List.fold apply_item batch s

[@entry]
let main (action : parameter) (s : storage) : return =
  match action with
  | Claim_tile p             -> claim_tile (p, s)
  | Set_tile_price price     -> set_tile_price (price, s)
  | Set_market_fee_bps bps   -> set_market_fee_bps (bps, s)
  | Set_treasury_receiver a  -> set_treasury_receiver (a, s)
  | Withdraw                 -> withdraw s
  | Transfer batch           -> transfer (batch, s)
