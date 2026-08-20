import json
from django.test import TestCase


class DonorLabelsTests(TestCase):
    def setUp(self):
        signup = self.client.post("/api/auth/signup/", data=json.dumps({"email": "named@donor.com", "password": "testpass123"}), content_type="application/json")
        self.named_address = signup.json()["address"]
        self.client.patch("/api/profile/", data=json.dumps({"displayName": "Aiman's Fund", "isAnonymous": False}), content_type="application/json")
        self.client.post("/api/auth/logout/")

        signup2 = self.client.post("/api/auth/signup/", data=json.dumps({"email": "anon@donor.com", "password": "testpass123"}), content_type="application/json")
        self.anon_address = signup2.json()["address"]

    def test_opted_in_address_returns_display_name(self):
        response = self.client.get(f"/api/donor-labels/?addresses={self.named_address},{self.anon_address}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body[self.named_address], "Aiman's Fund")

    def test_anonymous_address_returns_stable_pseudonym_not_email(self):
        response = self.client.get(f"/api/donor-labels/?addresses={self.anon_address}")
        label = response.json()[self.anon_address]
        self.assertTrue(label.startswith("Donor #"))
        self.assertNotIn("anon@donor.com", label)

    def test_unknown_address_falls_back_to_none(self):
        response = self.client.get("/api/donor-labels/?addresses=0xunknown0000000000000000000000000000000000")
        self.assertIsNone(response.json()["0xunknown0000000000000000000000000000000000"])
