# CryptoVault - Multi-Signature Wallet

![CryptoVault](https://img.shields.io/badge/Blockchain-Ethereum-blue.svg)
![Solidity](https://img.shields.io/badge/Smart_Contract-Solidity-orange.svg)
![Ethers.js](https://img.shields.io/badge/Web3-Library-green.svg)

## 📌 Overview
This project is a **CryptoVault** for Ethereum, enabling multiple owners to approve transactions before execution. It enhances security by requiring multiple signatures, preventing unauthorized access to funds.

## ✨ Features
- Create secure transactions requiring multiple approvals.
- Send ETH and interact with smart contracts.
- Add or remove signers dynamically.
- Transparent transaction history.

## 🏗️ Tech Stack
- **Solidity**: Smart contract development
- **Ethers.js**: Frontend interaction with Ethereum
- **Hardhat**: Development and testing framework
- **React.js**: User-friendly UI (if applicable)

## 🚀 Installation & Setup
### **1️⃣ Clone the Repository**
```sh
git clone https://github.com/Kayleexx/CryptoVault.git
cd CryptoVault
```

### **2️⃣ Install Dependencies**
```sh
npm install
```

### **3️⃣ Compile Smart Contract**
```sh
npx hardhat compile
```

### **4️⃣ Run Tests**
```sh
npx hardhat test
```

## 🎯 Usage Guide
### **Creating a New Transaction**
1. Enter the **recipient address**.
2. Input the **amount** of ETH.
3. (Optional) Enter transaction data in **hex format** for contract interactions.
4. Click **Submit**, and signers must approve before execution.

### **Transaction Data Example**
For an ERC20 token transfer:
```sh
0xa9059cbb0000000000000000000000001234567890abcdef1234567890abcdef123456780000000000000000000000000000000000000000000000000000000000000186a0
```

## 🔑 Smart Contract Functions
| Function            | Description |
|---------------------|-------------|
| `submitTransaction` | Creates a transaction request. |
| `confirmTransaction` | Approves a transaction. |
| `executeTransaction` | Executes after required approvals. |
| `revokeConfirmation` | Revokes approval if not yet executed. |
| `addSigner` | Adds a new wallet signer. |
| `removeSigner` | Removes a wallet signer. |

## Output
![image](https://github.com/user-attachments/assets/aa0828a5-2ed9-4d44-930a-a0821511cad4)
![image](https://github.com/user-attachments/assets/c40676b4-f8b8-441f-b120-a093554a5519)

