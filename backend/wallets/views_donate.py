import json
import logging
from decimal import Decimal, InvalidOperation
from django.http import JsonResponse
from django.views.decorators.debug import sensitive_variables
from django.views.decorators.http import require_POST

from .chain import ensure_gas, get_web3, has_sufficient_balance, rm_to_wei, send_donation
from .encryption import decrypt_private_key
from .models import Wallet

logger = logging.getLogger(__name__)


@require_POST
@sensitive_variables("private_key")
def donate(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "not-authenticated"}, status=401)

    payload = json.loads(request.body)
    try:
        campaign_id = int(payload["campaignId"])
        rm_amount = Decimal(str(payload["rmAmount"]))
        value_wei = rm_to_wei(rm_amount)
    except (KeyError, InvalidOperation, ValueError):
        return JsonResponse({"error": "invalid-input"}, status=400)

    wallet = Wallet.objects.get(user=request.user)

    try:
        w3 = get_web3()
        ensure_gas(w3, wallet, value_wei=value_wei)
        if not has_sufficient_balance(w3, wallet.address, value_wei):
            return JsonResponse({"error": "insufficient-funds"}, status=400)

        private_key = decrypt_private_key(wallet.encrypted_private_key)
        tx_hash = send_donation(w3, private_key, campaign_id=campaign_id, value_wei=value_wei)
    except Exception:
        logger.exception("donate failed for user %s", request.user.pk)
        return JsonResponse({"error": "donate-failed"}, status=502)

    pol_amount = (value_wei / Decimal(10**18)).normalize()
    return JsonResponse({"txHash": tx_hash, "polAmount": format(pol_amount, "f")})
