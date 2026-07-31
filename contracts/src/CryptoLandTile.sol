// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * CryptoLandTile — Universal ERC-721 Land NFT
 * =============================================
 * Deploys identically on: Polygon, Avalanche C-Chain, Base, Ethereum, and any EVM chain.
 * To deploy on a new chain: same contract, new RPC/constructor args, update config.js.
 *
 * Features:
 *   - ERC-721 compliant tile ownership (one NFT per tile coordinate)
 *   - Deterministic tokenId from tile coordinates: (tx << 15) | ty
 *     (Z14 grid: 16384×16384, tx/ty each 0–16383, fits in 29 bits)
 *   - Built-in marketplace: list/unlist/buy with protocol fee
 *   - On-chain metadata: tileKey, country, mintedAt stored per token
 *   - Configurable mint fee (bps) and marketplace fee (bps)
 *   - Enumerable: tokenOfOwnerByIndex for wallet portfolio reads
 *   - Emergency pause (Ownable pattern — upgradeable to multisig/DAO)
 *
 * Coordinate system:
 *   Z14 Web Mercator grid — 16384×16384 tiles (tx: 0–16383, ty: 0–16383)
 *   tokenId = (tx << 15) | ty  →  fits in uint29, well under uint256
 *
 * Fee flow:
 *   Mint:       msg.value goes to contract; owner withdraws via withdrawFees()
 *   Resale:     buyer sends priceWei; (priceWei * marketFeeBps / 10000) → contract;
 *               remainder → seller
 *
 * Roadmap hooks:
 *   - setMinter(address)     → whitelist backend minter for gasless mints
 *   - setGuardianContract()  → future Guardian yield contract
 *   - setTokenContract()     → future $CLND staking rewards
 */

// ── Minimal interfaces (no OpenZeppelin dependency for lean deploy) ────────────

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function setApprovalForAll(address operator, bool approved) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

// ── Contract ──────────────────────────────────────────────────────────────────

contract CryptoLandTile is IERC721Metadata {

    // ── Ownership ──────────────────────────────────────────────────────────
    address public owner;
    address public pendingOwner;
    address public minter;  // backend minter address (for gasless mint flow)

    modifier nonReentrant() {
        require(_entered == 1, "Reentrant call");
        _entered = 2;
        _;
        _entered = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOwnerOrMinter() {
        require(msg.sender == owner || msg.sender == minter, "Not authorized");
        _;
    }

    // ── ERC-721 storage ────────────────────────────────────────────────────
    string  private _name;
    string  private _symbol;
    string  private _baseURI;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ── Enumerable ──────────────────────────────────────────────────────────
    uint256[]                               private _allTokens;
    mapping(uint256 => uint256)             private _allTokensIndex;
    mapping(address => uint256[])           private _ownedTokens;
    mapping(uint256 => uint256)             private _ownedTokensIndex;

    // ── Tile metadata ───────────────────────────────────────────────────────
    struct TileData {
        string  tileKey;    // "tx:ty"
        string  country;
        uint256 mintedAt;   // block.timestamp
        uint256 listPrice;  // wei; 0 = not listed
        bool    listed;
    }
    mapping(uint256 => TileData) public tileData;
    mapping(string  => uint256)  public keyToTokenId;   // "tx:ty" → tokenId
    mapping(uint256 => bool)     public minted;

    // ── Fee parameters ──────────────────────────────────────────────────────
    // PRIMARY SALE: the project sells the land, so 100% of a claim goes to the
    // treasury. There is no "fee" on a primary sale — the whole payment is revenue.
    uint256 public tilePriceWei;          // 0 = on-chain claiming disabled
    // RESALE: the project takes a cut of peer-to-peer sales; the seller gets the rest.
    uint256 public marketFeeBps  = 700;   // 7% of resale price
    uint256 public constant MAX_FEE_BPS = 1000;  // hard ceiling: 10%, cannot be exceeded

    /// Z14 grid: 16384 x 16384. Highest valid coordinate on either axis.
    uint256 public constant GRID_MAX = 16383;
    /// tokenIdFromKey(16383, 16383) — the largest tokenId the grid can produce.
    uint256 public constant MAX_TOKEN_ID = 536854527;
    // Everything withdrawable by the owner: primary sales + resale fees.
    uint256 public treasury;
    /// Where withdrawals land. Defaults to `owner`, but can point at a COLD wallet
    /// so the day-to-day admin key never has to be the key holding the revenue.
    address public treasuryReceiver;

    /// Reentrancy guard. buy() pays a seller that may be a contract, which hands
    /// control to code we do not control. The ordering below is already
    /// checks-effects-interactions, but this makes the guarantee explicit so a
    /// later edit cannot silently break it.
    uint256 private _entered = 1;

    // ── Provenance ──────────────────────────────────────────────────────────
    // Written into the contract at construction and readable by any explorer,
    // wallet or marketplace. A fork can redeploy the code, but a redeployment
    // that keeps these values is visibly claiming to be us; one that changes
    // them is visibly not the official deployment. Costs one storage slot each
    // and settles "which contract is real" without a trademark fight.
    string public constant OFFICIAL_SITE = "https://xono.ai";
    string public constant PROJECT       = "CryptoLand";
    string public constant PUBLISHER     = "CryptoLand LTD, Mahe, Seychelles";

    // ── Pause ───────────────────────────────────────────────────────────────
    bool public paused;

    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }

    // ── Events ──────────────────────────────────────────────────────────────
    event TileMinted(uint256 indexed tokenId, address indexed owner, string tileKey, string country);
    event TileListed(uint256 indexed tokenId, address indexed seller, uint256 priceWei);
    event TileUnlisted(uint256 indexed tokenId, address indexed seller);
    event TilePriceUpdated(uint256 priceWei);
    event TreasuryReceiverUpdated(address indexed to);
    event TileSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 priceWei);
    event FeesWithdrawn(address to, uint256 amount);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event MinterChanged(address indexed previous, address indexed next);

    // ── Constructor ─────────────────────────────────────────────────────────
    constructor(string memory name_, string memory symbol_, string memory baseURI_) {
        _name    = name_;
        _symbol  = symbol_;
        _baseURI = baseURI_;
        owner    = msg.sender;
        minter   = msg.sender;
        // Payouts default to the deployer; setTreasuryReceiver() can point them at a
        // cold wallet later without handing over admin rights.
        treasuryReceiver = msg.sender;
    }

    // ── ERC-165 ─────────────────────────────────────────────────────────────
    function supportsInterface(bytes4 id) external pure override returns (bool) {
        return id == type(IERC721).interfaceId
            || id == type(IERC721Metadata).interfaceId
            || id == type(IERC165).interfaceId;
    }

    // ── ERC-721 Metadata ────────────────────────────────────────────────────
    function name()   external view override returns (string memory) { return _name; }
    function symbol() external view override returns (string memory) { return _symbol; }

    function tokenURI(uint256 tokenId) external view override returns (string memory) {
        require(minted[tokenId], "Token does not exist");
        return string(abi.encodePacked(_baseURI, _uint2str(tokenId)));
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseURI = uri;
    }

    // ── ERC-721 Core ────────────────────────────────────────────────────────
    function balanceOf(address addr) external view override returns (uint256) {
        require(addr != address(0), "Zero address");
        return _balances[addr];
    }

    function ownerOf(uint256 tokenId) external view override returns (address) {
        address a = _owners[tokenId];
        require(a != address(0), "Token does not exist");
        return a;
    }

    function approve(address to, uint256 tokenId) external override {
        address tileOwner = _owners[tokenId];
        require(msg.sender == tileOwner || _operatorApprovals[tileOwner][msg.sender], "Not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(tileOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view override returns (address) {
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external override {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address addr, address operator) external view override returns (bool) {
        return _operatorApprovals[addr][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) external override whenNotPaused {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved");
        _transfer(from, to, tokenId);
        // Automatically unlist on transfer
        if (tileData[tokenId].listed) {
            tileData[tokenId].listed    = false;
            tileData[tokenId].listPrice = 0;
        }
    }

    // ── Tile minting ────────────────────────────────────────────────────────

    /**
     * Deterministic tokenId from tile coordinates.
     * Matches tileTokenId() in src/lib/blockchain/adapters/evm.js
     */
    function tokenIdFromKey(uint256 tx_, uint256 ty_) public pure returns (uint256) {
        // The bound is LOAD-BEARING, not defensive. Without it the OR carries:
        // tokenIdFromKey(0, 32768) and tokenIdFromKey(1, 0) both returned 32768,
        // so two different tiles shared one id. Confirmed on-chain before the fix.
        require(tx_ <= GRID_MAX, "tx out of range");
        require(ty_ <= GRID_MAX, "ty out of range");
        return (tx_ << 15) | ty_;
    }

    /// True only for ids the grid can actually produce.
    function isValidTokenId(uint256 tokenId) public pure returns (bool) {
        return tokenId <= MAX_TOKEN_ID && (tokenId & 0x7FFF) <= GRID_MAX;
    }

    /**
     * PRIMARY SALE, on-chain. Anyone may claim an unowned tile by paying
     * `tilePriceWei`. The ENTIRE payment becomes treasury — this is the project
     * selling land, not a fee on someone else's trade.
     *
     * Overpayment is refunded so a stale price in a user's wallet cannot
     * silently overcharge them.
     *
     * Set `tilePriceWei = 0` to disable on-chain claiming and fall back to the
     * off-chain payment rail (NOWPayments) with `mint()` below.
     */
    function claimTile(
        uint256 tokenId,
        string calldata tileKey,
        string calldata country
    ) external payable whenNotPaused nonReentrant {
        require(tilePriceWei > 0, "On-chain claiming disabled");
        require(msg.value >= tilePriceWei, "Insufficient payment");
        // Without this a buyer could claim any uint256 — a "tile" nowhere on the
        // map, unreachable by the game and unsellable. Verified claimable
        // on-chain before the fix.
        require(isValidTokenId(tokenId), "tokenId off-grid");
        require(!minted[tokenId], "Already minted");
        require(bytes(tileKey).length > 0, "Empty tileKey");

        uint256 price = tilePriceWei;

        minted[tokenId]       = true;
        keyToTokenId[tileKey] = tokenId;
        tileData[tokenId] = TileData({
            tileKey:   tileKey,
            country:   country,
            mintedAt:  block.timestamp,
            listPrice: 0,
            listed:    false
        });

        // 100% of the primary sale is revenue.
        treasury += price;

        _mint(msg.sender, tokenId);
        emit TileMinted(tokenId, msg.sender, tileKey, country);

        // Refund any overpayment AFTER state is settled (checks-effects-interactions).
        if (msg.value > price) {
            (bool refunded, ) = payable(msg.sender).call{ value: msg.value - price }("");
            require(refunded, "Refund failed");
        }
    }

    /**
     * Mint a tile with no on-chain payment. Used by the backend after an
     * off-chain payment (NOWPayments) has cleared. Restricted to owner/minter.
     */
    function mint(
        address to,
        uint256 tokenId,
        string calldata tileKey,
        string calldata country
    ) external payable onlyOwnerOrMinter whenNotPaused {
        require(to != address(0), "Zero address");
        require(isValidTokenId(tokenId), "tokenId off-grid");
        require(!minted[tokenId], "Already minted");
        require(bytes(tileKey).length > 0, "Empty tileKey");

        minted[tokenId]       = true;
        keyToTokenId[tileKey] = tokenId;

        tileData[tokenId] = TileData({
            tileKey:   tileKey,
            country:   country,
            mintedAt:  block.timestamp,
            listPrice: 0,
            listed:    false
        });

        _mint(to, tokenId);

        // Any value sent alongside an off-chain mint is revenue too.
        if (msg.value > 0) {
            treasury += msg.value;
        }

        emit TileMinted(tokenId, to, tileKey, country);
    }

    // ── Marketplace ─────────────────────────────────────────────────────────

    function listForSale(uint256 tokenId, uint256 priceWei) external whenNotPaused {
        require(_owners[tokenId] == msg.sender, "Not tile owner");
        require(priceWei > 0, "Price must be > 0");
        tileData[tokenId].listed    = true;
        tileData[tokenId].listPrice = priceWei;
        emit TileListed(tokenId, msg.sender, priceWei);
    }

    function unlist(uint256 tokenId) external {
        require(_owners[tokenId] == msg.sender, "Not tile owner");
        tileData[tokenId].listed    = false;
        tileData[tokenId].listPrice = 0;
        emit TileUnlisted(tokenId, msg.sender);
    }

    function buy(uint256 tokenId) external payable whenNotPaused nonReentrant {
        TileData storage td = tileData[tokenId];
        require(td.listed, "Not listed for sale");
        require(msg.value >= td.listPrice, "Insufficient payment");

        address seller     = _owners[tokenId];
        uint256 price      = td.listPrice;
        uint256 fee        = (price * marketFeeBps) / 10000;
        uint256 sellerPays = price - fee;

        // Clear listing before transfer (reentrancy guard)
        td.listed    = false;
        td.listPrice = 0;
        treasury += fee;

        // Transfer NFT
        _transfer(seller, msg.sender, tokenId);

        // Pay seller
        (bool ok, ) = payable(seller).call{ value: sellerPays }("");
        require(ok, "Seller payment failed");

        // Refund overpayment
        if (msg.value > price) {
            (bool refund, ) = payable(msg.sender).call{ value: msg.value - price }("");
            require(refund, "Refund failed");
        }

        emit TileSold(tokenId, seller, msg.sender, price);
    }

    // ── Enumerable ──────────────────────────────────────────────────────────

    function totalSupply() external view returns (uint256) {
        return _allTokens.length;
    }

    function tokenByIndex(uint256 index) external view returns (uint256) {
        require(index < _allTokens.length, "Out of bounds");
        return _allTokens[index];
    }

    function tokenOfOwnerByIndex(address addr, uint256 index) external view returns (uint256) {
        require(index < _ownedTokens[addr].length, "Out of bounds");
        return _ownedTokens[addr][index];
    }

    function tokensOfOwner(address addr) external view returns (uint256[] memory) {
        return _ownedTokens[addr];
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function setMinter(address minter_) external onlyOwner {
        emit MinterChanged(minter, minter_);
        minter = minter_;
    }

    /// Primary sale price per tile, in wei. 0 disables on-chain claiming.
    function setTilePrice(uint256 priceWei) external onlyOwner {
        tilePriceWei = priceWei;
        emit TilePriceUpdated(priceWei);
    }

    function setMintFeePercent(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10%");
        // retained for ABI compatibility; primary sales take 100%, not a fee.
    }

    function setMarketFeePercent(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10%");
        marketFeeBps = bps;
    }

    /**
     * Withdraw the ENTIRE treasury — primary sales plus resale fees — to the
     * contract owner, on this chain. Callable at any time, no timelock.
     *
     * Each chain holds its own balance, so this is called once per deployment.
     * Zeroes the accounting BEFORE transferring (checks-effects-interactions), so
     * a re-entrant call sees nothing left to take.
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 amount = treasury;
        require(amount > 0, "Nothing to withdraw");
        treasury = 0;
        address to = treasuryReceiver;
        (bool ok, ) = payable(to).call{ value: amount }("");
        require(ok, "Withdraw failed");
        emit FeesWithdrawn(to, amount);
    }

    /// Point withdrawals at a different wallet without handing over admin rights.
    /// Lets the hot admin key stay separate from the cold wallet holding revenue.
    function setTreasuryReceiver(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        treasuryReceiver = to;
        emit TreasuryReceiverUpdated(to);
    }

    /// Sweep any balance that arrived outside the accounted paths (direct sends).
    function withdrawUnaccounted() external onlyOwner nonReentrant {
        uint256 stray = address(this).balance - treasury;
        require(stray > 0, "Nothing unaccounted");
        (bool ok, ) = payable(treasuryReceiver).call{ value: stray }("");
        require(ok, "Sweep failed");
        emit FeesWithdrawn(owner, stray);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _mint(address to, uint256 tokenId) internal {
        _owners[tokenId]  = to;
        _balances[to]    += 1;

        _allTokensIndex[tokenId] = _allTokens.length;
        _allTokens.push(tokenId);

        _ownedTokensIndex[tokenId]         = _ownedTokens[to].length;
        _ownedTokens[to].push(tokenId);

        emit Transfer(address(0), to, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(_owners[tokenId] == from, "Wrong owner");
        require(to != address(0), "Zero address");

        delete _tokenApprovals[tokenId];
        _owners[tokenId]   = to;
        _balances[from]   -= 1;
        _balances[to]     += 1;

        // Update owned-by-owner enumeration
        uint256 lastIdx = _ownedTokens[from].length - 1;
        uint256 thisIdx = _ownedTokensIndex[tokenId];
        if (thisIdx != lastIdx) {
            uint256 lastToken = _ownedTokens[from][lastIdx];
            _ownedTokens[from][thisIdx] = lastToken;
            _ownedTokensIndex[lastToken] = thisIdx;
        }
        _ownedTokens[from].pop();
        _ownedTokensIndex[tokenId]         = _ownedTokens[to].length;
        _ownedTokens[to].push(tokenId);

        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tileOwner = _owners[tokenId];
        return (
            spender == tileOwner ||
            _tokenApprovals[tokenId] == spender ||
            _operatorApprovals[tileOwner][spender]
        );
    }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v;
        uint256 len;
        while (tmp > 0) { len++; tmp /= 10; }
        bytes memory buf = new bytes(len);
        while (v > 0) { buf[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    receive() external payable {}
}
