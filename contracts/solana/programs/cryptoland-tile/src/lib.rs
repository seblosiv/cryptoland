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

declare_id!("CLND1111111111111111111111111111111111111111");

pub const GRID_MAX: u64 = 16383;
pub const COORD_SHIFT: u64 = 15;

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
        Ok(())
    }

    pub fn mint_tile(ctx: Context<MintTile>, tx: u32, ty: u32) -> Result<()> {
        // Seeds take the 4-byte LE form; coords are bounded to 16383 so u32 is exact.
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
}

#[account]
pub struct Registry {
    pub owner: Pubkey,
    pub base_uri: String,
    pub total: u64,
    pub bump: u8,
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
    #[account(init, payer = owner, space = 8 + 32 + 4 + 128 + 8 + 1, seeds = [b"registry"], bump)]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub owner: Signer<'info>,
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
