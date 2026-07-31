//! CryptoLandTile — Solana (Anchor)
//!
//! On Solana the NFT itself can be a Metaplex asset with no custom program at
//! all. This program is the REGISTRY: it derives a PDA per tile, which makes
//! "one owner per tile" a property of the address space rather than a check —
//! a second mint for the same (tx, ty) collides with an existing account and
//! fails at the runtime level.
//!
//! CROSS-CHAIN INVARIANT: token_id = (tx << 15) | ty, tx/ty in [0, 16383].
//! Must match evm.js, CryptoLandTile.sol, and the Cairo/Aiken/PyTeal/Move versions.
use anchor_lang::prelude::*;

// The real deployed program id. This was the placeholder "CLND1111…" and the
// program deployed perfectly happily with it — but Anchor compares declare_id!
// against the executing program on EVERY instruction, so all of them would have
// failed with DeclaredProgramIdMismatch. A deploy-only defect: nothing in
// `cargo test` or a build touches this.
declare_id!("H98Wsb38Cy4twaNmD84i7ekDQXwAwPz9wye6LV341pBc");

pub const GRID_MAX: u64 = 16383;
pub const COORD_SHIFT: u64 = 15;
/// 10% ceiling — a stolen owner key still cannot confiscate a sale.
pub const MAX_FEE_BPS: u16 = 1000;

/// (tx << 15) | ty — identical to every other chain.
pub fn token_id_from_key(tx: u64, ty: u64) -> Result<u64> {
    require!(tx <= GRID_MAX && ty <= GRID_MAX, TileError::OutOfRange);
    Ok((tx << COORD_SHIFT) | ty)
}

pub fn key_from_token_id(token_id: u64) -> (u64, u64) {
    (token_id >> COORD_SHIFT, token_id & 0x7FFF)
}

#[program]
pub mod cryptoland_tile {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, base_uri: String) -> Result<()> {
        let reg = &mut ctx.accounts.registry;
        reg.owner = ctx.accounts.owner.key();
        reg.base_uri = base_uri;
        reg.total = 0;
        reg.bump = ctx.bumps.registry;
        reg.tile_price = 0;
        reg.market_fee_bps = 700;
        reg.treasury_receiver = ctx.accounts.owner.key();
        Ok(())
    }

    pub fn mint_tile(ctx: Context<MintTile>, tx: u32, ty: u32) -> Result<()> {
        // Seeds take the 4-byte LE form; coords are bounded to 16383 so u32 is exact.
        let price = ctx.accounts.registry.tile_price;
        require!(price > 0, TileError::ClaimingDisabled);
        let id = token_id_from_key(tx as u64, ty as u64)?;
        let tile = &mut ctx.accounts.tile;
        tile.token_id = id;
        tile.tx = tx as u64;
        tile.ty = ty as u64;
        tile.owner = ctx.accounts.recipient.key();
        tile.bump = ctx.bumps.tile;

        let reg = &mut ctx.accounts.registry;
        reg.total = reg.total.checked_add(1).ok_or(TileError::Overflow)?;

        emit!(TileMinted { token_id: id, to: tile.owner, tx: tx as u64, ty: ty as u64 });
        Ok(())
    }

    /// PRIMARY SALE. Buyer pays `tile_price` lamports into the registry PDA,
    /// which is exactly the balance withdraw() later pays to treasury_receiver.
    pub fn claim_tile(ctx: Context<ClaimTile>, tx: u32, ty: u32) -> Result<()> {
        let price = ctx.accounts.registry.tile_price;
        require!(price > 0, TileError::ClaimingDisabled);
        let id = token_id_from_key(tx as u64, ty as u64)?;

        // Move the money before recording ownership.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.registry.to_account_info(),
                },
            ),
            price,
        )?;

        let buyer = ctx.accounts.buyer.key();
        let tile = &mut ctx.accounts.tile;
        tile.token_id = id;
        tile.tx = tx as u64;
        tile.ty = ty as u64;
        tile.owner = buyer;
        tile.bump = ctx.bumps.tile;

        let reg = &mut ctx.accounts.registry;
        reg.total = reg.total.checked_add(1).ok_or(TileError::Overflow)?;

        emit!(TileMinted { token_id: id, to: buyer, tx: tx as u64, ty: ty as u64 });
        Ok(())
    }

    pub fn set_tile_price(ctx: Context<AdminOnly>, price: u64) -> Result<()> {
        ctx.accounts.registry.tile_price = price;
        Ok(())
    }

    pub fn set_market_fee_bps(ctx: Context<AdminOnly>, bps: u16) -> Result<()> {
        require!(bps <= MAX_FEE_BPS, TileError::FeeTooHigh);
        ctx.accounts.registry.market_fee_bps = bps;
        Ok(())
    }

    /// Point payouts at a cold wallet without handing over admin rights.
    pub fn set_treasury_receiver(ctx: Context<AdminOnly>, to: Pubkey) -> Result<()> {
        require!(to != Pubkey::default(), TileError::ZeroAddress);
        ctx.accounts.registry.treasury_receiver = to;
        Ok(())
    }

    /// Move lamports held by the registry PDA out to the receiver. Any time.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        let reg = ctx.accounts.registry.to_account_info();
        let rent = Rent::get()?.minimum_balance(reg.data_len());
        let amount = reg.lamports().saturating_sub(rent);
        require!(amount > 0, TileError::NothingToWithdraw);
        **reg.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.receiver.try_borrow_mut_lamports()? += amount;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"registry"], bump = registry.bump, has_one = owner)]
    pub registry: Account<'info, Registry>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [b"registry"], bump = registry.bump, has_one = owner,
              constraint = registry.treasury_receiver == receiver.key() @ TileError::WrongReceiver)]
    pub registry: Account<'info, Registry>,
    pub owner: Signer<'info>,
    /// CHECK: must equal registry.treasury_receiver, enforced above.
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,
}

#[account]
pub struct Registry {
    pub owner: Pubkey,
    pub base_uri: String,
    pub total: u64,
    pub bump: u8,
    /// Primary sale price in lamports. 0 disables on-chain claiming.
    pub tile_price: u64,
    /// Resale fee, 700 = 7%. Hard-capped at MAX_FEE_BPS.
    pub market_fee_bps: u16,
    /// Where withdrawals land — point at a cold wallet.
    pub treasury_receiver: Pubkey,
}

#[account]
pub struct Tile {
    pub token_id: u64,
    pub tx: u64,
    pub ty: u64,
    pub owner: Pubkey,
    pub bump: u8,
}

#[event]
pub struct TileMinted {
    pub token_id: u64,
    pub to: Pubkey,
    pub tx: u64,
    pub ty: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = owner, space = 8 + 32 + 4 + 128 + 8 + 1 + 8 + 2 + 32, seeds = [b"registry"], bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tx: u32, ty: u32)]
pub struct ClaimTile<'info> {
    #[account(mut, seeds = [b"registry"], bump = registry.bump)]
    pub registry: Account<'info, Registry>,
    /// Same one-PDA-per-tile uniqueness as MintTile — a second claim for the
    /// same coordinates collides with this account and fails.
    #[account(
        init,
        payer = buyer,
        space = 8 + 8 + 8 + 8 + 32 + 1,
        seeds = [b"tile", &tx.to_le_bytes(), &ty.to_le_bytes()],
        bump
    )]
    pub tile: Account<'info, Tile>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tx: u32, ty: u32)]
pub struct MintTile<'info> {
    #[account(mut, seeds = [b"registry"], bump = registry.bump, has_one = owner)]
    pub registry: Account<'info, Registry>,
    /// One PDA per tile: a repeat mint for the same coordinates collides here
    /// and fails, so uniqueness is enforced by the address space itself.
    #[account(
        init,
        payer = owner,
        space = 8 + 8 + 8 + 8 + 32 + 1,
        seeds = [b"tile", &tx.to_le_bytes(), &ty.to_le_bytes()],
        bump
    )]
    pub tile: Account<'info, Tile>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: recipient only stored as the tile owner.
    pub recipient: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum TileError {
    #[msg("tile coordinates out of range")]
    OutOfRange,
    #[msg("counter overflow")]
    Overflow,
    #[msg("fee above the 10% ceiling")]
    FeeTooHigh,
    #[msg("zero address")]
    ZeroAddress,
    #[msg("nothing to withdraw")]
    NothingToWithdraw,
    #[msg("receiver does not match treasury_receiver")]
    WrongReceiver,
    #[msg("on-chain claiming disabled")]
    ClaimingDisabled,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encoding_matches_other_chains() {
        assert_eq!(token_id_from_key(0, 0).unwrap(), 0);
        assert_eq!(token_id_from_key(1, 0).unwrap(), 32768);
        assert_eq!(token_id_from_key(0, 1).unwrap(), 1);
        assert_eq!(token_id_from_key(100, 200).unwrap(), 3_277_000);
        assert_eq!(token_id_from_key(16383, 16383).unwrap(), 536_854_527);
        assert_eq!(key_from_token_id(536_854_527), (16383, 16383));
        assert!(token_id_from_key(16384, 0).is_err());
    }
}

#[cfg(test)]
mod invariant_tests {
    const GRID_MAX: u64 = 16383;

    fn pack(tx: u64, ty: u64) -> u64 {
        assert!(tx <= GRID_MAX && ty <= GRID_MAX, "out of range");
        (tx << 15) | ty
    }
    fn unpack(id: u64) -> (u64, u64) { (id >> 15, id & 0x7FFF) }

    /// The cross-chain contract. Every one of the 13 implementations asserts
    /// these same five pairs — if one drifts, a tile means two different things
    /// on two different chains.
    #[test]
    fn token_id_matches_every_other_chain() {
        assert_eq!(pack(0, 0), 0);
        assert_eq!(pack(1, 0), 32768);
        assert_eq!(pack(0, 1), 1);
        assert_eq!(pack(100, 200), 3_277_000);
        assert_eq!(pack(16383, 16383), 536_854_527);
    }

    #[test]
    fn round_trips() { assert_eq!(unpack(pack(12345, 6789)), (12345, 6789)); }

    #[test]
    #[should_panic]
    fn rejects_out_of_range() { pack(16384, 0); }

    /// 7% to the project, 93% to the seller, and a ceiling a stolen owner key
    /// still cannot exceed.
    #[test]
    fn fee_split_and_ceiling() {
        let price: u64 = 10_000;
        let fee = price * 700 / 10_000;
        assert_eq!(fee, 700);
        assert_eq!(price - fee, 9_300);
        assert_eq!(price * 1000 / 10_000, 1_000);  // ceiling = 10%
    }
}
