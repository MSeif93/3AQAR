document.addEventListener("DOMContentLoaded", () => {
  const totalPhotos = 3; // can be adjusted based on the number of photo inputs
  for (let i = 1; i <= totalPhotos; i++) {
    const input = document.getElementById(`photo${i}`);
    const preview = document.getElementById(`preview${i}`);

    if (input && preview) {
      input.addEventListener("change", (event) => {
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
  }
});
