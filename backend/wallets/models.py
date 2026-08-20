from django.contrib.auth.models import User
from django.db import models


class Wallet(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="wallet")
    address = models.CharField(max_length=42, unique=True)
    encrypted_private_key = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    gas_dripped_at = models.DateTimeField(null=True, blank=True)


class DonorProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="donor_profile")
    display_name = models.CharField(max_length=60, blank=True, default="")
    is_anonymous = models.BooleanField(default=True)
