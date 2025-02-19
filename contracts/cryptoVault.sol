// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title CryptoVault
 * @notice Multi-signature wallet for managing ETH and tokens
 * @dev Supports ETH, ERC20, ERC721, and ERC1155 tokens with multi-sig security
 */
contract CryptoVault is Ownable {
    using Address for address;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint8 sigCount;
    }

    mapping(address => bool) private authorizedSigners;
    mapping(uint256 => Transaction) private transactions;
    mapping(uint256 => mapping(address => bool)) private signatures;
    
    uint256 public immutable requiredSignatures;
    uint256 public transactionCount;
    
    uint256 private constant MAX_SIGNERS = 10;
    uint256 private _activeSignerCount;
    
    // Reentrancy Guard
    uint256 private _status;

    event TransactionSubmitted(uint256 indexed txId, address indexed to, uint256 value);
    event TransactionSigned(uint256 indexed txId, address indexed signer);
    event TransactionExecuted(uint256 indexed txId);
    event TransactionRejected(uint256 indexed txId, address indexed signer);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event TokenTransfer(
        address indexed token,
        address indexed to,
        uint256 indexed identifier,
        uint256 amount,
        uint8 tokenType,
        bool success
    );

    error InvalidAddress();
    error InvalidSignerConfiguration();
    error DuplicateSigner();
    error NotAuthorized();
    error AlreadySigned();
    error InsufficientSignatures();
    error AlreadyExecuted();
    error ExecutionFailed();
    error InvalidTransaction();
    error TooManySigners();
    error ReentrancyGuard();

    modifier nonReentrant() {
        if (_status != 0) revert ReentrancyGuard();
        _status = 2; // Change from 1 to 2 for extra protection
        _;
        _status = 0;
    }

    modifier onlySigner() {
        if (!authorizedSigners[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor(
        address[] memory _signers,
        uint256 _requiredSignatures,
        address initialOwner
    ) Ownable(initialOwner) {
        if (_signers.length < _requiredSignatures || _requiredSignatures == 0) {
            revert InvalidSignerConfiguration();
        }
        if (_signers.length > MAX_SIGNERS) {
            revert TooManySigners();
        }

        requiredSignatures = _requiredSignatures;
        _activeSignerCount = _signers.length;

        for (uint256 i = 0; i < _signers.length; ) {
            if (_signers[i] == address(0)) revert InvalidAddress();
            if (authorizedSigners[_signers[i]]) revert DuplicateSigner();
            
            authorizedSigners[_signers[i]] = true;
            emit SignerAdded(_signers[i]);
            
            unchecked { ++i; }
        }
    }

    receive() external payable {}

    fallback() external payable {}

    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) public onlyOwner returns (uint256) {
        if (_to == address(0)) revert InvalidAddress();

        uint256 txId = transactionCount;
        transactions[txId] = Transaction({
            to: _to,
            value: _value,
            data: _data,
            executed: false,
            sigCount: 0
        });

        unchecked { transactionCount++; }

        emit TransactionSubmitted(txId, _to, _value);
        return txId;
    }

    function signTransaction(uint256 _txId) public onlySigner {
        if (_txId >= transactionCount) revert InvalidTransaction();
        
        Transaction storage transaction = transactions[_txId];
        if (transaction.executed) revert AlreadyExecuted();
        if (signatures[_txId][msg.sender]) revert AlreadySigned();

        signatures[_txId][msg.sender] = true;
        unchecked { transaction.sigCount++; }

        emit TransactionSigned(_txId, msg.sender);

        if (transaction.sigCount >= requiredSignatures) {
            _executeTransaction(_txId);
        }
    }

    function _executeTransaction(uint256 _txId) internal nonReentrant {
        Transaction storage transaction = transactions[_txId];

        if (transaction.executed) revert AlreadyExecuted();
        if (transaction.sigCount < requiredSignatures) revert InsufficientSignatures();

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(transaction.data);
        if (!success) revert ExecutionFailed();

        emit TransactionExecuted(_txId);
    }

    function transferERC20(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        if (_token == address(0) || _to == address(0)) revert InvalidAddress();
        
        IERC20 token = IERC20(_token);
        bool success = token.transfer(_to, _amount);
        
        emit TokenTransfer(_token, _to, 0, _amount, 1, success); // 1 for ERC20
    }

    function transferERC721(
        address _token,
        address _to,
        uint256 _tokenId
    ) external onlyOwner {
        if (_token == address(0) || _to == address(0)) revert InvalidAddress();
        
        IERC721 token = IERC721(_token);
        token.transferFrom(address(this), _to, _tokenId);
        
        emit TokenTransfer(_token, _to, _tokenId, 1, 2, true); // 2 for ERC721
    }

    function transferERC1155(
        address _token,
        address _to,
        uint256 _id,
        uint256 _amount,
        bytes memory _data
    ) external onlyOwner {
        if (_token == address(0) || _to == address(0)) revert InvalidAddress();
        
        IERC1155 token = IERC1155(_token);
        token.safeTransferFrom(address(this), _to, _id, _amount, _data);
        
        emit TokenTransfer(_token, _to, _id, _amount, 3, true); // 3 for ERC1155
    }

    function addSigner(address _signer) external onlyOwner {
        if (_signer == address(0)) revert InvalidAddress();
        if (authorizedSigners[_signer]) revert DuplicateSigner();
        if (_activeSignerCount >= MAX_SIGNERS) revert TooManySigners();
        
        authorizedSigners[_signer] = true;
        unchecked { _activeSignerCount++; }
        
        emit SignerAdded(_signer);
    }

    function removeSigner(address _signer) external onlyOwner {
        if (!authorizedSigners[_signer]) revert NotAuthorized();
        if (_activeSignerCount - 1 < requiredSignatures) revert InvalidSignerConfiguration();
        
        authorizedSigners[_signer] = false;
        unchecked { _activeSignerCount--; }
        
        emit SignerRemoved(_signer);
    }
}


// 0x16ab72Bc604E00BfCDCAd1DDc7625F303cA44f47