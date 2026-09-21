const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "fleet_status.json");

function parseFuelPercentage(value) {
  if (typeof value !== "string") {
    return NaN;
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) : NaN;
}

function getUrgencyTags(vehicle) {
  const tags = [];

  if (Number(vehicle.overdue_hours) > 0) {
    tags.push("🚨 OVERDUE");
  }

  const fuelLevel = parseFuelPercentage(vehicle.fuel_level);

  if (vehicle.status === "rented" && fuelLevel < 20) {
    tags.push("⚠️ LOW FUEL");
  }

  return tags;
}

function shouldAlert(vehicle) {
  const overdue = Number(vehicle.overdue_hours) > 0;
  const fuelLevel = parseFuelPercentage(vehicle.fuel_level);
  const lowFuelWhileRented =
    vehicle.status === "rented" && fuelLevel < 20;

  return overdue || lowFuelWhileRented;
}

function loadFleetStatus() {
  let raw;

  try {
    raw = fs.readFileSync(inputPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read fleet_status.json: ${error.message}`);
  }

  try {
    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      throw new Error("fleet_status.json must contain a JSON array.");
    }

    return data;
  } catch (error) {
    throw new Error(`Invalid fleet_status.json: ${error.message}`);
  }
}

function formatAlert(vehicle) {
  const tags = getUrgencyTags(vehicle);

  return [
    `${tags.join(" | ")}`,
    `Plate: ${vehicle.plate}`,
    `Model: ${vehicle.model}`,
    `Status: ${vehicle.status}`,
    `Fuel: ${vehicle.fuel_level}`,
    `Overdue: ${vehicle.overdue_hours} hour(s)`
  ].join("\n");
}

function main() {
  const fleet = loadFleetStatus();
  const alerts = fleet.filter(shouldAlert);

  console.log("=== EASY RENT BALI — FLEET OPERATIONS ALERT ===");

  if (alerts.length === 0) {
    console.log("No vehicles require immediate operational attention.");
    return;
  }

  for (const vehicle of alerts) {
    console.log("\n" + formatAlert(vehicle));
  }

  console.log(`\nTotal alerts: ${alerts.length}`);
}

main();
