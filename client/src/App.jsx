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
      try {
        const web3 = new Web3(window.ethereum);
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
  const [isAuthorizedSigner, setIsAuthorizedSigner] = useState(false);
  const [transactionEvents, setTransactionEvents] = useState([]);
  const [gasPrice, setGasPrice] = useState(null);

  // Initialize web3 and contract
  useEffect(() => {
    const initializeWeb3 = async () => {
      if (window.ethereum) {
        try {
          // Setup web3 instance with higher timeout
          const web3Instance = new Web3(window.ethereum);
          web3Instance.eth.transactionBlockTimeout = 100; // Higher block timeout
          web3Instance.eth.transactionPollingTimeout = 1000; // Longer polling
          setWeb3(web3Instance);
          
          // Get current gas price
          const currentGasPrice = await web3Instance.eth.getGasPrice();
          // Add 20% to ensure transaction doesn't get stuck
          setGasPrice(Math.floor(parseInt(currentGasPrice) * 1.2).toString());
          
          // Get connected account
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length === 0) {
            navigate("/");
            return;
          }
          
          setAccount(accounts[0]);
          
          // Initialize contract with proper error handling
          try {
            const contractInstance = new web3Instance.eth.Contract(
              contractABI, 
              contractAddress,
              { from: accounts[0] }
            );
            setContract(contractInstance);
          } catch (contractError) {
            console.error("Contract initialization error:", contractError);
            alert("Failed to initialize smart contract. Please check contract address and ABI.");
            navigate("/");
            return;
          }
          
          // Get ETH balance
          const accountBalance = await web3Instance.eth.getBalance(accounts[0]);
          setBalance(web3Instance.utils.fromWei(accountBalance, "ether"));
          
          // Setup event listeners for account changes
          window.ethereum.on("accountsChanged", handleAccountsChanged);
          window.ethereum.on("chainChanged", () => window.location.reload());
          
        } catch (error) {
          console.error("Initialization error:", error);
          alert("Failed to connect to blockchain. Please check your wallet connection.");
          navigate("/");
        }
      } else {
        alert("Please install MetaMask to use CryptoVault");
        navigate("/");
      }
    };
    
    const handleAccountsChanged = async (newAccounts) => {
      if (newAccounts.length === 0) {
        navigate("/");
      } else {
        setAccount(newAccounts[0]);
        if (web3) {
          const newBalance = await web3.eth.getBalance(newAccounts[0]);
          setBalance(web3.utils.fromWei(newBalance, "ether"));
          // Reset state when account changes
          setIsLoading(true);
          await loadTransactions();
          await checkSignerStatus(newAccounts[0]);
        }
      }
    };
    
    initializeWeb3();
    
    return () => {
      // Cleanup event listeners
      if (window.ethereum) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      }
    };
  }, [navigate]);

  // Check if user is authorized signer
  const checkSignerStatus = async (currentAccount = account) => {
    if (!contract || !currentAccount) return false;
    
    try {
      // First attempt: Try direct method call if available
      try {
        const isAuthorized = await contract.methods.isSigner(currentAccount).call();
        setIsAuthorizedSigner(!!isAuthorized);
        return !!isAuthorized;
      } catch (methodError) {
        console.warn("isSigner method not available, trying alternative approach");
      }
      
      // Second attempt: Check via events
      const signerAddedEvents = await contract.getPastEvents('SignerAdded', {
        filter: { signer: currentAccount },
        fromBlock: 0,
        toBlock: 'latest'
      });
      
      const signerRemovedEvents = await contract.getPastEvents('SignerRemoved', {
        filter: { signer: currentAccount },
        fromBlock: 0,
        toBlock: 'latest'
      });
      
      // If more added events than removed, account is a signer
      const isSigner = signerAddedEvents.length > signerRemovedEvents.length;
      setIsAuthorizedSigner(isSigner);
      return isSigner;
      
    } catch (error) {
      console.error("Error checking signer status:", error);
      return false;
    }
  };

  // Load contract data when contract is initialized
  useEffect(() => {
    const loadContractData = async () => {
      if (contract && account && web3) {
        try {
          await Promise.all([
            fetchRequiredSignatures(),
            checkSignerStatus(),
            loadTransactions()
          ]);
        } catch (error) {
          console.error("Error loading contract data:", error);
        }
      }
    };
    
    if (contract && account && web3) {
      loadContractData();
    }
  }, [contract, account, web3]);

  const fetchRequiredSignatures = async () => {
    if (!contract) return;
    
    try {
      const sigs = await contract.methods.requiredSignatures().call();
      setRequiredSignatures(parseInt(sigs));
    } catch (error) {
      console.error("Error fetching required signatures:", error);
      // Set default value if unable to fetch
      setRequiredSignatures(2);
    }
  };

  const loadTransactions = async () => {
    if (!contract || !web3 || !account) {
      console.warn("Contract, web3 or account not initialized");
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Get transaction count with retry logic
      let txCount;
      try {
        txCount = await contract.methods.transactionCount().call();
        console.log(`Found ${txCount} transactions`);
      } catch (countError) {
        console.error("Error fetching transaction count:", countError);
        txCount = 0;
      }
      
      // Load all relevant events
      const [submittedEvents, executedEvents, signedEvents] = await Promise.all([
        contract.getPastEvents('TransactionSubmitted', { fromBlock: 0, toBlock: 'latest' }),
        contract.getPastEvents('TransactionExecuted', { fromBlock: 0, toBlock: 'latest' }),
        contract.getPastEvents('TransactionSigned', { fromBlock: 0, toBlock: 'latest' })
      ]);
      
      // Create maps for quick lookups
      const executedTxIds = new Set(executedEvents.map(event => event.returnValues.txId));
      
      // Count signatures per transaction
      const signatureCountMap = {};
      signedEvents.forEach(event => {
        const txId = event.returnValues.txId;
        signatureCountMap[txId] = (signatureCountMap[txId] || 0) + 1;
      });
      
      // Check if current user has signed each transaction
      const userSignatureMap = {};
      signedEvents.forEach(event => {
        if (event.returnValues.signer.toLowerCase() === account.toLowerCase()) {
          userSignatureMap[event.returnValues.txId] = true;
        }
      });
      
      // Process transactions with error handling
      const allTransactions = await Promise.all(submittedEvents.map(async (event) => {
        try {
          const txId = event.returnValues.txId;
          const to = event.returnValues.to;
          const value = web3.utils.fromWei(event.returnValues.value, "ether");
          
          // Extract transaction data from event logs if possible
          let txData = "0x";
          try {
            // Try to decode data from event logs
            if (event.raw && event.raw.data) {
              txData = event.raw.data;
            } else {
              // Fallback: try to get from transaction receipt
              const receipt = await web3.eth.getTransactionReceipt(event.transactionHash);
              if (receipt && receipt.logs && receipt.logs.length > 0) {
                txData = receipt.logs[0].data;
              }
            }
          } catch (dataError) {
            console.warn(`Could not fetch data for tx ${txId}:`, dataError);
          }
          
          // Get timestamp from block
          let timestamp = Date.now();
          try {
            const block = await web3.eth.getBlock(event.blockNumber);
            if (block && block.timestamp) {
              timestamp = block.timestamp * 1000;
            }
          } catch (blockError) {
            console.warn(`Could not fetch block for tx ${txId}:`, blockError);
          }
          
          return {
            id: txId,
            to: to,
            value: value,
            data: txData,
            executed: executedTxIds.has(txId),
            sigCount: signatureCountMap[txId] || 0,
            requiredSigs: requiredSignatures,
            hasSigned: !!userSignatureMap[txId],
            timestamp: timestamp
          };
        } catch (processingError) {
          console.error(`Error processing transaction ${event.returnValues?.txId}:`, processingError);
          return null;
        }
      }));
      
      // Filter out failed transaction processing
      const validTransactions = allTransactions.filter(tx => tx !== null);
      
      // Sort and filter transactions
      const executed = validTransactions.filter(tx => tx.executed).sort((a, b) => b.id - a.id);
      const pending = validTransactions.filter(tx => !tx.executed).sort((a, b) => b.id - a.id);
      
      setTransactions(executed);
      setPendingTransactions(pending);
    } catch (error) {
      console.error("Failed to fetch transactions", error);
      // Set empty arrays as fallback
      setTransactions([]);
      setPendingTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  const signTransaction = async (txId) => {
    if (!isAuthorizedSigner) {
      alert("Your account is not an authorized signer for this vault");
      return;
    }
    
    // Check if already signed
    const pendingTx = pendingTransactions.find(tx => tx.id === txId);
    if (pendingTx?.hasSigned) {
      alert("You have already signed this transaction");
      return;
    }
    
    setIsApproving({...isApproving, [txId]: true});
    
    try {
      // Use dynamic gas calculation with buffer
      const gasEstimate = await contract.methods.signTransaction(txId).estimateGas({
        from: account
      }).catch(error => {
        // If estimation fails, use safe default
        console.warn("Gas estimation failed:", error);
        return 250000; // Safe default value
      });
      
      // Add 30% buffer to gas estimate for safety
      const gasLimit = Math.floor(gasEstimate * 1.3);
      
      // Get current gas price with 10% buffer
      const currentGasPrice = await web3.eth.getGasPrice();
      const adjustedGasPrice = Math.floor(parseInt(currentGasPrice) * 1.1).toString();
      
      // Sign transaction with optimized gas settings
      const result = await contract.methods.signTransaction(txId).send({ 
        from: account,
        gas: gasLimit,
        gasPrice: adjustedGasPrice
      });
      
      console.log("Transaction signed successfully:", result);
      
      // Reload transactions after successful signing
      await loadTransactions();
    } catch (error) {
      console.error("Signing failed", error);
      
      // Enhanced error handling
      let errorMessage = "Transaction signing failed";
      
      // Check for specific error types
      if (error.message.includes("execution reverted")) {
        // Parse custom error from solidity
        const errorMatch = error.message.match(/reverted with custom error '(\w+)'/);
        if (errorMatch && errorMatch[1]) {
          // Map contract errors to user-friendly messages
          const errorMap = {
            'NotAuthorized': "You are not authorized to sign this transaction",
            'AlreadySigned': "You have already signed this transaction",
            'AlreadyExecuted': "This transaction has already been executed",
            'InvalidTransaction': "Invalid transaction ID"
          };
          errorMessage = errorMap[errorMatch[1]] || `Contract error: ${errorMatch[1]}`;
        } else if (error.message.includes("revert")) {
          // Try to extract revert reason
          const reasonMatch = error.message.match(/reason string: '(.+?)'/);
          if (reasonMatch && reasonMatch[1]) {
            errorMessage = `Transaction failed: ${reasonMatch[1]}`;
          }
        }
      } else if (error.message.includes("User denied")) {
        errorMessage = "You rejected the transaction in your wallet";
      } else if (error.message.includes("Transaction underpriced")) {
        errorMessage = "Transaction failed: Gas price too low. Please try again with higher gas price.";
      } else if (error.message.includes("out of gas")) {
        errorMessage = "Transaction failed: Out of gas. Please try again with higher gas limit.";
      }
      
      alert(errorMessage);
    } finally {
      setIsApproving({...isApproving, [txId]: false});
    }
  };
  
  const submitNewTransaction = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Validate form data
    if (!web3.utils.isAddress(newTxData.recipient)) {
      alert("Invalid recipient address");
      setIsSubmitting(false);
      return;
    }
    
    if (isNaN(parseFloat(newTxData.amount)) && newTxData.amount !== "") {
      alert("Invalid amount: Please enter a valid number");
      setIsSubmitting(false);
      return;
    }
    
    // Normalize transaction data
    let txData = newTxData.data?.trim() || "0x";
    if (txData !== "0x" && !txData.startsWith("0x")) {
      txData = "0x" + txData;
    }
    
    // Validate hex format
    if (txData !== "0x") {
      try {
        web3.utils.hexToBytes(txData);
      } catch (error) {
        alert("Invalid transaction data format. Please provide valid hex data starting with '0x'");
        setIsSubmitting(false);
        return;
      }
    }
    
    try {
      // Convert ETH to Wei with proper validation
      let valueInWei;
      try {
        valueInWei = web3.utils.toWei(newTxData.amount || "0", "ether");
      } catch (conversionError) {
        alert("Invalid ETH amount. Please enter a valid number.");
        setIsSubmitting(false);
        return;
      }
      
      // Gas estimation with fallback
      const gasEstimate = await contract.methods.submitTransaction(
        newTxData.recipient,
        valueInWei,
        txData
      ).estimateGas({
        from: account
      }).catch(error => {
        console.warn("Gas estimation failed:", error);
        return 300000; // Safe default value
      });
      
      // Add 30% buffer to gas estimate
      const gasLimit = Math.floor(gasEstimate * 1.3);
      
      // Get current gas price with 10% buffer
      const currentGasPrice = await web3.eth.getGasPrice();
      const adjustedGasPrice = Math.floor(parseInt(currentGasPrice) * 1.1).toString();
      
      // Submit transaction with optimized parameters
      const result = await contract.methods.submitTransaction(
        newTxData.recipient,
        valueInWei,
        txData
      ).send({ 
        from: account,
        gas: gasLimit,
        gasPrice: adjustedGasPrice
      });
      
      console.log("Transaction submitted successfully:", result);
      
      // Reset form and reload transactions
      setNewTxData({
        recipient: "",
        amount: "",
        data: ""
      });
      
      await loadTransactions();
    } catch (error) {
      console.error("Transaction submission failed", error);
      
      // Detailed error handling
      let errorMessage = "Transaction failed";
      
      if (error.message.includes("execution reverted")) {
        // Parse custom error from solidity
        const errorMatch = error.message.match(/reverted with custom error '(\w+)'/);
        if (errorMatch && errorMatch[1]) {
          const errorMap = {
            'NotAuthorized': "Only the contract owner can submit transactions",
            'InvalidAddress': "Invalid recipient address",
            'InvalidTransaction': "Transaction validation failed"
          };
          errorMessage = errorMap[errorMatch[1]] || `Contract error: ${errorMatch[1]}`;
        } else {
          // Try to extract revert reason
          const reasonMatch = error.message.match(/reason string: '(.+?)'/);
          if (reasonMatch && reasonMatch[1]) {
            errorMessage = `Transaction failed: ${reasonMatch[1]}`;
          } else {
            errorMessage = "Transaction failed: Contract execution reverted";
          }
        }
      } else if (error.message.includes("User denied")) {
        errorMessage = "You rejected the transaction in your wallet";
      } else if (error.message.includes("insufficient funds")) {
        errorMessage = "Insufficient ETH balance to submit transaction";
      } else if (error.message.includes("nonce too low")) {
        errorMessage = "Transaction error: Nonce too low. Please refresh the page and try again.";
      }
      
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const shortenAddress = (address) => {
    if (!address) return "";
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  // Format data for display (truncate long hex strings)
  const formatData = (data) => {
    if (!data || data === "0x") return "0x";
    if (data.length > 50) {
      return `${data.substring(0, 25)}...${data.substring(data.length - 20)}`;
    }
    return data;
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
            {!isAuthorizedSigner && (
              <div className="unauthorized-warning">
                ⚠️ Not an authorized signer
              </div>
            )}
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
                <button 
                  className="refresh-button"
                  onClick={() => loadTransactions()}
                >
                  🔄 Refresh
                </button>
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
                              <span className="detail-value data">{formatData(tx.data)}</span>
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
                              disabled={isApproving[tx.id] || !isAuthorizedSigner}
                              title={!isAuthorizedSigner ? "Your account is not an authorized signer" : ""}
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
                <button 
                  className="refresh-button"
                  onClick={() => loadTransactions()}
                >
                  🔄 Refresh
                </button>
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
                              <span className="detail-value data">{formatData(tx.data)}</span>
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
                        onChange={(e) => setNewTxData({...newTxData, recipient: e.target.value.trim()})}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="amount">Amount (ETH)</label>
                      <input 
                        type="text" 
                        id="amount"
                        placeholder="0.0"
                        value={newTxData.amount}
                        onChange={(e) => {
                          // Allow only valid number inputs
                          const value = e.target.value.replace(/[^0-9.]/g, '');
                          setNewTxData({...newTxData, amount: value});
                        }}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="data">Transaction Data (optional)</label>
                      <textarea 
                        id="data"
                        placeholder="0x..."
                        value={newTxData.data}
                        onChange={(e) => {
                          // Clean up data input
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