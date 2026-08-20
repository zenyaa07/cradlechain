from cryptography.fernet import Fernet
from django.conf import settings


def _cipher():
    key = settings.WALLET_ENCRYPTION_KEY
    if isinstance(key, str):
        key = key.encode()
    return Fernet(key)


def encrypt_private_key(raw_hex_key: str) -> str:
    return _cipher().encrypt(raw_hex_key.encode()).decode()


def decrypt_private_key(token: str) -> str:
    return _cipher().decrypt(token.encode()).decode()
