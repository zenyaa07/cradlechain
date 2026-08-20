import json
from django.test import TestCase
from wallets.models import Wallet, DonorProfile


class SignupTests(TestCase):
    def test_signup_creates_user_wallet_and_profile(self):
        response = self.client.post(
            "/api/auth/signup/",
            data=json.dumps({"email": "new@donor.com", "password": "testpass123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["address"].startswith("0x"))
        self.assertTrue(body["isAnonymous"])
        wallet = Wallet.objects.get(user__username="new@donor.com")
        self.assertEqual(wallet.address, body["address"])
        self.assertTrue(DonorProfile.objects.filter(user=wallet.user).exists())

    def test_signup_rejects_duplicate_email(self):
        self.client.post("/api/auth/signup/", data=json.dumps({"email": "dup@donor.com", "password": "testpass123"}), content_type="application/json")
        response = self.client.post("/api/auth/signup/", data=json.dumps({"email": "dup@donor.com", "password": "testpass123"}), content_type="application/json")
        self.assertEqual(response.status_code, 409)


class LoginTests(TestCase):
    def setUp(self):
        self.client.post("/api/auth/signup/", data=json.dumps({"email": "login@donor.com", "password": "testpass123"}), content_type="application/json")
        self.client.post("/api/auth/logout/")

    def test_login_with_correct_credentials_succeeds(self):
        response = self.client.post("/api/auth/login/", data=json.dumps({"email": "login@donor.com", "password": "testpass123"}), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["address"].startswith("0x"))

    def test_login_with_wrong_password_fails(self):
        response = self.client.post("/api/auth/login/", data=json.dumps({"email": "login@donor.com", "password": "wrong"}), content_type="application/json")
        self.assertEqual(response.status_code, 401)

    def test_me_requires_authentication(self):
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)


class ProfileUpdateTests(TestCase):
    def setUp(self):
        self.client.post("/api/auth/signup/", data=json.dumps({"email": "profile@donor.com", "password": "testpass123"}), content_type="application/json")

    def test_opt_in_sets_display_name_and_clears_anonymity(self):
        response = self.client.patch(
            "/api/profile/",
            data=json.dumps({"displayName": "Aiman's Fund", "isAnonymous": False}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["displayName"], "Aiman's Fund")
        self.assertFalse(body["isAnonymous"])
