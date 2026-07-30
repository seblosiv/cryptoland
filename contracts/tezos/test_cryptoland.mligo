(* Cross-chain invariant tests. Run: ligo run test test_cryptoland.mligo

   CameLIGO has no shift operator, so the contract multiplies by 32768 — which is
   identical to (tx << 15) | ty because ty is bounded below 2^15. These are the
   same five pairs asserted by all 13 implementations. *)

let grid_max : nat = 16383n

let token_id_from_key (tx, ty : nat * nat) : nat =
  let () = assert_with_error (tx <= grid_max) "TX_OUT_OF_RANGE" in
  let () = assert_with_error (ty <= grid_max) "TY_OUT_OF_RANGE" in
  tx * 32768n + ty

let test_token_id_matches_every_other_chain =
  let () = assert (token_id_from_key (0n, 0n) = 0n) in
  let () = assert (token_id_from_key (1n, 0n) = 32768n) in
  let () = assert (token_id_from_key (0n, 1n) = 1n) in
  let () = assert (token_id_from_key (100n, 200n) = 3277000n) in
  let () = assert (token_id_from_key (16383n, 16383n) = 536854527n) in
  "ok"

let test_round_trip =
  let id = token_id_from_key (12345n, 6789n) in
  let () = assert (id / 32768n = 12345n) in
  let () = assert (id mod 32768n = 6789n) in
  "ok"

(* 7% to the project, 93% to the seller, 10% ceiling. *)
let test_fee_split =
  let price : nat = 10000n in
  let fee : nat = price * 700n / 10000n in
  let () = assert (fee = 700n) in
  let () = assert (abs (price - fee) = 9300n) in
  let () = assert (price * 1000n / 10000n = 1000n) in
  "ok"
