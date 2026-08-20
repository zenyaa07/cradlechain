from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .models import DonorProfile, Wallet


@require_GET
def donor_labels(request):
    addresses = [a for a in request.GET.get("addresses", "").split(",") if a]
    wallets = Wallet.objects.filter(address__in=addresses).select_related("user__donor_profile")

    labels = {address: None for address in addresses}
    for wallet in wallets:
        profile = getattr(wallet.user, "donor_profile", None)
        if profile and not profile.is_anonymous and profile.display_name:
            labels[wallet.address] = profile.display_name
        else:
            labels[wallet.address] = f"Donor #{wallet.pk}"
    return JsonResponse(labels)
