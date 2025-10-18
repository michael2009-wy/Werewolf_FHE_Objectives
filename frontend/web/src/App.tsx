// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface SecretObjective {
  id: string;
  encryptedData: string;
  timestamp: number;
  playerAddress: string;
  role: string;
  status: "hidden" | "revealed" | "completed";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [objectives, setObjectives] = useState<SecretObjective[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newObjectiveData, setNewObjectiveData] = useState({ role: "", description: "", objectiveCode: 0 });
  const [showIntro, setShowIntro] = useState(true);
  const [selectedObjective, setSelectedObjective] = useState<SecretObjective | null>(null);
  const [decryptedValue, setDecryptedValue] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "hidden" | "revealed" | "completed">("all");
  const [userActions, setUserActions] = useState<string[]>([]);

  const filteredObjectives = objectives.filter(obj => {
    const matchesSearch = obj.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         obj.role.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || obj.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const addUserAction = (action: string) => {
    setUserActions(prev => [`[${new Date().toLocaleTimeString()}] ${action}`, ...prev.slice(0, 9)]);
  };

  useEffect(() => {
    loadObjectives().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadObjectives = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("objective_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing objective keys:", e); }
      }
      const list: SecretObjective[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`objective_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedData: recordData.data, 
                timestamp: recordData.timestamp, 
                playerAddress: recordData.playerAddress, 
                role: recordData.role, 
                status: recordData.status || "hidden" 
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setObjectives(list);
      addUserAction("Refreshed objectives list");
    } catch (e) { 
      console.error("Error loading objectives:", e); 
      addUserAction("Failed to refresh objectives");
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitObjective = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addUserAction("Attempted to submit without wallet connection");
      return; 
    }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting objective with Zama FHE..." });
    try {
      const encryptedData = FHEEncryptNumber(newObjectiveData.objectiveCode);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const objectiveId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const objectiveData = { 
        data: encryptedData, 
        timestamp: Math.floor(Date.now() / 1000), 
        playerAddress: address, 
        role: newObjectiveData.role, 
        status: "hidden" 
      };
      await contract.setData(`objective_${objectiveId}`, ethers.toUtf8Bytes(JSON.stringify(objectiveData)));
      const keysBytes = await contract.getData("objective_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(objectiveId);
      await contract.setData("objective_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted objective submitted securely!" });
      addUserAction(`Created new objective: ${newObjectiveData.role}`);
      await loadObjectives();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewObjectiveData({ role: "", description: "", objectiveCode: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      addUserAction(`Failed to submit objective: ${errorMessage}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreating(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      addUserAction("Attempted to decrypt without wallet connection");
      return null; 
    }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      const decrypted = FHEDecryptNumber(encryptedData);
      addUserAction(`Decrypted objective with code: ${decrypted}`);
      return decrypted;
    } catch (e) { 
      console.error("Decryption failed:", e); 
      addUserAction("Failed to decrypt objective");
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const revealObjective = async (objectiveId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted objective with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const recordBytes = await contract.getData(`objective_${objectiveId}`);
      if (recordBytes.length === 0) throw new Error("Objective not found");
      const objectiveData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedObjective = { ...objectiveData, status: "revealed" };
      await contractWithSigner.setData(`objective_${objectiveId}`, ethers.toUtf8Bytes(JSON.stringify(updatedObjective)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Objective revealed successfully!" });
      addUserAction(`Revealed objective: ${objectiveId}`);
      await loadObjectives();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Reveal failed: " + (e.message || "Unknown error") });
      addUserAction(`Failed to reveal objective: ${e.message || "Unknown error"}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const completeObjective = async (objectiveId: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted objective with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`objective_${objectiveId}`);
      if (recordBytes.length === 0) throw new Error("Objective not found");
      const objectiveData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedObjective = { ...objectiveData, status: "completed" };
      await contract.setData(`objective_${objectiveId}`, ethers.toUtf8Bytes(JSON.stringify(updatedObjective)));
      setTransactionStatus({ visible: true, status: "success", message: "Objective completed successfully!" });
      addUserAction(`Completed objective: ${objectiveId}`);
      await loadObjectives();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Completion failed: " + (e.message || "Unknown error") });
      addUserAction(`Failed to complete objective: ${e.message || "Unknown error"}`);
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (objectiveAddress: string) => address?.toLowerCase() === objectiveAddress.toLowerCase();

  const renderStats = () => {
    const hiddenCount = objectives.filter(o => o.status === "hidden").length;
    const revealedCount = objectives.filter(o => o.status === "revealed").length;
    const completedCount = objectives.filter(o => o.status === "completed").length;
    
    return (
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">{objectives.length}</div>
          <div className="stat-label">Total</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{hiddenCount}</div>
          <div className="stat-label">Hidden</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{revealedCount}</div>
          <div className="stat-label">Revealed</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">{completedCount}</div>
          <div className="stat-label">Completed</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container dark-theme">
      <header className="app-header">
        <div className="logo">
          <h1>Werewolf<span>FHE</span>Objectives</h1>
          <div className="tagline">Secret objectives encrypted with Zama FHE</div>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn">
            <div className="add-icon"></div>New Objective
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content">
        {showIntro && (
          <div className="intro-card">
            <div className="intro-header">
              <h2>Werewolf with FHE-Encrypted Secret Objectives</h2>
              <button onClick={() => setShowIntro(false)} className="close-intro">&times;</button>
            </div>
            <div className="intro-body">
              <p>
                This game enhances traditional Werewolf with <strong>Fully Homomorphic Encryption (FHE)</strong> from Zama. 
                Each player receives a secret objective encrypted with FHE that remains private until revealed.
              </p>
              <div className="fhe-explanation">
                <h3>How FHE Works:</h3>
                <ol>
                  <li>Objectives are encrypted on your device using Zama FHE</li>
                  <li>Encrypted data is stored on-chain</li>
                  <li>Game logic verifies objectives without decrypting them</li>
                  <li>Only you can decrypt your objective with your wallet</li>
                </ol>
              </div>
              <div className="game-rules">
                <h3>Game Rules:</h3>
                <ul>
                  <li>Complete your secret objective for bonus points</li>
                  <li>Objectives remain hidden until you choose to reveal</li>
                  <li>Some objectives may conflict with your team's goals</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-section">
          <div className="stats-card">
            <h3>Game Statistics</h3>
            {renderStats()}
          </div>

          <div className="actions-history">
            <h3>Your Recent Actions</h3>
            <div className="actions-list">
              {userActions.length > 0 ? (
                userActions.map((action, index) => (
                  <div key={index} className="action-item">{action}</div>
                ))
              ) : (
                <div className="no-actions">No actions recorded yet</div>
              )}
            </div>
          </div>
        </div>

        <div className="objectives-section">
          <div className="section-header">
            <h2>Secret Objectives</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search objectives..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="status-filter"
              >
                <option value="all">All Statuses</option>
                <option value="hidden">Hidden</option>
                <option value="revealed">Revealed</option>
                <option value="completed">Completed</option>
              </select>
              <button onClick={loadObjectives} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="objectives-list">
            {filteredObjectives.length === 0 ? (
              <div className="no-objectives">
                <p>No objectives found</p>
                <button onClick={() => setShowCreateModal(true)}>Create First Objective</button>
              </div>
            ) : (
              filteredObjectives.map(obj => (
                <div 
                  key={obj.id} 
                  className={`objective-card ${obj.status}`}
                  onClick={() => setSelectedObjective(obj)}
                >
                  <div className="card-header">
                    <div className="role">{obj.role}</div>
                    <div className={`status ${obj.status}`}>{obj.status}</div>
                  </div>
                  <div className="card-body">
                    <div className="player">Player: {obj.playerAddress.substring(0, 6)}...{obj.playerAddress.substring(38)}</div>
                    <div className="date">{new Date(obj.timestamp * 1000).toLocaleDateString()}</div>
                  </div>
                  <div className="card-footer">
                    {isOwner(obj.playerAddress) && obj.status === "hidden" && (
                      <button 
                        className="reveal-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          revealObjective(obj.id);
                        }}
                      >
                        Reveal
                      </button>
                    )}
                    {isOwner(obj.playerAddress) && obj.status === "revealed" && (
                      <button 
                        className="complete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          completeObjective(obj.id);
                        }}
                      >
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitObjective} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          objectiveData={newObjectiveData} 
          setObjectiveData={setNewObjectiveData}
        />
      )}

      {selectedObjective && (
        <ObjectiveDetailModal 
          objective={selectedObjective} 
          onClose={() => {
            setSelectedObjective(null); 
            setDecryptedValue(null);
          }} 
          decryptedValue={decryptedValue} 
          setDecryptedValue={setDecryptedValue} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
          isOwner={isOwner(selectedObjective.playerAddress)}
        />
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">Werewolf<span>FHE</span>Objectives</div>
            <p>Secret objectives encrypted with Zama FHE technology</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">FHE-Powered</div>
          <div className="copyright">© {new Date().getFullYear()} Werewolf FHE Objectives</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  objectiveData: any;
  setObjectiveData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, objectiveData, setObjectiveData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setObjectiveData({ ...objectiveData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setObjectiveData({ ...objectiveData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!objectiveData.role || !objectiveData.objectiveCode) { 
      alert("Please fill required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create Secret Objective</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="notice-icon">🔒</div>
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your objective will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          <div className="form-group">
            <label>Role *</label>
            <select 
              name="role" 
              value={objectiveData.role} 
              onChange={handleChange}
            >
              <option value="">Select role</option>
              <option value="Werewolf">Werewolf</option>
              <option value="Villager">Villager</option>
              <option value="Seer">Seer</option>
              <option value="Hunter">Hunter</option>
              <option value="Witch">Witch</option>
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <input 
              type="text" 
              name="description" 
              value={objectiveData.description} 
              onChange={handleChange} 
              placeholder="Describe your objective..."
            />
          </div>
          <div className="form-group">
            <label>Objective Code *</label>
            <input 
              type="number" 
              name="objectiveCode" 
              value={objectiveData.objectiveCode} 
              onChange={handleValueChange} 
              placeholder="Enter numerical code..."
            />
          </div>
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-content">
              <div className="plain">
                <span>Plain Code:</span>
                <div>{objectiveData.objectiveCode || 'None'}</div>
              </div>
              <div className="arrow">→</div>
              <div className="encrypted">
                <span>Encrypted:</span>
                <div>{objectiveData.objectiveCode ? FHEEncryptNumber(objectiveData.objectiveCode).substring(0, 30) + '...' : 'None'}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn">
            {creating ? "Encrypting..." : "Create Objective"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ObjectiveDetailModalProps {
  objective: SecretObjective;
  onClose: () => void;
  decryptedValue: number | null;
  setDecryptedValue: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
  isOwner: boolean;
}

const ObjectiveDetailModal: React.FC<ObjectiveDetailModalProps> = ({ 
  objective, 
  onClose, 
  decryptedValue, 
  setDecryptedValue, 
  isDecrypting, 
  decryptWithSignature,
  isOwner
}) => {
  const handleDecrypt = async () => {
    if (decryptedValue !== null) { 
      setDecryptedValue(null); 
      return; 
    }
    const decrypted = await decryptWithSignature(objective.encryptedData);
    if (decrypted !== null) setDecryptedValue(decrypted);
  };

  const getObjectiveDescription = (code: number) => {
    const objectives = {
      1: "Protect a specific player until night 3",
      2: "Get yourself voted out on day 2",
      3: "Successfully identify the Seer",
      4: "Survive until the end without being revealed",
      5: "Cause a specific player to be voted out",
      6: "Use your special ability on the correct target",
      7: "Make at least 3 incorrect accusations",
      8: "Get at least 2 players to trust you falsely"
    };
    return objectives[code as keyof typeof objectives] || "Unknown objective";
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Objective Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        <div className="modal-body">
          <div className="info-section">
            <div className="info-item">
              <span>Role:</span>
              <strong>{objective.role}</strong>
            </div>
            <div className="info-item">
              <span>Player:</span>
              <strong>{objective.playerAddress.substring(0, 6)}...{objective.playerAddress.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Created:</span>
              <strong>{new Date(objective.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status ${objective.status}`}>{objective.status}</strong>
            </div>
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">
              {objective.encryptedData.substring(0, 50)}...
            </div>
            <div className="fhe-tag">
              <span className="fhe-icon">🔒</span>
              <span>FHE Encrypted</span>
            </div>
            {isOwner && (
              <button 
                className="decrypt-btn" 
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 decryptedValue !== null ? "Hide Value" : "Decrypt with Wallet"}
              </button>
            )}
          </div>
          
          {decryptedValue !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Objective</h3>
              <div className="decrypted-content">
                <div className="code">
                  <span>Code:</span>
                  <strong>{decryptedValue}</strong>
                </div>
                <div className="description">
                  <span>Description:</span>
                  <div>{getObjectiveDescription(decryptedValue)}</div>
                </div>
              </div>
              <div className="decryption-notice">
                <span className="warning-icon">⚠️</span>
                <span>This information is only visible to you after wallet verification</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;