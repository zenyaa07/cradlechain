from django.contrib.auth.models import User
from django.test import TestCase
from wallets.encryption import encrypt_private_key, decrypt_private_key
from wallets.models import Wallet, DonorProfile


class EncryptionRoundTripTests(TestCase):
    def test_encrypt_then_decrypt_returns_original_key(self):
        raw_key = "0x" + "11" * 32
        token = encrypt_private_key(raw_key)
        self.assertNotEqual(token, raw_key)
        self.assertEqual(decrypt_private_key(token), raw_key)


class WalletModelTests(TestCase):
    def test_wallet_links_one_to_one_to_user(self):
        user = User.objects.create_user(username="donor@example.com", password="testpass123")
        wallet = Wallet.objects.create(user=user, address="0xabc", encrypted_private_key="token")
        self.assertEqual(user.wallet, wallet)


class DonorProfileModelTests(TestCase):
    def test_donor_profile_defaults_to_anonymous(self):
        user = User.objects.create_user(username="donor2@example.com", password="testpass123")
        profile = DonorProfile.objects.create(user=user)
        self.assertTrue(profile.is_anonymous)
        self.assertEqual(profile.display_name, "")
