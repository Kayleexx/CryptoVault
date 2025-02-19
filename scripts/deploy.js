const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying CryptoVault with account:", deployer.address);

  // Define constructor parameters
  const signers = [deployer.address]; // Add more signer addresses as needed
  const requiredSignatures = 1; // Set your required signature threshold
  const initialOwner = deployer.address;

  const CryptoVault = await hre.ethers.getContractFactory("CryptoVault");
  const vault = await CryptoVault.deploy(signers, requiredSignatures, initialOwner);

  await vault.waitForDeployment();
  console.log("CryptoVault deployed to:", await vault.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });