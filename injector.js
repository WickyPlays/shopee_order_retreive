(function () {
  const TARGET_PATH = "/api/v4/order/get_all_order_and_checkout_list";

  const orders = [];
  window.orders = orders;

  // Track already-seen next_offset values
  const seenOffsets = new Set();

  function processPayload(source, url, status, bodyText) {
    if (!url || !url.includes(TARGET_PATH)) return;

    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (_) {
      return; // Ignore non-JSON responses
    }

    const newData = data?.new_data;
    if (!newData || typeof newData !== "object") return;

    const nextOffset = newData.next_offset;
    const batch = newData.order_or_checkout_data;

    // Skip if this next_offset has already been processed
    if (seenOffsets.has(nextOffset)) {
      console.log(`[${source}] Skipping duplicate batch with next_offset:`, nextOffset);
      return;
    }

    // Record offset even if batch is empty so re-invoking the same offset is skipped
    seenOffsets.add(nextOffset);

    if (Array.isArray(batch)) {
      orders.push(...batch);
      console.log(
        `[${source}] Added ${batch.length} item(s) (next_offset: ${nextOffset}). Total orders: ${orders.length}`
      );
    } else {
      console.log(
        `[${source}] Processed next_offset: ${nextOffset}, but order_or_checkout_data is not an array.`
      );
    }
  }

  // 1. Intercept fetch()
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const input = args[0];
    const url = typeof input === "string" ? input : input?.url || "";
    const response = await originalFetch.apply(this, args);

    if (url.includes(TARGET_PATH)) {
      response
        .clone()
        .text()
        .then((text) => processPayload("fetch", url, response.status, text))
        .catch((err) => console.error("Error reading fetch response:", err));
    }

    return response;
  };

  // 2. Intercept XMLHttpRequest (covers XHR and Axios)
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._interceptedUrl = typeof url === "string" ? url : url?.toString() || "";
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this._interceptedUrl && this._interceptedUrl.includes(TARGET_PATH)) {
      this.addEventListener("load", function () {
        processPayload("xhr", this._interceptedUrl, this.status, this.responseText);
      });
    }
    return originalSend.apply(this, args);
  };

  // Global export helper: call download_json() anytime from the console
  window.download_json = function (filename = "orders.json") {
    const jsonString = JSON.stringify(orders, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Clean up object URL after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    console.log(`Exported ${orders.length} order(s) to ${filename}`);
  };
})();