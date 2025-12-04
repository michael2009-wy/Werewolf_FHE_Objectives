# Werewolf FHE Objectives: A Fully Homomorphic Encryption Enhanced Experience 🎭🔍

Werewolf FHE Objectives is an innovative party game that takes the classic Werewolf gameplay to an entirely new level by incorporating **Zama's Fully Homomorphic Encryption technology**. In this game, every player, regardless of their role, has a personal secret objective encrypted with FHE, allowing for a dynamic interaction that enhances strategic depth and social deception.

## The Challenge We Address

Traditional party games like Werewolf often result in predictable gameplay, where players can easily deduce each other's roles and objectives. This predictability can diminish the excitement and engagement. Our project introduces a layer of complexity by providing each player with a unique, encrypted secret task that adds motivation and intrigue, making each game session unpredictable and thrilling.

## How FHE Solves the Problem

By utilizing **Fully Homomorphic Encryption (FHE)**, we empower each player to hold a secret mission that is fully encrypted and verified without revealing any sensitive information. This means that players can execute their individual tasks—such as "protect a specific player" or "mislead a vote"—while keeping their strategies concealed from other players. The implementation of FHE is achieved using **Zama's open-source libraries**, specifically through the **zama-fhe SDK**. This cutting-edge technology ensures that personal tasks remain confidential, enabling an engaging gameplay experience where strategic deception is at the forefront.

## Key Features

- **Individual Secret Missions**: Each player has a unique FHE-encrypted task, adding depth to their strategy.
- **Homomorphic Verification of Tasks**: This ensures that players can prove they completed their objectives without revealing the nature of their missions.
- **Enhanced Player Engagement**: By increasing the complexity of player interactions, we add a layer of personal motivation and unpredictability.
- **Dynamic Gameplay**: The mix of hidden objectives and social deduction amplifies the challenge and excitement of each game round.
- **Thematic Integration**: The game features a suspenseful, character-driven narrative that enhances the overall experience.

## Technology Stack

- **Smart Contract Language**: Solidity
- **Runtime Environment**: Node.js
- **Development Framework**: Hardhat
- **Confidential Computing**: Zama FHE SDK
- **State Management**: Ethereum blockchain

## Directory Structure

```
Werewolf_FHE_Objectives/
├── contracts/
│   └── Werewolf_FHE_Objectives.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── werewolfTest.js
├── package.json
├── hardhat.config.js
└── README.md
```

## Installation Guide

To set up the Werewolf FHE Objectives project, ensure you have the following prerequisites installed:

1. **Node.js**: Install Node.js from the official website.
2. **Hardhat**: You can install Hardhat by running `npm install --save-dev hardhat`.

Once you’ve met the prerequisites, follow these steps to set up the project:

1. Navigate to the project directory.
2. Run the following command to install dependencies:

   ```bash
   npm install
   ```

This command will fetch all necessary libraries, including those for Zama's FHE functionalities.

## Build & Run Guide

To compile, test, and run the project, you can use the following commands:

1. **Compile the Smart Contracts**:

   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:

   ```bash
   npx hardhat test
   ```

3. **Deploy the Smart Contract**:

   ```bash
   npx hardhat run scripts/deploy.js --network <your-network>
   ```

Replace `<your-network>` with the desired Ethereum network, such as localhost or a testnet.

## Example Code Snippet

Here is a simplified example demonstrating how a player might check their encrypted objective:

```solidity
pragma solidity ^0.8.0;

import "./zama-fhe-sdk.sol";

contract Werewolf_FHE_Objectives {
    struct Player {
        address playerAddress;
        bytes32 encryptedObjective;
    }

    mapping(address => Player) public players;

    function setEncryptedObjective(bytes32 _encryptedObjective) public {
        players[msg.sender].encryptedObjective = _encryptedObjective;
    }

    function verifyObjective(address _player) public view returns (bool) {
        Player storage player = players[_player];
        // Implement homomorphic verification logic here
        return true; // Placeholder
    }

    // Additional game mechanics will be implemented here
}
```

This code structure demonstrates how players can set and verify their secret objectives securely within the game mechanics.

## Acknowledgements

**Powered by Zama**: We extend our heartfelt thanks to the Zama team for their pioneering work on Fully Homomorphic Encryption and their open-source tools that empower developers like us to create confidential and innovative blockchain applications.
