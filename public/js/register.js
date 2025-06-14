document.addEventListener("DOMContentLoaded", () => {
  const preview = document.getElementById("preview");
  const fileInput = document.getElementById("profile_picture");
  const registerForm = document.getElementById("registerForm");

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.src = e.target.result;
          preview.classList.remove("d-none");
        };
        reader.readAsDataURL(file);
      } else {
        preview.classList.add("d-none");
        preview.src = "";
      }
    });
  }

  const showError = (message) => {
    let existingAlert = document.getElementById("clientErrorAlert");
    if (!existingAlert) {
      existingAlert = document.createElement("div");
      existingAlert.id = "clientErrorAlert";
      existingAlert.className = "alert alert-danger mt-3";
      registerForm.prepend(existingAlert);
    }
    existingAlert.innerHTML = `<strong>Error:</strong> ${message}`;
  };

  registerForm.addEventListener("submit", (e) => {
    const pass = document.getElementById("password").value;
    const confirm = document.getElementById("confirm_password").value;
    if (pass !== confirm) {
      e.preventDefault();
      showError("Passwords do not match.");
    }
  });

  document.querySelectorAll(".toggle-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      if (input.type === "password") {
        input.type = "text";
        button.textContent = "Hide";
      } else {
        input.type = "password";
        button.textContent = "Show";
      }
    });
  });
});
