import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const INPUT_PATH = path.join(ROOT_DIR, "output", "orders_sanitized.json");
const WEBHOOK_PATH = process.argv.includes("--test")
  ? "http://localhost:5678/webhook-test/shopee-orders"
  : "http://localhost:5678/webhook/shopee-orders";
const TARGET_URL = process.env.N8N_WEBHOOK_URL || WEBHOOK_PATH;

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const orders = JSON.parse(raw);

  if (!Array.isArray(orders)) {
    throw new Error(`Expected an array in ${INPUT_PATH}`);
  }

  const res = await fetch(TARGET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orders }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${TARGET_URL}: ${text}`);
  }

  console.log(`Sent ${orders.length} orders to ${TARGET_URL}`);
  console.log("Response:", text || "(empty)");
}

main().catch((err) => {
  console.error("Failed to push orders to n8n:", err);
  process.exit(1);
});
