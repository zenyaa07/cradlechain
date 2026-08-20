from django.urls import path
from . import views_auth, views_donate, views_labels

urlpatterns = [
    path("auth/csrf/", views_auth.csrf),
    path("auth/signup/", views_auth.signup),
    path("auth/login/", views_auth.login_view),
    path("auth/logout/", views_auth.logout_view),
    path("auth/me/", views_auth.me),
    path("profile/", views_auth.update_profile),
    path("donate/", views_donate.donate),
    path("donor-labels/", views_labels.donor_labels),
]
