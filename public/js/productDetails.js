document
  .querySelector('form[action="/product/<%= product.id %>/bid"]')
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = event.target;
    const bidAmount = form.bid.value;

    try {
      const formData = new URLSearchParams();
      formData.append("bid", bidAmount);

      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.message || "Error: Failed to submit bid");
        return;
      }

      alert("Bid submitted successfully!");
      form.reset();
      location.reload();
    } catch (err) {
      alert("Network error. Please try again.");
      console.error(err);
    }
  });
