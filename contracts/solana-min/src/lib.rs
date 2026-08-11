//! CryptoLandTile — minimal Solana program.
//!
//! WHY THIS EXISTS
//! Solana charges rent by program size: (bytes + 173) * 6960 lamports. The Anchor
//! build is 207,488 bytes — 1.45 SOL, ~$110 — and an *empty* Anchor program is
//! 152,528 of that. Even an empty program using the standard `entrypoint!` macro
//! is 22,240 bytes, because the macro links a bump allocator, a panic handler and
//! AccountInfo deserialisation that builds a heap Vec.
//!
//! This is `#![no_std]` with a raw entrypoint that reads Solana's input buffer in
//! place. Nothing is allocated and nothing is formatted, which is what takes it
//! under 10 KB.
//!
//! WHAT IT DELIBERATELY DOES NOT DO
//! No CPI, no PDAs, no SPL-token payment. Sales are opened by the owner setting a
//! price, and tile claims are recorded as a counter plus the last minted id. That
//! is the same surface the Algorand build ships. Anything involving moving user
//! funds is left out on purpose: hand-written account validation is where Solana
//! programs get drained, and the value here is proving the tokenId invariant on a
//! fifth VM, not re-implementing an escrow.
#![no_std]
#![allow(unexpected_cfgs)]

/// SBF has no stable inline asm. Nothing reaches this: every fallible path
/// returns an error code rather than panicking.
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    loop {}
}

const GRID_MAX: u64 = 16383;
const MAX_FEE_BPS: u64 = 1000;
/// (16383 << 15) | 16383 — the canonical far-corner id, identical on EVM,
/// Soroban, MultiversX and Cairo.
const MAX_TOKEN_ID: u64 = 536854527;

// Registry account layout, little-endian, 96 bytes:
//   0..32   owner pubkey
//  32..64   treasury receiver pubkey
//  64..72   total minted (u64)
//  72..80   tile price in lamports (u64), 0 = sales closed
//  80..88   market fee bps (u64), ceiling 1000
//  88..96   last minted token id (u64)
const OWNER: usize = 0;
const RECV: usize = 32;
const TOTAL: usize = 64;
const PRICE: usize = 72;
const FEE: usize = 80;
const LAST_ID: usize = 88;
const REG_LEN: usize = 96;

const OK: u64 = 0;
const ERR: u64 = 1;

/// Bit-packed tile id. The bounds are load-bearing, not decorative: without them
/// (0, 32768) and (1, 0) both produce 32768 — one id for two tiles. That exact
/// collision shipped in the EVM contract and survived 39 unit tests.
#[inline(always)]
fn token_id(tx: u64, ty: u64) -> Option<u64> {
    if tx > GRID_MAX || ty > GRID_MAX {
        return None;
    }
    Some((tx << 15) | ty)
}

#[inline(always)]
unsafe fn rd64(p: *const u8) -> u64 {
    let mut b = [0u8; 8];
    core::ptr::copy_nonoverlapping(p, b.as_mut_ptr(), 8);
    u64::from_le_bytes(b)
}

#[inline(always)]
unsafe fn wr64(p: *mut u8, v: u64) {
    core::ptr::copy_nonoverlapping(v.to_le_bytes().as_ptr(), p, 8);
}

#[inline(always)]
unsafe fn keys_eq(a: *const u8, b: *const u8) -> bool {
    let mut i = 0;
    while i < 32 {
        if *a.add(i) != *b.add(i) {
            return false;
        }
        i += 1;
    }
    true
}

/// Solana's entrypoint buffer:
///   u64 num_accounts
///   per account: u8 dup | u8 signer | u8 writable | u8 executable | u32 pad
///                32 key | 32 owner | u64 lamports | u64 data_len | data
///                10240 realloc slack | pad to 8 | u64 rent_epoch
///   u64 instruction_data_len | instruction_data | 32 program_id
#[no_mangle]
pub unsafe extern "C" fn entrypoint(input: *mut u8) -> u64 {
    let mut p = input;
    let num = rd64(p);
    p = p.add(8);
    if num < 2 {
        return ERR;
    }

    // ---- account 0: the registry (writable, holds state) ----
    if *p != 0xff {
        return ERR;
    }
    let reg_writable = *p.add(2) != 0;
    p = p.add(8);
    let _reg_key = p;
    p = p.add(32);
    let _reg_owner = p;
    p = p.add(32);
    p = p.add(8); // lamports
    let reg_len = rd64(p) as usize;
    p = p.add(8);
    let reg_data = p;
    if !reg_writable || reg_len < REG_LEN {
        return ERR;
    }
    p = p.add(reg_len + 10240);
    p = p.add(p.align_offset(8));
    p = p.add(8); // rent_epoch

    // ---- account 1: the signer ----
    if *p != 0xff {
        return ERR;
    }
    let is_signer = *p.add(1) != 0;
    p = p.add(8);
    let signer_key = p;
    p = p.add(32);
    p = p.add(32); // owner
    p = p.add(8); // lamports
    let s_len = rd64(p) as usize;
    p = p.add(8);
    p = p.add(s_len + 10240);
    p = p.add(p.align_offset(8));
    p = p.add(8);
    if !is_signer {
        return ERR;
    }

    // ---- instruction data ----
    let ix_len = rd64(p) as usize;
    p = p.add(8);
    if ix_len < 1 {
        return ERR;
    }
    let tag = *p;
    let arg = p.add(1);
    let argn = ix_len - 1;

    let owner_is_signer = keys_eq(reg_data.add(OWNER), signer_key);

    match tag {
        // initialize: claims an uninitialised registry for the caller.
        0 => {
            // Refuse if an owner is already set — otherwise anyone re-inits and
            // takes the contract.
            let mut zero = true;
            let mut i = 0;
            while i < 32 {
                if *reg_data.add(OWNER + i) != 0 {
                    zero = false;
                    break;
                }
                i += 1;
            }
            if !zero {
                return ERR;
            }
            core::ptr::copy_nonoverlapping(signer_key, reg_data.add(OWNER), 32);
            core::ptr::copy_nonoverlapping(signer_key, reg_data.add(RECV), 32);
            wr64(reg_data.add(TOTAL), 0);
            wr64(reg_data.add(PRICE), 0); // sales closed until the owner opens them
            wr64(reg_data.add(FEE), 700); // 7%
            wr64(reg_data.add(LAST_ID), 0);
        }
        // set_tile_price(u64)
        1 => {
            if !owner_is_signer || argn < 8 {
                return ERR;
            }
            wr64(reg_data.add(PRICE), rd64(arg));
        }
        // set_market_fee_bps(u64), hard ceiling 10%
        2 => {
            if !owner_is_signer || argn < 8 {
                return ERR;
            }
            let f = rd64(arg);
            if f > MAX_FEE_BPS {
                return ERR;
            }
            wr64(reg_data.add(FEE), f);
        }
        // set_treasury_receiver(pubkey)
        3 => {
            if !owner_is_signer || argn < 32 {
                return ERR;
            }
            core::ptr::copy_nonoverlapping(arg, reg_data.add(RECV), 32);
        }
        // claim_tile(u64 tx, u64 ty)
        4 => {
            if argn < 16 {
                return ERR;
            }
            if rd64(reg_data.add(PRICE)) == 0 {
                return ERR; // sales closed
            }
            let id = match token_id(rd64(arg), rd64(arg.add(8))) {
                Some(v) => v,
                None => return ERR,
            };
            let t = match rd64(reg_data.add(TOTAL)).checked_add(1) {
                Some(v) => v,
                None => return ERR,
            };
            wr64(reg_data.add(TOTAL), t);
            wr64(reg_data.add(LAST_ID), id);
        }
        // token_id_from_key(u64 tx, u64 ty) — writes the result to LAST_ID so it
        // is readable without a return-data syscall.
        5 => {
            if argn < 16 {
                return ERR;
            }
            let id = match token_id(rd64(arg), rd64(arg.add(8))) {
                Some(v) => v,
                None => return ERR,
            };
            if id > MAX_TOKEN_ID {
                return ERR;
            }
            wr64(reg_data.add(LAST_ID), id);
        }
        _ => return ERR,
    }
    OK
}
