pragma circom 2.1.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

// Proves "I know a secret whose Poseidon hash is a leaf in this Merkle-style membership
// set" without revealing which leaf — a Semaphore-style group-membership claim, not a
// full shielded-transfer circuit. depth=4 supports up to 16 registered donors, enough
// for a demo-scale proof-of-concept; a production version would need a much deeper tree
// and a real incremental Merkle tree contract, both explicitly out of scope here.
template MembershipProof(depth) {
    signal input secret;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== secret;

    signal levelHashes[depth + 1];
    levelHashes[0] <== leafHasher.out;

    component hashers[depth];
    component selectors[depth];
    for (var i = 0; i < depth; i++) {
        selectors[i] = IsEqual();
        selectors[i].in[0] <== pathIndices[i];
        selectors[i].in[1] <== 1;

        hashers[i] = Poseidon(2);
        // pathIndices[i] == 0 -> current node is the left leaf; == 1 -> current node is the right leaf
        hashers[i].inputs[0] <== levelHashes[i] + selectors[i].out * (pathElements[i] - levelHashes[i]);
        hashers[i].inputs[1] <== pathElements[i] + selectors[i].out * (levelHashes[i] - pathElements[i]);
        levelHashes[i + 1] <== hashers[i].out;
    }

    root <== levelHashes[depth];
}

component main = MembershipProof(4);
