//! The cross-chain invariants, in one place, depending on nothing.
//!
//! Each contract embeds its own copy of this arithmetic because a shared crate
//! cannot be linked into a Move module or a FunC cell. `src/test/contracts.test.js`
//! is what enforces that every implementation still agrees with this one — it
//! reads all 13 sources and checks the constants directly.
//!
//! This crate exists so the arithmetic is EXECUTED somewhere that no SDK can
//! break. near-sdk and soroban both, at different times, made their contract's
//! own test suite unrunnable; this one has no dependencies to break.

/// Highest valid tile coordinate on the Z14 grid (16384 × 16384).
pub const GRID_MAX: u64 = 16383;
/// Resale fee in basis points. 700 = 7%.
pub const DEFAULT_FEE_BPS: u64 = 700;
/// Hard ceiling: even a stolen owner key cannot confiscate a sale.
pub const MAX_FEE_BPS: u64 = 1000;

/// `(tx << 15) | ty` — the encoding every chain must agree on.
///
/// Cairo, Aiken and CameLIGO have no shift operator and compute
/// `(tx * 32768) + ty` instead. The forms are identical **only because**
/// `ty <= 16383 < 2^15`, so the OR never carries into the high bits. That makes
/// the bound load-bearing rather than merely defensive.
pub fn pack(tx: u64, ty: u64) -> Option<u64> {
    if tx > GRID_MAX || ty > GRID_MAX {
        return None;
    }
    Some((tx << 15) | ty)
}

pub fn unpack(token_id: u64) -> (u64, u64) {
    (token_id >> 15, token_id & 0x7FFF)
}

/// What the project takes from a resale.
pub fn project_share(price: u64, fee_bps: u64) -> u64 {
    price * fee_bps / 10_000
}

/// What the seller keeps.
pub fn seller_share(price: u64, fee_bps: u64) -> u64 {
    price - project_share(price, fee_bps)
}

pub fn valid_fee(bps: u64) -> bool {
    bps <= MAX_FEE_BPS
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The five pairs every one of the 13 implementations asserts.
    #[test]
    fn token_id_matches_every_chain() {
        assert_eq!(pack(0, 0), Some(0));
        assert_eq!(pack(1, 0), Some(32768));
        assert_eq!(pack(0, 1), Some(1));
        assert_eq!(pack(100, 200), Some(3_277_000));
        assert_eq!(pack(16383, 16383), Some(536_854_527));
    }

    /// Verified on-chain on Stellar testnet, 2026-07-31:
    /// `token_id(16383,16383) = 536854527`.
    #[test]
    fn far_corner_matches_the_live_deployment() {
        assert_eq!(pack(16383, 16383), Some(536_854_527));
    }

    #[test]
    fn multiply_form_equals_shift_form_across_the_whole_grid() {
        // The shift-free chains are only correct because ty stays below 2^15.
        for tx in [0u64, 1, 999, 16383] {
            for ty in [0u64, 1, 999, 16383] {
                assert_eq!(pack(tx, ty).unwrap(), tx * 32768 + ty);
            }
        }
    }

    #[test]
    fn rejects_coordinates_past_the_grid() {
        assert_eq!(pack(16384, 0), None);
        assert_eq!(pack(0, 16384), None);
        assert_eq!(pack(u64::MAX, 0), None);
    }

    #[test]
    fn round_trips_everywhere_it_is_defined() {
        for tx in [0u64, 1, 12345, 16383] {
            for ty in [0u64, 1, 6789, 16383] {
                assert_eq!(unpack(pack(tx, ty).unwrap()), (tx, ty));
            }
        }
    }

    #[test]
    fn fee_split_is_7_percent_by_default() {
        assert_eq!(project_share(10_000, DEFAULT_FEE_BPS), 700);
        assert_eq!(seller_share(10_000, DEFAULT_FEE_BPS), 9_300);
    }

    #[test]
    fn shares_always_reconstitute_the_price() {
        for price in [1u64, 999, 10_000, 1_000_000, 123_456_789] {
            for bps in [0u64, 1, 700, 1000] {
                assert_eq!(
                    project_share(price, bps) + seller_share(price, bps),
                    price,
                    "price {price} at {bps} bps must not lose or create value",
                );
            }
        }
    }

    #[test]
    fn ceiling_is_ten_percent_inclusive() {
        assert!(valid_fee(0));
        assert!(valid_fee(700));
        assert!(valid_fee(1000)); // exactly 10% — accepted on-chain
        assert!(!valid_fee(1001)); // Stellar returned Error(Contract, #4) here
    }
}
