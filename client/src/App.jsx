import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from "react-router-dom";
import Web3 from "web3";
import contractABI from "./contractABI.json";
import "./App.css";

const contractAddress = "0x16ab72Bc604E00BfCDCAd1DDc7625F303cA44f47";

function HomePage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async () => {
    if (window.ethereum) {
      setIsConnecting(true);
      const web3 = new Web3(window.ethereum);
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        setAccount(accounts[0]);
        navigate("/app");
      } catch (error) {
        console.error("Wallet connection failed", error);
      } finally {
        setIsConnecting(false);
      }
    } else {
      alert("Please install MetaMask to use CryptoVault");
    }
  };

  return (
    <div className="container">
      <div className="glass-box">
        <div className="logo-container">
          <img src="/logo.svg" alt="CryptoVault Logo" className="logo" />
          <h1>CryptoVault</h1>
        </div>
        
        <p className="tagline">Secure your crypto assets with multi-signature authentication.</p>
        
        <div className="features-container">
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3>Multi-Signature Security</h3>
            <p>Require multiple approvals before executing any transaction for enhanced security.</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">💎</div>
            <h3>Multi-Asset Support</h3>
            <p>Compatible with ETH, ERC20 tokens, ERC721 (NFTs), and ERC1155 assets.</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">🔄</div>
            <h3>Decentralized & Trustless</h3>
            <p>Fully on-chain execution with complete transparency and no central authority.</p>
          </div>
        </div>
        
        <button 
          className="launch-btn" 
          onClick={connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting..." : "Launch App"}
        </button>
      </div>
    </div>
  );
}

function AppPage() {
  const navigate = useNavigate();
  const [web3, setWeb3] = useState(null);
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pendingTransactions, setPendingTransactions] = useState([]);
  const [balance, setBalance] = useState("0");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [newTxData, setNewTxData] = useState({
    recipient: "",
    amount: "",
    data: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState({});
  const [requiredSignatures, setRequiredSignatures] = useState(0);

  useEffect(() => {
    const initializeWeb3 = async () => {
      if (window.ethereum) {
        try {
          // Setup web3 instance
          const web3Instance = new Web3(window.ethereum);
          setWeb3(web3Instance);
          
          // Get connected account
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length === 0) {
            navigate("/");
            return;
          }
          setAccount(accounts[0]);
          
          // Initialize contract
          const contractInstance = new web3Instance.eth.Contract(contractABI, contractAddress);
          setContract(contractInstance);
          
          // Get ETH balance
          const accountBalance = await web3Instance.eth.getBalance(accounts[0]);
          setBalance(web3Instance.utils.fromWei(accountBalance, "ether"));
          
          // Setup event listeners for account changes
          window.ethereum.on("accountsChanged", (newAccounts) => {
            if (newAccounts.length === 0) {
              navigate("/");
            } else {
              setAccount(newAccounts[0]);
            }
          });
        } catch (error) {
          console.error("Initialization error:", error);
          navigate("/");
        }
      } else {
        alert("Please install MetaMask");
        navigate("/");
      }
    };
    
    initializeWeb3();
    
    return () => {
      // Cleanup event listeners
      if (window.ethereum) {
        window.ethereum.removeAllListeners("accountsChanged");
      }
    };
  }, [navigate]);

  useEffect(() => {
    if (contract && account) {
      loadTransactions();
      fetchRequiredSignatures();
    }
  }, [contract, account]);

  const fetchRequiredSignatures = async () => {
    if (contract) {
      try {
        const sigs = await contract.methods.requiredSignatures().call();
        setRequiredSignatures(parseInt(sigs));
      } catch (error) {
        console.error("Error fetching required signatures:", error);
      }
    }
  };

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      // Get transaction count
      const txCount = await contract.methods.transactionCount().call();
      
      // Load all transactions
      const txPromises = [];
      for (let i = 0; i < txCount; i++) {
        txPromises.push(loadTransactionDetails(i));
      }
      
      const txDetails = await Promise.all(txPromises);
      
      // Filter out null values and separate executed and pending transactions
      const validTxs = txDetails.filter(tx => tx !== null);
      const executed = [];
      const pending = [];
      
      validTxs.forEach(tx => {
        if (tx.executed) {
          executed.push(tx);
        } else {
          pending.push(tx);
        }
      });
      
      setTransactions(executed.reverse()); // Most recent first
      setPendingTransactions(pending.reverse());
    } catch (error) {
      console.error("Failed to fetch transactions", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransactionDetails = async (txId) => {
    try {
      // Check if we need to use a getter function instead of direct mapping access
      let tx;
      if (typeof contract.methods.getTransaction === 'function') {
        // Try using a getter function if it exists
        tx = await contract.methods.getTransaction(txId).call();
      } else {
        // Try accessing the transactions mapping through the array-like syntax
        // This is a common pattern in Solidity where mapping access is done through a function call
        tx = await contract.methods.transactions(txId).call();
      }
      
      // Format data for display
      const formattedValue = web3.utils.fromWei(tx.value, "ether");
      
      // Check if current user has signed
      const hasSigned = await contract.methods.signatures(txId, account).call();
      
      // Get required signatures
      const requiredSigs = await contract.methods.requiredSignatures().call();
      
      // Create more realistic timestamp (24 hours between transactions)
      const mockTimestamp = Date.now() - (txId * 86400000); 
      
      return {
        id: txId,
        to: tx.to,
        value: formattedValue,
        data: tx.data,
        executed: tx.executed,
        sigCount: parseInt(tx.sigCount),
        requiredSigs: parseInt(requiredSigs),
        hasSigned,
        timestamp: mockTimestamp
      };
    } catch (error) {
      console.error(`Error loading transaction ${txId}:`, error);
      
      // Try to determine if this is an out-of-bounds error vs a method error
      if (error.message.includes("out of bounds") || 
          error.message.includes("invalid opcode") ||
          error.message.includes("transaction doesn't exist")) {
        // Transaction doesn't exist, return null to indicate we've reached the end
        return null;
      }
      
      // For debugging, log the available methods on the contract
      console.log("Available contract methods:", Object.keys(contract.methods));
      
      // Return minimal placeholder data if transaction exists but couldn't be loaded completely
      return {
        id: txId,
        to: "0x0000000000000000000000000000000000000000",
        value: "0",
        data: "0x",
        executed: false,
        sigCount: 0,
        requiredSigs: requiredSignatures,
        hasSigned: false,
        timestamp: Date.now() - (txId * 86400000)
      };
    }
  };
  const detectContractStructure = () => {
    if (!contract) return;
    
    console.log("Available contract methods:", 
      Object.keys(contract.methods)
        .filter(key => typeof contract.methods[key] === 'function')
        .filter(key => !key.includes('('))
    );
    
    // Check common multi-sig methods
    const methodsToCheck = [
      'transactionCount', 'getTransactionCount',
      'transactions', 'getTransaction',
      'getTransactions', 'getAllTransactions'
    ];
    
    methodsToCheck.forEach(method => {
      if (typeof contract.methods[method] === 'function') {
        console.log(`Method available: ${method}`);
      }
    });
  };
  useEffect(() => {
    if (contract && account) {
      detectContractStructure(); // Add this line
      loadTransactions();
      fetchRequiredSignatures();
    }
  }, [contract, account]);
  const signTransaction = async (txId) => {
    setIsApproving({...isApproving, [txId]: true});
    try {
      // Get current gas price
      const gasPrice = await web3.eth.getGasPrice();
      
      // Estimate gas needed for the transaction
      const estimatedGas = await contract.methods.signTransaction(txId)
        .estimateGas({ from: account })
        .catch(error => {
          // Check for common error patterns
          if (error.message.includes("already signed")) {
            throw new Error("You have already signed this transaction");
          } else if (error.message.includes("executed")) {
            throw new Error("This transaction has already been executed");
          } else {
            throw error;
          }
        });
      
      // Proceed with transaction with appropriate gas parameters
      await contract.methods.signTransaction(txId).send({ 
        from: account,
        gas: Math.floor(estimatedGas * 1.2), // Add 20% buffer
        gasPrice
      });
      
      // Reload transactions after successful signing
      await loadTransactions();
    } catch (error) {
      console.error("Signing failed", error);
      
      // User-friendly error handling
      let errorMessage = "Transaction signing failed";
      if (error.message.includes("already signed")) {
        errorMessage = "You have already signed this transaction";
      } else if (error.message.includes("executed")) {
        errorMessage = "This transaction has already been executed";
      } else if (error.message.includes("User denied")) {
        errorMessage = "Transaction was rejected in your wallet";
      }
      
      alert(errorMessage);
    } finally {
      setIsApproving({...isApproving, [txId]: false});
    }
  };
  
  const submitNewTransaction = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Validate recipient address
      if (!web3.utils.isAddress(newTxData.recipient)) {
        alert("Invalid recipient address");
        setIsSubmitting(false);
        return;
      }
      
      // Validate transaction data format
      let txData = newTxData.data || "0x";
      if (txData !== "0x" && !txData.startsWith("0x")) {
        txData = "0x" + txData;
      }
      
      // Additional validation for hex format
      if (txData !== "0x") {
        try {
          web3.utils.hexToBytes(txData); // This will throw if invalid hex
        } catch (error) {
          alert("Invalid transaction data format. Please provide valid hex data starting with '0x'");
          setIsSubmitting(false);
          return;
        }
      }
      
      // Convert ETH to Wei
      const valueInWei = web3.utils.toWei(newTxData.amount || "0", "ether");
      
      // Submit transaction
      await contract.methods.submitTransaction(
        newTxData.recipient,
        valueInWei,
        txData
      ).send({ from: account });
      
      // Reset form and reload transactions
      setNewTxData({
        recipient: "",
        amount: "",
        data: ""
      });
      
      await loadTransactions();
    } catch (error) {
      console.error("Transaction submission failed", error);
      alert(`Transaction failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-container">
          <img src="/logo.svg" alt="CryptoVault Logo" className="sidebar-logo" />
          <h2>CryptoVault</h2>
        </div>
        
        <div className="account-info">
          <div className="account-address">
            <span className="address-label">Connected:</span>
            <span className="address">{shortenAddress(account || "")}</span>
          </div>
          <div className="account-balance">
            <span>{parseFloat(balance).toFixed(4)} ETH</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
          >
            ⏳ Pending Transactions
          </button>
          <button 
            className={`nav-item ${activeTab === "executed" ? "active" : ""}`}
            onClick={() => setActiveTab("executed")}
          >
            ✅ Executed Transactions
          </button>
          <button 
            className={`nav-item ${activeTab === "new" ? "active" : ""}`}
            onClick={() => setActiveTab("new")}
          >
            🆕 New Transaction
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <Link to="/" className="logout-button">Disconnect Wallet</Link>
        </div>
      </aside>
      
      <main className="main-content">
        {isLoading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Loading vault data...</p>
          </div>
        ) : (
          <>
            {activeTab === "pending" && (
              <div className="transaction-section">
                <h2>Pending Transactions</h2>
                {pendingTransactions.length === 0 ? (
                  <div className="empty-state">
                    <p>No pending transactions</p>
                  </div>
                ) : (
                  <div className="transactions-list">
                    {pendingTransactions.map((tx) => (
                      <div className="transaction-card" key={tx.id}>
                        <div className="transaction-header">
                          <h3>Transaction #{tx.id}</h3>
                          <span className="timestamp">{formatDate(tx.timestamp)}</span>
                        </div>
                        
                        <div className="transaction-details">
                          <div className="detail-row">
                            <span className="detail-label">Recipient:</span>
                            <span className="detail-value">{shortenAddress(tx.to)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Amount:</span>
                            <span className="detail-value">{tx.value} ETH</span>
                          </div>
                          {tx.data !== "0x" && (
                            <div className="detail-row">
                              <span className="detail-label">Data:</span>
                              <span className="detail-value data">{tx.data}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="signature-progress">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{width: `${(tx.sigCount / tx.requiredSigs) * 100}%`}}
                            ></div>
                          </div>
                          <span className="signature-count">
                            {tx.sigCount} of {tx.requiredSigs} signatures
                          </span>
                        </div>
                        
                        <div className="transaction-actions">
                          {tx.hasSigned ? (
                            <button className="btn-signed" disabled>
                              ✓ Signed
                            </button>
                          ) : (
                            <button 
                              className="btn-sign" 
                              onClick={() => signTransaction(tx.id)}
                              disabled={isApproving[tx.id]}
                            >
                              {isApproving[tx.id] ? "Signing..." : "Sign Transaction"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "executed" && (
              <div className="transaction-section">
                <h2>Executed Transactions</h2>
                {transactions.length === 0 ? (
                  <div className="empty-state">
                    <p>No executed transactions</p>
                  </div>
                ) : (
                  <div className="transactions-list">
                    {transactions.map((tx) => (
                      <div className="transaction-card executed" key={tx.id}>
                        <div className="transaction-header">
                          <h3>Transaction #{tx.id}</h3>
                          <span className="timestamp">{formatDate(tx.timestamp)}</span>
                        </div>
                        
                        <div className="transaction-details">
                          <div className="detail-row">
                            <span className="detail-label">Recipient:</span>
                            <span className="detail-value">{shortenAddress(tx.to)}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Amount:</span>
                            <span className="detail-value">{tx.value} ETH</span>
                          </div>
                          {tx.data !== "0x" && (
                            <div className="detail-row">
                              <span className="detail-label">Data:</span>
                              <span className="detail-value data">{tx.data}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="execution-status">
                          <span className="status-completed">✓ Executed successfully</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "new" && (
              <div className="new-transaction-section">
                <h2>Create New Transaction</h2>
                <div className="new-transaction-form-container">
                  <form className="new-transaction-form" onSubmit={submitNewTransaction}>
                    <div className="form-group">
                      <label htmlFor="recipient">Recipient Address</label>
                      <input 
                        type="text" 
                        id="recipient"
                        placeholder="0x..."
                        value={newTxData.recipient}
                        onChange={(e) => setNewTxData({...newTxData, recipient: e.target.value})}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="amount">Amount (ETH)</label>
                      <input 
                        type="number" 
                        id="amount"
                        min="0"
                        step="0.0001"
                        placeholder="0.0"
                        value={newTxData.amount}
                        onChange={(e) => setNewTxData({...newTxData, amount: e.target.value})}
                      />
                    </div>
                    
                    <div className="form-group">
  <label htmlFor="data">Transaction Data (optional)</label>
  <textarea 
    id="data"
    placeholder="0x..."
    value={newTxData.data}
    onChange={(e) => {
      const value = e.target.value.trim();
      setNewTxData({...newTxData, data: value});
    }}
  />
  <small className="form-hint">
    Enter hex data for contract interactions (must be valid hex starting with 0x)
  </small>
</div>
                    
                    <div className="form-notice">
                      <p>
                        <strong>Note:</strong> This transaction will require{" "}
                        <span className="highlight">{requiredSignatures}</span> signatures before execution.
                      </p>
                    </div>
                    
                    <button 
                      type="submit" 
                      className="submit-transaction-btn"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Submitting..." : "Submit Transaction"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CryptoVaultApp() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app" element={<AppPage />} />
      </Routes>
    </Router>
  );
}

export default CryptoVaultApp;