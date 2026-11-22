# Shopee Order Retreiver

Retrieve Shopee order history from the browser, sanitize it into a clean JSON format, and sync orders to Google Calendar via an n8n webhook workflow.

Tested on Shopee VN (Vietnam) website.

## Setup

```bash
bun install
```

## Usage

### 1. Capture orders from Shopee

1. Open your Shopee **My Purchase** page in the browser and open DevTools Console.
2. Paste and run the contents of `src/injector.js`.
3. Scroll through your order history to intercept `/api/v4/order/get_all_order_and_checkout_list` responses until the end of the list is reached.
4. Run `download_json()` in the console and save the file to `input/orders.json`.

### 2. Sanitize orders

```bash
bun run src/sanitize.js
```

Reads `input/orders.json` and exports the sanitized array to `output/orders_sanitized.json` (including normalized VND prices, discount percentages, product links, `status`, `time_purchased`, and `time_delivered`).

### 3 (Optional). Push orders to n8n

Ensure the **Shopee Order Tracker** workflow (you create this in n8n) is running in n8n (listening on `POST /webhook/shopee-orders`), then push the sanitized orders:

```bash
# Production webhook (workflow must be published/active)
bun run src/push-to-n8n.js

# Test webhook (click "Listen for test event" in n8n first)
bun run src/push-to-n8n.js --test
```

You can override the target URL with `N8N_WEBHOOK_URL` if n8n is not running on `http://localhost:5678`.
