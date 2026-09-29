const statusText = document.querySelector("#connection-status");
const statusIndicator = document.querySelector("#status-indicator");

async function checkBackend() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Backend returned an error");

    const result = await response.json();
    statusText.textContent = `Connected${result.message ? `: ${result.message}` : ""}`;
    statusIndicator.classList.add("is-online");
  } catch {
    statusText.textContent = "Not connected. Start the backend and refresh this page.";
    statusIndicator.classList.add("is-offline");
  }
}

checkBackend();