import json
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from wallets.chain import rm_to_wei


@override_settings(RM_PER_POL_RATE="2.50")
class RmConversionTests(TestCase):
    def test_50_rm_converts_to_expected_wei(self):
        # 50 RM / 2.50 RM-per-POL = 20 POL
        self.assertEqual(rm_to_wei(Decimal("50")), 20 * 10**18)

    def test_rejects_non_positive_amount(self):
        with self.assertRaises(ValueError):
            rm_to_wei(Decimal("0"))


class DonateEndpointTests(TestCase):
    def setUp(self):
        self.client.post("/api/auth/signup/", data=json.dumps({"email": "spender@donor.com", "password": "testpass123"}), content_type="application/json")

    def test_donate_requires_authentication(self):
        self.client.post("/api/auth/logout/")
        response = self.client.post("/api/donate/", data=json.dumps({"campaignId": 0, "rmAmount": "50"}), content_type="application/json")
        self.assertEqual(response.status_code, 401)

    @patch("wallets.views_donate.send_donation", return_value="0xdeadbeef")
    @patch("wallets.views_donate.has_sufficient_balance", return_value=True)
    @patch("wallets.views_donate.ensure_gas", return_value=None)
    @patch("wallets.views_donate.get_web3")
    def test_donate_signs_and_sends_converted_amount(self, mock_get_web3, mock_ensure_gas, mock_has_balance, mock_send):
        response = self.client.post("/api/donate/", data=json.dumps({"campaignId": 0, "rmAmount": "50"}), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["txHash"], "0xdeadbeef")
        self.assertEqual(body["polAmount"], "20")
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        self.assertEqual(kwargs["campaign_id"], 0)
        self.assertEqual(kwargs["value_wei"], 20 * 10**18)

    @patch("wallets.views_donate.send_donation")
    @patch("wallets.views_donate.has_sufficient_balance", return_value=False)
    @patch("wallets.views_donate.ensure_gas", return_value=None)
    @patch("wallets.views_donate.get_web3")
    def test_donate_returns_insufficient_funds_without_calling_chain(self, mock_get_web3, mock_ensure_gas, mock_has_balance, mock_send):
        response = self.client.post("/api/donate/", data=json.dumps({"campaignId": 0, "rmAmount": "50"}), content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json(), {"error": "insufficient-funds"})
        mock_send.assert_not_called()
