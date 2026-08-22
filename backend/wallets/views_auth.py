import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST, require_GET, require_http_methods
from eth_account import Account

from .encryption import encrypt_private_key
from .models import DonorProfile, Wallet


@require_GET
@ensure_csrf_cookie
def csrf(request):
    # get_token() also sets the csrftoken cookie (needed so the browser sends it back on the
    # next request), but the cookie is scoped to this API's own domain — cross-site JS on the
    # Vercel frontend can't read it via document.cookie. Returning the value in the body too
    # is what lets the frontend actually put it in the X-CSRFToken header.
    return JsonResponse({"csrfToken": get_token(request)})


@require_POST
def signup(request):
    payload = json.loads(request.body)
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    if not email or len(password) < 8:
        return JsonResponse({"error": "invalid-input"}, status=400)

    account = Account.create()
    try:
        user = User.objects.create_user(username=email, email=email, password=password)
    except IntegrityError:
        return JsonResponse({"error": "email-taken"}, status=409)

    Wallet.objects.create(
        user=user,
        address=account.address,
        encrypted_private_key=encrypt_private_key(account.key.hex()),
    )
    DonorProfile.objects.create(user=user)

    login(request, user)
    return JsonResponse({"address": account.address, "isAnonymous": True}, status=201)


@require_POST
def login_view(request):
    payload = json.loads(request.body)
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    user = authenticate(request, username=email, password=password)
    if user is None:
        return JsonResponse({"error": "invalid-credentials"}, status=401)
    login(request, user)
    wallet = Wallet.objects.get(user=user)
    profile = DonorProfile.objects.get(user=user)
    return JsonResponse({"address": wallet.address, "isAnonymous": profile.is_anonymous}, status=200)


@require_POST
def logout_view(request):
    logout(request)
    return JsonResponse({})


@require_GET
def me(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "not-authenticated"}, status=401)
    wallet = Wallet.objects.get(user=request.user)
    profile = DonorProfile.objects.get(user=request.user)
    return JsonResponse({"address": wallet.address, "isAnonymous": profile.is_anonymous, "displayName": profile.display_name})


@require_http_methods(["PATCH"])
def update_profile(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "not-authenticated"}, status=401)
    payload = json.loads(request.body)
    profile = DonorProfile.objects.get(user=request.user)
    if "displayName" in payload:
        profile.display_name = str(payload["displayName"])[:60]
    if "isAnonymous" in payload:
        profile.is_anonymous = bool(payload["isAnonymous"])
    profile.save()
    return JsonResponse({"displayName": profile.display_name, "isAnonymous": profile.is_anonymous})
