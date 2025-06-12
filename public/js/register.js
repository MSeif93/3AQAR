document.addEventListener("DOMContentLoaded", () => {
  const preview = document.getElementById("preview");
  const fileInput = document.getElementById("profile_picture");

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          preview.src = e.target.result;
          preview.classList.remove("d-none");
        };
        reader.readAsDataURL(file);
      }
    });
  }

  document.getElementById("registerForm").addEventListener("submit", (e) => {
    const pass = document.getElementById("password").value;
    const confirm = document.getElementById("confirm_password").value;
    if (pass !== confirm) {
      e.preventDefault();
      alert("Passwords do not match.");
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
