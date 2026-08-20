#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# circomlib/snarkjs (devDependencies) are used only under zk/ — isolated PoC, never
# imported by CradleChain.sol or the main donate/checkpoint/release flow.

# circom 2.x has no npm package; on this dev machine the compiler binary was downloaded
# from https://github.com/iden3/circom/releases and placed in zk/bin (gitignored, not
# committed). Prepend it to PATH so `circom` below resolves whether or not it's globally
# installed elsewhere.
export PATH="$(pwd)/bin:$PATH"

mkdir -p build
circom circuits/membership.circom --r1cs --wasm --sym -o build

# Powers of Tau — reused generic ceremony output, fine for a demo PoC (not a production
# trusted setup). 12 supports up to 2^12 constraints, comfortably above this circuit's size.
if [ ! -f build/pot12_final.ptau ]; then
  npx snarkjs powersoftau new bn128 12 build/pot12_0000.ptau -v
  npx snarkjs powersoftau contribute build/pot12_0000.ptau build/pot12_0001.ptau --name="cradlechain zk poc" -v -e="cradlechain-poc-entropy"
  # phase2 preparation is required before groth16 setup can consume the ptau file
  npx snarkjs powersoftau prepare phase2 build/pot12_0001.ptau build/pot12_final.ptau -v
fi

npx snarkjs groth16 setup build/membership.r1cs build/pot12_final.ptau build/membership_0000.zkey
npx snarkjs zkey contribute build/membership_0000.zkey build/membership.zkey --name="cradlechain zk poc contributor" -v -e="cradlechain-poc-contribution"
npx snarkjs zkey export verificationkey build/membership.zkey build/verification_key.json

# Regenerates the committed verifier contract from this run's zkey. The committed
# contracts/MembershipVerifier.sol is meant to always be the output of this script —
# it must never be hand-edited or allowed to drift from the zkey it verifies against.
npx snarkjs zkey export solidityverifier build/membership.zkey contracts/MembershipVerifier.sol

echo "ZK PoC build complete: build/membership.wasm, build/membership.zkey, build/verification_key.json, contracts/MembershipVerifier.sol"
