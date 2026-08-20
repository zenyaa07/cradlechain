import json
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from django.views.decorators.debug import sensitive_variables
from eth_account import Account
from web3 import Web3


def get_web3() -> Web3:
    return Web3(Web3.HTTPProvider(settings.AMOY_RPC_URL))


def get_contract(w3: Web3):
    with open(settings.CONTRACT_DEPLOYMENT_PATH) as f:
        deployment = json.load(f)
    return w3.eth.contract(address=deployment["address"], abi=deployment["abi"])


def rm_to_wei(rm_amount: Decimal) -> int:
    if rm_amount <= 0:
        raise ValueError("rm-amount-must-be-positive")
    rate = Decimal(settings.RM_PER_POL_RATE)
    pol_amount = rm_amount / rate
    return int(pol_amount * Decimal(10**18))


def ensure_gas(w3: Web3, wallet, value_wei: int = 0) -> None:
    needed = value_wei + settings.GAS_DRIP_FLOOR_WEI
    balance = w3.eth.get_balance(wallet.address)
    if wallet.gas_dripped_at is not None and balance >= needed:
        return
    shortfall = needed - balance
    if shortfall <= 0:
        return
    relayer = Account.from_key(settings.RELAYER_PRIVATE_KEY)
    tx = {
        "from": relayer.address,
        "to": wallet.address,
        "value": shortfall,
        "nonce": w3.eth.get_transaction_count(relayer.address),
        "gas": 21000,
        "gasPrice": w3.eth.gas_price,
        "chainId": w3.eth.chain_id,
    }
    signed = relayer.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash)
    wallet.gas_dripped_at = timezone.now()
    wallet.save(update_fields=["gas_dripped_at"])


def has_sufficient_balance(w3: Web3, address: str, value_wei: int) -> bool:
    # GAS_DRIP_FLOOR_WEI already sizes a safe gas buffer for the contract call
    return w3.eth.get_balance(address) >= value_wei + settings.GAS_DRIP_FLOOR_WEI


@sensitive_variables("private_key")
def send_donation(w3: Web3, private_key: str, campaign_id: int, value_wei: int) -> str:
    account = Account.from_key(private_key)
    contract = get_contract(w3)
    tx = contract.functions.donate(campaign_id).build_transaction({
        "from": account.address,
        "value": value_wei,
        "nonce": w3.eth.get_transaction_count(account.address),
        "gasPrice": w3.eth.gas_price,
        "chainId": w3.eth.chain_id,
    })
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    return tx_hash.hex()
