from django.urls import path

from jobapp.views import JobApplicationView

urlpatterns = [
    path("api/application/", JobApplicationView.as_view()),
]
